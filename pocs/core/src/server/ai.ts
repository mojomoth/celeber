/**
 * AI 비전 + 구조화 출력 클라이언트. 공급자 순서: Anthropic → OpenAI → Mock (CELEBER_AI_PROVIDER로 하나만 고를 수 있다)
 * - Anthropic: CELEBER_VISION_MODEL (기본 claude-opus-5-5). client.beta.messages.parse + betaZodOutputFormat → zod 재검증.
 *   거절(stop_reason 'refusal') 대비 서버측 fallbacks: 'default' (지원 모델에서만)
 * - OpenAI: CELEBER_OPENAI_MODEL (기본 gpt-6.2-sol). Responses API + json_schema. 같은 zod 스키마·프롬프트를 쓴다
 * - effort: CELEBER_VISION_EFFORT (기본 medium), 두 공급자 공통
 * - 앞 공급자가 실패하면 다음 공급자로, 모두 실패하거나 키가 없으면(또는 CELEBER_FORCE_MOCK=1) mock 값 → source:'mock' + warning
 * 정책: 얼굴 특징만으로 실존 인물을 식별하지 않는다 (IDENTITY_POLICY가 모든 system 프롬프트에 붙는다).
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import sharp from 'sharp';
import type { z } from 'zod';
import { aiBlockedSummary, aiProviderChain, getAiBlock, getEnv, setAiBlock, type AiProviderEntry } from './env';
import { readUpload } from './uploads';

/** 모든 비전 호출에 붙는 신원 판단 금지 정책 */
export const IDENTITY_POLICY = [
  '사진 속 인물이 누구인지 얼굴 특징으로 식별하거나 추측하지 마세요. 이름, 신원, 유명인 여부를 판단하지 않습니다.',
  '사용자가 이름을 알려준 경우에도 그 이름은 메타데이터로만 취급하고, 얼굴로 일치 여부를 검증하지 마세요.',
  '관찰 가능한 시각 정보(색, 조명, 의상, 헤어스타일, 구도, 분위기)만 서술하세요.',
  '모든 서술은 한국어로, 과장 없이 짧고 구체적으로 작성하세요. 이모지를 쓰지 마세요.',
].join('\n');

/** 서버측 fallbacks 'default'를 지원하는 모델 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1']);

/** 공급자 한 곳에 쓰는 최대 시간 (재시도·본문 읽기 포함) */
export const AI_PROVIDER_TIMEOUT_MS = 90_000;
/** 체인 전체 마감. 앱 라우트 maxDuration(300초)보다 짧게 두어 Mock 응답까지 시간 안에 끝낸다 */
export const AI_CHAIN_DEADLINE_MS = 240_000;
/** 남은 시간이 이보다 적으면 다음 공급자를 부르지 않고 Mock으로 넘긴다 */
const MIN_PROVIDER_MS = 5_000;

/** 마감 시간 초과 오류 (fetch·SDK가 signal.reason으로 그대로 던진다) */
function timeoutError(): Error {
  return Object.assign(new Error('AI 응답 시간 초과'), { name: 'TimeoutError' });
}

/** ms 뒤 abort되는 signal. AbortSignal.timeout 대신 setTimeout을 써서 테스트의 가짜 타이머를 따른다 */
function deadlineSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(timeoutError()), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

/** signal이 abort되면 p를 기다리지 않고 바로 실패시킨다 (본문 스트림이 signal을 따르지 않아도 멈추지 않게) */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** 서버 로그에 남기기 전 키 모양 문자열(sk-...)을 가린다 */
function redactKeys(s: string): string {
  return s.replace(/sk-[A-Za-z0-9_*-]+/g, 'sk-***');
}

const G = globalThis as unknown as { __celeberAnthropic?: { key: string; client: Anthropic } };

/** Anthropic 클라이언트 (키 없거나 강제 Mock이면 null) */
export function getAnthropic(): Anthropic | null {
  const env = getEnv();
  if (env.forceMock || !env.anthropicApiKey) return null;
  if (G.__celeberAnthropic?.key === env.anthropicApiKey) return G.__celeberAnthropic.client;
  const client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: AI_PROVIDER_TIMEOUT_MS, maxRetries: 1 });
  G.__celeberAnthropic = { key: env.anthropicApiKey, client };
  return client;
}

