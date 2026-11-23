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
import { aiProviderChain, getAiBlock, getEnv, setAiBlock, type AiProviderEntry } from './env';
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

const G = globalThis as unknown as { __celeberAnthropic?: { key: string; client: Anthropic } };

/** Anthropic 클라이언트 (키 없거나 강제 Mock이면 null) */
export function getAnthropic(): Anthropic | null {
  const env = getEnv();
  if (env.forceMock || !env.anthropicApiKey) return null;
  if (G.__celeberAnthropic?.key === env.anthropicApiKey) return G.__celeberAnthropic.client;
  const client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 180_000, maxRetries: 2 });
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
}

async function callAnthropic<T>(p: AiProviderEntry, { opts, system, images, effort }: ProviderCall<T>): Promise<VisionResult<T>> {
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
  const response = await client.beta.messages.parse({
    model: p.model,
    max_tokens: opts.maxTokens ?? 16000,
    system,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: opts.prompt }] }],
    output_config: { effort, format: betaZodOutputFormat(opts.schema as never) },
    ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });

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
  ) {
    super(message);
  }
}

/** OpenAI strict 구조화 출력 조건: 모든 객체가 additionalProperties:false이고 모든 속성이 required */
export function isOpenAiStrictSchema(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(isOpenAiStrictSchema);
  if (!node || typeof node !== 'object') return true;
  const o = node as Record<string, unknown>;
  if (o.properties && typeof o.properties === 'object') {
    const keys = Object.keys(o.properties);
    const req = Array.isArray(o.required) ? o.required : [];
    if (o.additionalProperties !== false || !keys.every((k) => req.includes(k))) return false;
  }
  return Object.values(o).every(isOpenAiStrictSchema);
}

interface OpenAiResponse {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { message?: string; code?: string; type?: string } | null;
}

async function callOpenAi<T>(p: AiProviderEntry, { opts, system, images, effort }: ProviderCall<T>): Promise<VisionResult<T>> {
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
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.apiKey}`, 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(180_000),
    });
    json = (await res.json().catch(() => null)) as OpenAiResponse | null;
    const retryable = res.status >= 500 || (res.status === 429 && json?.error?.code !== 'insufficient_quota');
    if (!retryable) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!res || !res.ok || !json) {
    throw new OpenAiApiError(res?.status ?? 0, json?.error?.code ?? json?.error?.type ?? null, json?.error?.message ?? `HTTP ${res?.status ?? 0}`);
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
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return msg;
  if (e instanceof Anthropic.BadRequestError && /usage limit/i.test(e.message)) return 'API 사용 한도 초과';
  if (e instanceof OpenAiApiError) {
    if (e.status === 401 || e.status === 403) return msg;
    if (e.code === 'insufficient_quota') return 'API 사용 한도 초과';
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
  const fallbackOnError = opts.fallbackOnError ?? true;
  const live = chain.filter((p) => !getAiBlock(p.id));
  if (!live.length) {
    const reason = getAiBlock(chain[0].id)?.reason ?? '';
    if (!fallbackOnError) throw new AiOutputError(`AI 일시 중단: ${reason}`, null);
    return { data: await resolveMock(opts.mock), source: 'mock', model: chain[0].model, warning: `AI 분석을 사용할 수 없어 데모 데이터를 표시합니다: ${reason}` };
  }
  const label = opts.label ?? 'callVisionStructured';
  let lastError: unknown;
  let lastModel = live[0].model;
  try {
    const images: PreparedImage[] = [];
    for (const img of opts.images ?? []) images.push(await prepareImage(img, opts.maxImageEdge ?? 1568));
    const call: ProviderCall<T> = { opts, images, system: [IDENTITY_POLICY, opts.system].filter(Boolean).join('\n\n'), effort: opts.effort ?? env.visionEffort };
    for (const p of live) {
      lastModel = p.model;
      try {
        return p.id === 'anthropic' ? await callAnthropic(p, call) : await callOpenAi(p, call);
      } catch (e) {
        lastError = e;
        // 화면에는 짧은 한국어 요약만 내보내고, 원본 오류(요청 ID·JSON 본문 포함)는 서버 로그에만 남긴다.
        const msg = describeAiError(e);
        // 재시도해도 실패할 오류는 그 공급자를 10분간 건너뛴다
        const reason = blockReason(e, msg);
        if (reason) setAiBlock(reason, undefined, p.id);
        console.error(`[celeber/ai] ${label} ${p.id}(${p.model}) 실패:`, msg, '|', (e as Error)?.message ?? e);
      }
    }
  } catch (e) {
    // 이미지 준비 실패 등 공급자와 무관한 오류
    lastError = e;
    console.error(`[celeber/ai] ${label} 실패:`, describeAiError(e), '|', (e as Error)?.message ?? e);
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
  if (e instanceof Anthropic.AuthenticationError) return 'API 키 인증 실패';
  if (e instanceof Anthropic.PermissionDeniedError) return 'API 권한 없음';
  if (e instanceof Anthropic.NotFoundError) return '모델을 찾을 수 없음 (CELEBER_VISION_MODEL 확인)';
  if (e instanceof Anthropic.RateLimitError) return '요청 한도 초과 (잠시 후 다시 시도)';
  if (e instanceof Anthropic.BadRequestError) return /usage limit/i.test(e.message) ? 'API 사용 한도 초과' : '잘못된 요청 (서버 로그 확인)';
  if (e instanceof Anthropic.APIConnectionError) return 'API 연결 실패';
  if (e instanceof Anthropic.APIError) return `API 오류 ${e.status ?? ''}`.trim();
  if (e instanceof OpenAiApiError) {
    if (e.status === 401) return 'API 키 인증 실패';
    if (e.status === 403) return 'API 권한 없음';
    if (e.status === 404) return '모델을 찾을 수 없음 (CELEBER_OPENAI_MODEL 확인)';
    if (e.status === 429) return e.code === 'insufficient_quota' ? 'API 사용 한도 초과' : '요청 한도 초과 (잠시 후 다시 시도)';
    if (e.status === 400) return '잘못된 요청 (서버 로그 확인)';
    return e.status ? `API 오류 ${e.status}` : 'API 연결 실패';
  }
  if ((e as Error)?.name === 'TimeoutError') return 'API 응답 시간 초과';
  // SDK 밖의 오류(이미지 읽기 실패 등)도 화면에는 첫 줄 120자만
  const raw = (e as Error)?.message ?? String(e);
  return raw.split('\n')[0].slice(0, 120);
}
