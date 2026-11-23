/**
 * Claude 구조화 출력용 스키마 (AI 전용, 얕고 단순하게).
 * default/transform/refine/regex 없이 정의하고, 받은 뒤 sanitize → 계약 스키마(VibeAnalysisSchema)로 검증한다.
 * 알 수 없는 값은 빈 문자열('') 또는 'unknown'으로 받는다.
 */
import { z } from 'zod';

export const AI_REASON_CODES = [
  'no-person',
  'multiple-people',
  'backlight',
  'occluded',
  'low-resolution',
  'heavy-filter',
  'cropped',
  'face-too-small',
  'extreme-lighting',
  'not-photo',
  'other',
] as const;

export const AI_CATEGORIES = ['outer', 'top', 'bottom', 'dress', 'shoes', 'bag', 'accessory', 'headwear', 'eyewear', 'jewelry'] as const;
export const AI_TONES = [
  'spring-light',
  'spring-bright',
  'spring-warm',
  'summer-light',
  'summer-cool',
  'summer-mute',
  'autumn-mute',
  'autumn-warm',
  'autumn-deep',
  'winter-cool',
  'winter-bright',
  'winter-deep',
  'unknown',
] as const;

const AiColor = z.object({ hex: z.string().describe('#RRGGBB'), name: z.string().describe('한국어 색 이름 (예: 더스티 블루)') });

const AiItem = z.object({
  category: z.enum(AI_CATEGORIES),
  name: z.string().describe('아이템 종류 (예: 싱글 브레스티드 울 코트)'),
  color: AiColor,
  secondaryColors: z.array(AiColor),
  material: z.string().describe('보이는 소재 추정, 모르면 빈 문자열'),
  fit: z.string().describe('오버핏/레귤러/슬림 등, 모르면 빈 문자열'),
  pattern: z.string().describe('무지/스트라이프/체크 등, 모르면 빈 문자열'),
  note: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).describe('이미지 기준 0..1 정규화 bbox'),
});

export const VibeAiSchema = z.object({
  analyzability: z.object({
    analyzable: z.boolean(),
    personCount: z.number(),
    framing: z.enum(['full-body', 'upper-body', 'face', 'unknown']),
    outfit: z.boolean(),
    personalColor: z.boolean(),
    mood: z.boolean(),
    issues: z.array(z.object({ code: z.enum(AI_REASON_CODES), message: z.string() })),
  }),
  outfit: z.object({
    items: z.array(AiItem),
    styleKeywords: z.array(z.string()),
    silhouette: z.string(),
    summary: z.string(),
  }),
  personalColor: z.object({
    skinHex: z.string(),
    hairHex: z.string(),
    eyeHex: z.string(),
    tone: z.enum(AI_TONES),
    undertone: z.enum(['warm', 'cool', 'neutral', 'unknown']),
    confidence: z.number().describe('0..1'),
    evidence: z.array(z.string()),
    lightingCaveat: z.string(),
  }),
  mood: z.object({
    keywords: z.array(z.string()),
    firstImpression: z.string(),
    references: z.array(z.string()),
  }),
  palette: z.object({ main: z.array(AiColor), sub: z.array(AiColor), accent: z.array(AiColor) }),
  lookName: z.string(),
});
export type VibeAi = z.infer<typeof VibeAiSchema>;

/** '#abc123' / 'abc123' → '#ABC123', 아니면 null */
export function normalizeHex(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.split('').map((c) => c + c).join('').toUpperCase()}`;
  return null;
}

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export const VIBE_SYSTEM_PROMPT = [
  '당신은 패션 스타일리스트이자 퍼스널컬러 컨설턴트입니다. 사진 한 장에서 인물의 코디, 퍼스널컬러, 분위기(추구미)를 구조화해 기록합니다.',
  '사진 속 인물이 누구인지 판단하거나 언급하지 마세요. 이름이 주어져도 사용하지 않습니다.',
  '측정값(JSON)이 주어지면 근거로 활용하세요. 측정색은 실제 픽셀에서 계산된 값이므로, 같은 아이템이면 색 hex는 측정색에 가깝게 쓰되 조명 때문에 명백히 다르면 보이는 색을 쓰세요.',
  '측정값(JSON)은 내부 참고 자료입니다. 결과 문장에는 \'측정값\', \'서버\', \'중앙값\', \'제공된 값\'처럼 입력 자료를 언급하지 말고, 사진에서 보이는 내용으로만 쓰세요.',
  '퍼스널컬러는 사진 조명과 보정의 한계를 반드시 lightingCaveat에 적고, 확신이 낮으면 confidence를 낮게 주세요. 판단할 수 없으면 tone을 unknown으로 둡니다.',
  '아이템 box는 이미지 너비·높이 기준 0..1 정규화 좌표(x,y는 왼쪽 위)입니다. 보이지 않는 아이템은 만들지 마세요.',
  '분석 가능성: 인물이 2명 이상, 역광, 가림, 저해상도, 강한 필터, 일러스트/합성이면 issues에 짧은 한국어 문장으로 적으세요.',
  '모든 문장(실루엣·요약·근거·첫인상·노트·issues 포함)은 \'~습니다/~입니다\' 체로 끝내세요. \'~다.\'로 끝내지 마세요.',
  '문장은 짧고 구체적으로, 과장 없이 쓰세요. styleKeywords는 미니멀/스트릿/클래식/캐주얼/시크/로맨틱/내추럴/모던/스포티/빈티지/프레피 같은 1~2단어, 최대 4개.',
  'lookName은 저장 목록에 보일 8~16자 정도의 룩 이름입니다 (예: 그레이 테일러드 미니멀 룩).',
].join('\n');