export type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** 비전 입력 이미지 */
export type VisionImage =
  | { uploadId: string; label?: string }
  | { base64: string; mediaType: VisionMediaType; label?: string }
  | { buffer: Buffer; label?: string }
  /** 공개 https URL (Claude 서버가 직접 가져감). 로컬/사설 URL 금지 */
  | { url: string; label?: string };

export interface CallVisionOptions<T> {
  /** 출력 스키마. AI용은 단순하게(중첩 얕게, default/transform/refine 없이) 정의할 것 */
  schema: z.ZodType<T>;
  /** 키 없음/실패 시 사용할 결정적 Mock 값 또는 생성 함수 */
  mock: T | (() => T | Promise<T>);
  /** 작업별 system 지시 (IDENTITY_POLICY가 앞에 자동 추가) */
  system?: string;
  /** 사용자 메시지 텍스트 (측정값 JSON 등 포함) */
  prompt: string;
  images?: VisionImage[];
  /** 기본 16000 */
  maxTokens?: number;
  /** 기본 env CELEBER_VISION_EFFORT */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** 이미지 긴 변 리사이즈 상한(px), 기본 1568 */
  maxImageEdge?: number;
  /** 로그 라벨 */
  label?: string;
  /** 실패 시 mock 폴백 (기본 true). false면 예외 */
  fallbackOnError?: boolean;
}

export interface VisionResult<T> {
  data: T;
  /** 'ai' = AI 공급자 응답(model로 구분), 'mock' = Mock(키 없음 또는 실패 폴백) */
  source: 'ai' | 'mock';
  model: string | null;
  /** 폴백 사유 등 (사용자 표시 가능 한국어) */
  warning?: string;
  stopReason?: string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

async function resolveMock<T>(mock: CallVisionOptions<T>['mock']): Promise<T> {
  return typeof mock === 'function' ? await (mock as () => T | Promise<T>)() : mock;
}

type PreparedImage = { label?: string } & ({ url: string } | { jpegBase64: string });

/** 이미지 → 공개 URL 그대로 또는 base64 JPEG (리사이즈). 공급자마다 블록 모양만 다르다 */
async function prepareImage(img: VisionImage, maxEdge: number): Promise<PreparedImage> {
  if ('url' in img) return { url: img.url, label: img.label };
  let buf: Buffer;
  if ('uploadId' in img) {
    const f = readUpload(img.uploadId);
    if (!f) throw new Error(`업로드 이미지를 찾을 수 없습니다: ${img.uploadId}`);
    buf = f.buffer;
  } else if ('buffer' in img) buf = img.buffer;
  else buf = Buffer.from(img.base64, 'base64');
  const out = await sharp(buf, { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { jpegBase64: out.toString('base64'), label: img.label };
}

interface ProviderCall<T> {
  opts: CallVisionOptions<T>;
  system: string;
  images: PreparedImage[];
  effort: NonNullable<CallVisionOptions<T>['effort']>;
  /** 이 공급자 호출의 마감 (요청·재시도·본문 읽기 전체) */
  signal: AbortSignal;
}

async function callAnthropic<T>(p: AiProviderEntry, { opts, system, images, effort, signal }: ProviderCall<T>): Promise<VisionResult<T>> {
  const client = getAnthropic();
  if (!client) throw new Error('Anthropic 클라이언트 없음');
  const imageBlocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (const [i, img] of images.entries()) {
    if (img.label) imageBlocks.push({ type: 'text', text: `[이미지 ${i + 1}] ${img.label}` });
    imageBlocks.push({
      type: 'image',
      source: 'url' in img ? { type: 'url', url: img.url } : { type: 'base64', media_type: 'image/jpeg', data: img.jpegBase64 },
    });
  }
  const useFallbacks = FALLBACK_MODELS.has(p.model);
  const request = client.beta.messages.parse(
    {
      model: p.model,
      max_tokens: opts.maxTokens ?? 16000,
      system,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: opts.prompt }] }],
      output_config: { effort, format: betaZodOutputFormat(opts.schema as never) },
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    { signal },
  );
  // SDK 타이머는 응답 헤더까지만 덮으므로, 본문 읽기까지 signal로 끊는다
  const response = await raceAbort(request, signal);

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stop_reason === 'refusal') {
    throw new AiOutputError(`모델이 요청을 거절했습니다 (${response.stop_details?.category ?? 'unknown'}).`, response.stop_reason);
  }
  if (response.stop_reason === 'max_tokens') throw new AiOutputError('응답이 max_tokens에서 잘렸습니다.', response.stop_reason);
  const checked = opts.schema.safeParse(response.parsed_output);
  if (!checked.success) throw new AiOutputError(`AI 응답이 스키마와 맞지 않습니다: ${checked.error.issues[0]?.message ?? ''}`, response.stop_reason);
  return { data: checked.data, source: 'ai', model: response.model, stopReason: response.stop_reason, usage };
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** OpenAI API 오류 (상태코드와 오류 코드만 보관) */
export class OpenAiApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly type: string | null = null,
  ) {
    super(message);
  }
}

