/**
 * 서버 전용 환경변수 접근. 키 값은 절대 클라이언트로 보내지 않는다.
 * 루트 .env는 각 앱 next.config.ts에서 loadEnvConfig로 로드된다.
 */
import 'server-only';
import path from 'node:path';

export type AiProviderId = 'anthropic' | 'openai';
export type AiProviderSetting = 'auto' | AiProviderId;

export interface ServerEnv {
  /** auto = Anthropic 먼저, 실패·한도 시 OpenAI. anthropic|openai = 그 공급자만 */
  aiProvider: AiProviderSetting;
  anthropicApiKey: string | null;
  visionModel: string;
  openaiApiKey: string | null;
  openaiModel: string;
  visionEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  serpApiKey: string | null;
  naverClientId: string | null;
  naverClientSecret: string | null;
  publicBaseUrl: string | null;
  dataDir: string;
  forceMock: boolean;
}

const nonEmpty = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** 기본 모델 (claude-api 스킬 권장 최신 모델) */
export const DEFAULT_VISION_MODEL = 'claude-opus-5-5';
/** 대체 공급자 기본 모델 (Gate 0 실측에서 가장 빠른 비전 모델) */
export const DEFAULT_OPENAI_MODEL = 'gpt-6.2-sol';

export function getEnv(): ServerEnv {
  const e = process.env;
  const effort = (e.CELEBER_VISION_EFFORT ?? 'medium') as ServerEnv['visionEffort'];
  const provider = (e.CELEBER_AI_PROVIDER ?? 'auto').trim();
  return {
    aiProvider: provider === 'anthropic' || provider === 'openai' ? provider : 'auto',
    // ANTHROPIC_API_KEY 우선, CLAUDE_API_KEY는 별칭
    anthropicApiKey: nonEmpty(e.ANTHROPIC_API_KEY) ?? nonEmpty(e.CLAUDE_API_KEY),
    visionModel: nonEmpty(e.CELEBER_VISION_MODEL) ?? DEFAULT_VISION_MODEL,
    openaiApiKey: nonEmpty(e.OPENAI_API_KEY),
    openaiModel: nonEmpty(e.CELEBER_OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL,
    visionEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'medium',
    serpApiKey: nonEmpty(e.SERPAPI_API_KEY),
    naverClientId: nonEmpty(e.NAVER_CLIENT_ID),
    naverClientSecret: nonEmpty(e.NAVER_CLIENT_SECRET),
    publicBaseUrl: nonEmpty(e.CELEBER_PUBLIC_BASE_URL),
    dataDir: nonEmpty(e.CELEBER_DATA_DIR) ?? path.resolve(process.cwd(), '../.data'),
    forceMock: e.CELEBER_FORCE_MOCK === '1' || e.CELEBER_FORCE_MOCK === 'true',
  };
}

/**
 * 클라이언트에 보내도 안전한 기능 플래그 (키 값 없음).
 */
export interface Capabilities {
  /** AI 비전/서술 사용 가능 (공급자 중 하나라도 키가 있고 차단되지 않음) */
  ai: boolean;
  /** 지금 먼저 호출할 공급자 (표시용) */
  aiProvider: AiProviderId | null;
  /** 이미지 검색 프로바이더: naver > serpapi > mock */
  imageSearch: 'naver' | 'serpapi' | 'mock';
  /** 역이미지 검색(Google Lens) 가능 */
  reverseImageSearch: boolean;
  /** 로컬 업로드 이미지를 Lens에 보낼 수 있는지 (CELEBER_PUBLIC_BASE_URL 필요) */
  reverseImageSearchUploads: boolean;
  /** 사용 모델 (표시용) */
  model: string | null;
  /** 강제 Mock 모드 */
  forceMock: boolean;
  /** 키는 있으나 인증 실패/사용 한도 초과로 AI가 일시 비활성화된 사유 */
  aiBlockedReason: string | null;
}

/** ai.ts가 인증 실패/사용 한도 초과를 만나면 그 공급자를 일정 시간 건너뛴다 (globalThis 공유) */
export interface AiBlock {
  until: number;
  reason: string;
}
const GA = globalThis as unknown as { __celeberAiBlocks?: Partial<Record<AiProviderId, AiBlock>> };
export function getAiBlock(provider: AiProviderId = 'anthropic'): AiBlock | null {
  const b = GA.__celeberAiBlocks?.[provider];
  return b && b.until > Date.now() ? b : null;
}
export function setAiBlock(reason: string, ms = 10 * 60_000, provider: AiProviderId = 'anthropic'): void {
  GA.__celeberAiBlocks = { ...GA.__celeberAiBlocks, [provider]: { until: Date.now() + ms, reason } };
}
export function clearAiBlocks(): void {
  GA.__celeberAiBlocks = {};
}

export interface AiProviderEntry {
  id: AiProviderId;
  model: string;
  apiKey: string;
}

/** 호출 순서대로 키가 있는 공급자 목록 (차단 여부는 보지 않는다). 강제 Mock이면 빈 목록 */
export function aiProviderChain(env: ServerEnv = getEnv()): AiProviderEntry[] {
  if (env.forceMock) return [];
  const all: (AiProviderEntry | null)[] = [
    env.anthropicApiKey ? { id: 'anthropic', model: env.visionModel, apiKey: env.anthropicApiKey } : null,
    env.openaiApiKey ? { id: 'openai', model: env.openaiModel, apiKey: env.openaiApiKey } : null,
  ];
  return all.filter((p): p is AiProviderEntry => !!p && (env.aiProvider === 'auto' || p.id === env.aiProvider));
}

export function getCapabilities(env: ServerEnv = getEnv()): Capabilities {
  const m = env.forceMock;
  const chain = aiProviderChain(env);
  const active = chain.find((p) => !getAiBlock(p.id)) ?? null;
  const naver = !m && !!(env.naverClientId && env.naverClientSecret);
  const serp = !m && !!env.serpApiKey;
  return {
    ai: !!active,
    aiProvider: active?.id ?? null,
    imageSearch: naver ? 'naver' : serp ? 'serpapi' : 'mock',
    reverseImageSearch: serp,
    reverseImageSearchUploads: serp && !!env.publicBaseUrl,
    model: active?.model ?? null,
    forceMock: m,
    aiBlockedReason: chain.length && !active ? (getAiBlock(chain[0].id)?.reason ?? null) : null,
  };
}

/** isMock('ai') 등: 해당 기능이 Mock으로 동작하는지 */
export function isMock(feature: 'ai' | 'imageSearch' | 'reverseImageSearch'): boolean {
  const c = getCapabilities();
  if (feature === 'ai') return !c.ai;
  if (feature === 'imageSearch') return c.imageSearch === 'mock';
  return !c.reverseImageSearch;
}

/** 레이아웃 MockBadge용: 관련 기능 중 Mock인 것의 한국어 사유 */
export function mockReasons(c: Capabilities, features: ('ai' | 'imageSearch' | 'reverseImageSearch')[]): string[] {
  const r: string[] = [];
  if (features.includes('ai') && !c.ai) r.push(c.aiBlockedReason ? `AI 분석 일시 중단: ${c.aiBlockedReason}` : 'AI 분석: AI 키 없음 → 규칙 기반/템플릿 결과');
  if (features.includes('imageSearch') && c.imageSearch === 'mock') r.push('이미지 검색: NAVER/SERPAPI 키 없음 → 데모 이미지');
  if (features.includes('reverseImageSearch') && !c.reverseImageSearch) r.push('역이미지 검색: SERPAPI_API_KEY 없음 → 이름 검색 안내');
  if (c.forceMock) r.unshift('CELEBER_FORCE_MOCK=1');
  return r;
}