/** OpenAI 사용 한도(결제) 소진: code 또는 type이 insufficient_quota */
function isOpenAiQuota(e: OpenAiApiError): boolean {
  return e.code === 'insufficient_quota' || e.type === 'insufficient_quota';
}

/** OpenAI strict 구조화 출력 조건: 모든 객체가 additionalProperties:false이고 모든 속성이 required */
export function isOpenAiStrictSchema(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(isOpenAiStrictSchema);
  if (!node || typeof node !== 'object') return true;
  const o = node as Record<string, unknown>;
  return Object.entries(o).every(([k, v]) => {
    // properties는 '필드 이름 → 스키마' 맵이다. 맵 자체를 스키마로 보지 않고 값만 재귀한다
    if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      const req = Array.isArray(o.required) ? o.required : [];
      if (o.additionalProperties !== false || !keys.every((key) => req.includes(key))) return false;
      return Object.values(v).every(isOpenAiStrictSchema);
    }
    return isOpenAiStrictSchema(v);
  });
}

interface OpenAiResponse {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { message?: string; code?: string; type?: string } | null;
}

async function callOpenAi<T>(p: AiProviderEntry, { opts, system, images, effort, signal }: ProviderCall<T>): Promise<VisionResult<T>> {
  // Anthropic과 같은 변환(zod → JSON Schema)을 재사용한다
  const schema = betaZodOutputFormat(opts.schema as never).schema as Record<string, unknown>;
  const content: Record<string, string>[] = [];
  for (const [i, img] of images.entries()) {
    if (img.label) content.push({ type: 'input_text', text: `[이미지 ${i + 1}] ${img.label}` });
    content.push({ type: 'input_image', image_url: 'url' in img ? img.url : `data:image/jpeg;base64,${img.jpegBase64}` });
  }
  content.push({ type: 'input_text', text: opts.prompt });
  const body = JSON.stringify({
    model: p.model,
    instructions: system,
    input: [{ role: 'user', content }],
    max_output_tokens: opts.maxTokens ?? 16000,
    reasoning: { effort },
    text: { format: { type: 'json_schema', name: 'celeber_output', schema, strict: isOpenAiStrictSchema(schema) } },
    store: false,
  });

  let res: Response | null = null;
  let json: OpenAiResponse | null = null;
  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const r = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.apiKey}`, 'content-type': 'application/json' },
      body,
      signal,
    });
    res = r;
    json = (await raceAbort(r.json(), signal).catch((err: unknown) => {
      // 오류 응답의 본문은 없어도 된다. 200 뒤 본문 읽기 실패는 삼키지 않는다
      if (!r.ok) return null;
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw err;
      if (name === 'SyntaxError') throw new AiOutputError('AI 응답이 JSON이 아닙니다.', null);
      throw new OpenAiApiError(0, null, `응답 본문 읽기 실패: ${(err as Error)?.message ?? String(err)}`);
    })) as OpenAiResponse | null;
    const quota = json?.error?.code === 'insufficient_quota' || json?.error?.type === 'insufficient_quota';
    const retryable = r.status >= 500 || (r.status === 429 && !quota);
    if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
    await new Promise((done) => setTimeout(done, 1500));
  }
  if (!res || !res.ok || !json) {
    throw new OpenAiApiError(res?.status ?? 0, json?.error?.code ?? json?.error?.type ?? null, json?.error?.message ?? `HTTP ${res?.status ?? 0}`, json?.error?.type ?? null);
  }

  const usage = json.usage ? { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens } : undefined;
  const parts = (json.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
  if (parts.some((c) => c.type === 'refusal')) throw new AiOutputError('모델이 요청을 거절했습니다 (refusal).', 'refusal');
  if (json.status === 'incomplete') {
    const reason = json.incomplete_details?.reason ?? 'incomplete';
    throw new AiOutputError(reason === 'max_output_tokens' ? '응답이 max_tokens에서 잘렸습니다.' : `응답이 중간에 끊겼습니다 (${reason}).`, reason);
  }
  const text = parts.filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiOutputError('AI 응답이 JSON이 아닙니다.', json.status ?? null);
  }
  const checked = opts.schema.safeParse(parsed);
  if (!checked.success) throw new AiOutputError(`AI 응답이 스키마와 맞지 않습니다: ${checked.error.issues[0]?.message ?? ''}`, json.status ?? null);
  return { data: checked.data, source: 'ai', model: json.model ?? p.model, stopReason: json.status ?? null, usage };
}

/** 재시도해도 실패할 오류(인증/권한/사용 한도)면 그 공급자를 건너뛸 사유, 아니면 null */
function blockReason(e: unknown, msg: string): string | null {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.PaymentRequiredError) return msg;
  if (e instanceof Anthropic.BadRequestError && /usage limit/i.test(e.message)) return 'API 사용 한도 초과';
  if (e instanceof OpenAiApiError) {
    if (e.status === 401 || e.status === 403) return msg;
    if (isOpenAiQuota(e)) return 'API 사용 한도 초과';
  }
  return null;
}

/**
 * 이미지(선택) + 프롬프트 → zod 스키마로 검증된 구조화 결과.
 * 키가 없으면 mock을 그대로 반환한다 (source: 'mock').
 *
 * @example
 * const r = await callVisionStructured({
 *   schema: z.object({ indoor: z.boolean(), notes: z.string() }),
 *   mock: { indoor: true, notes: '데모 데이터' },
 *   system: '환경 사진의 조명을 분석합니다.',
 *   prompt: `측정값: ${JSON.stringify(measured)}`,
 *   images: [{ uploadId }],
 * });
 */
export async function callVisionStructured<T>(opts: CallVisionOptions<T>): Promise<VisionResult<T>> {
  const env = getEnv();
  const chain = aiProviderChain(env);
  if (!chain.length) {
    // 화면용 문구에는 환경변수 이름을 넣지 않는다 (사유는 서버 로그와 허브·/api/health capabilities에서 확인)
    return { data: await resolveMock(opts.mock), source: 'mock', model: null, warning: '데모 데이터로 표시합니다 (AI 분석 미사용).' };
  }
  const deadline = Date.now() + AI_CHAIN_DEADLINE_MS;
  const fallbackOnError = opts.fallbackOnError ?? true;
  const live = chain.filter((p) => !getAiBlock(p.id));
  if (!live.length) {
    const reason = aiBlockedSummary(chain) ?? '';
    if (!fallbackOnError) throw new AiOutputError(`AI 일시 중단: ${reason}`, null);
    return { data: await resolveMock(opts.mock), source: 'mock', model: chain[0].model, warning: `AI 분석을 사용할 수 없어 데모 데이터를 표시합니다: ${reason}` };
  }
  const label = opts.label ?? 'callVisionStructured';
  let lastError: unknown;
  let lastModel = live[0].model;
  try {
    const images: PreparedImage[] = [];
    for (const img of opts.images ?? []) images.push(await prepareImage(img, opts.maxImageEdge ?? 1568));
    const base = { opts, images, system: [IDENTITY_POLICY, opts.system].filter(Boolean).join('\n\n'), effort: opts.effort ?? env.visionEffort };
    for (const p of live) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_PROVIDER_MS) {
        // 체인 마감: 남은 공급자는 부르지 않고 Mock으로
        lastError ??= timeoutError();
        console.error(`[celeber/ai] ${label} 마감 시간이 지나 ${p.id} 호출을 건너뜁니다.`);
        break;
      }
      lastModel = p.model;
      const { signal, clear } = deadlineSignal(Math.min(AI_PROVIDER_TIMEOUT_MS, remaining));
      try {
        const call: ProviderCall<T> = { ...base, signal };
        return p.id === 'anthropic' ? await callAnthropic(p, call) : await callOpenAi(p, call);
      } catch (e) {
        lastError = e;
        // 화면에는 짧은 한국어 요약만 내보내고, 원본 오류(요청 ID·JSON 본문 포함)는 서버 로그에만 남긴다.
        const msg = describeAiError(e);
        // 재시도해도 실패할 오류는 그 공급자를 10분간 건너뛴다
        const reason = blockReason(e, msg);
        if (reason) setAiBlock(reason, undefined, p.id);
        console.error(`[celeber/ai] ${label} ${p.id}(${p.model}) 실패:`, msg, '|', redactKeys(String((e as Error)?.message ?? e)));
      } finally {
        clear();
      }
    }
  } catch (e) {
    // 이미지 준비 실패 등 공급자와 무관한 오류
    lastError = e;
    console.error(`[celeber/ai] ${label} 실패:`, describeAiError(e), '|', redactKeys(String((e as Error)?.message ?? e)));
  }
  if (!fallbackOnError) throw lastError;
  return { data: await resolveMock(opts.mock), source: 'mock', model: lastModel, warning: `AI 분석 실패로 데모 데이터를 표시합니다: ${describeAiError(lastError)}` };
}

/** 이미지 없이 텍스트만 (리포트 서술 생성 등) */
export function callTextStructured<T>(opts: Omit<CallVisionOptions<T>, 'images' | 'maxImageEdge'>): Promise<VisionResult<T>> {
  return callVisionStructured(opts);
}

export class AiOutputError extends Error {
  constructor(
    message: string,
    readonly stopReason: string | null,
  ) {
    super(message);
  }
}

/** SDK 오류 → 한국어 요약 (구체적 타입부터) */
export function describeAiError(e: unknown): string {
  if (e instanceof AiOutputError) return e.message;
  // 시간 초과를 연결 실패보다 먼저 본다 (APIConnectionTimeoutError는 APIConnectionError의 하위 클래스).
  // 사용자 abort는 우리 마감 signal에서만 생기므로 시간 초과로 본다
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError || (e as Error)?.name === 'TimeoutError') {
    return 'API 응답 시간 초과';
  }
  if (e instanceof Anthropic.AuthenticationError) return 'API 키 인증 실패';
  if (e instanceof Anthropic.PermissionDeniedError) return 'API 권한 없음';
  if (e instanceof Anthropic.PaymentRequiredError) return 'API 크레딧 부족';
  if (e instanceof Anthropic.NotFoundError) return '모델을 찾을 수 없음 (CELEBER_VISION_MODEL 확인)';
  if (e instanceof Anthropic.RateLimitError) return '요청 한도 초과 (잠시 후 다시 시도)';
  if (e instanceof Anthropic.BadRequestError) return /usage limit/i.test(e.message) ? 'API 사용 한도 초과' : '잘못된 요청 (서버 로그 확인)';
  if (e instanceof Anthropic.APIConnectionError) return 'API 연결 실패';
  if (e instanceof Anthropic.APIError) return `API 오류 ${e.status ?? ''}`.trim();
  if (e instanceof OpenAiApiError) {
    if (e.status === 401) return 'API 키 인증 실패';
    if (e.status === 403) return 'API 권한 없음';
    if (e.status === 404) return '모델을 찾을 수 없음 (CELEBER_OPENAI_MODEL 확인)';
    if (e.status === 429) return isOpenAiQuota(e) ? 'API 사용 한도 초과' : '요청 한도 초과 (잠시 후 다시 시도)';
    if (e.status === 400) return '잘못된 요청 (서버 로그 확인)';
    return e.status ? `API 오류 ${e.status}` : 'API 연결 실패';
  }
  // SDK 밖의 오류(이미지 읽기 실패 등)도 화면에는 첫 줄 120자만
  const raw = (e as Error)?.message ?? String(e);
  return raw.split('\n')[0].slice(0, 120);
}
