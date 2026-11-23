/**
 * 리포트 서술: AI 구조화 출력 스키마(얕게) + 키가 없을 때 쓰는 결정적 템플릿.
 * 템플릿도 측정값(피부 Lab·ITA·축·대비)을 문장에 넣어 사진마다 달라지게 한다.
 */
import { z } from 'zod';
import { type FaceAnalysis, type Gender, type PersonalColorClassification, type Tone, ToneSchema, UndertoneSchema } from '@celeber/core/contracts';
import { METAL_LABEL_KO } from '@celeber/core/contracts';
import { TONE_PROTOTYPES, axisLevelLabel, getToneProfile, groomingTemplate } from '@celeber/core/personal-color';

/** AI 출력 스키마 — 얕고 단순하게 (default/transform/refine/regex 없음) */
export const AiNarrativeSchema = z.object({
  independentTone: ToneSchema,
  independentUndertone: UndertoneSchema,
  independentRationale: z.string(),
  firstImpression: z.array(z.string()),
  hashtags: z.array(z.string()),
  typeDescription: z.string(),
  analysisPoint: z.string(),
  warmText: z.string(),
  coolText: z.string(),
  featureSkinTone: z.string(),
  featureValue: z.string(),
  featureChroma: z.string(),
  featureClarity: z.string(),
  featureContrast: z.string(),
  imageKeywords: z.array(z.string()),
  topsTip: z.string(),
  outerTip: z.string(),
  hairIntro: z.string(),
  hairTip: z.string(),
  grooming: z.array(z.string()),
  avoidIntro: z.string(),
  todayActions: z.array(z.string()),
});
export type AiNarrative = z.infer<typeof AiNarrativeSchema>;

/** 리포트 조립에 쓰는 서술 (AI 또는 템플릿) */
export interface ReportNarrative {
  firstImpression: string[];
  hashtags: string[];
  typeDescription: string;
  analysisPoint: string;
  warmText: string;
  coolText: string;
  features: { skinTone: string; value: string; chroma: string; clarity: string; contrast: string; imageKeywords: string };
  topsTip: string;
  outerTip: string;
  hairIntro: string;
  hairTip: string;
  /** ⑩ 그루밍 제안 (groomingTemplate 순서와 같음) */
  grooming: string[];
  avoidIntro: string;
  todayActions: string[];
  /** 서술이 기준으로 삼은 성별/스타일 (변형 전환 시 그루밍·오늘 포인트 재사용 여부 판단) */
  gender: Gender;
}

const ITA_WORD: Record<string, string> = {
  'very-light': '매우 밝은',
  light: '밝은',
  intermediate: '중간 밝기의',
  tan: '살짝 어두운',
  brown: '어두운',
  dark: '깊은',
};

const UNDERTONE_BASE: Record<'warm' | 'cool' | 'neutral', string> = {
  warm: '웜 베이스 (옐로~골드)',
  cool: '쿨 베이스 (핑크~뉴트럴)',
  neutral: '뉴트럴 베이스 (웜·쿨 중간)',
};

/** 라벨 끝의 괄호 보충어 제거: '낮음(뮤트)' → '낮음' (뒤에 붙는 설명과 중복 방지) */
const bareLabel = (label: string) => label.replace(/\(.*?\)$/, '').trim();

/**
 * ④ 명도·채도·청탁 값. 대비감(contrastText)과 같은 방식으로, 레퍼런스 카드처럼
 * '이 타입에 어울리는 수준'(TONE_PROTOTYPES)을 먼저 쓰고, 측정값은 근거로 덧붙인다.
 * 측정 축이 타입 권장과 30 이상 다르면 '측정은 …'을 함께 적어 숨기지 않는다.
 */
export function axisRowText(axis: 'value' | 'chroma' | 'clarity', cls: PersonalColorClassification, tone: Tone): string {
  const idx = axis === 'value' ? 1 : axis === 'chroma' ? 2 : 4;
  const rec = Math.round(TONE_PROTOTYPES[tone][idx] * 100);
  const recLabel = bareLabel(axisLevelLabel(axis, rec));
  const hint =
    axis === 'value'
      ? rec >= 60
        ? '라이트 톤'
        : rec >= 40
          ? '미디엄 톤'
          : '딥 톤'
      : axis === 'chroma'
        ? rec <= 35
          ? '뮤트 톤이 잘 어울림'
          : rec <= 65
            ? '중간 채도가 무난함'
            : '선명한 색이 잘 어울림'
        : rec >= 60
          ? '맑고 깨끗한 느낌'
          : rec >= 40
            ? '부드럽고 차분한 느낌'
            : '그윽하고 차분한 느낌';
  const m = cls.axes[axis];
  const measuredNum =
    axis === 'value' ? `측정 피부 L* ${Math.round(cls.inputs.skinLab.l)}` : axis === 'chroma' ? `측정 피부 C* ${Math.round(Math.hypot(cls.inputs.skinLab.a, cls.inputs.skinLab.b))}` : `측정 지수 ${m}`;
  const diff = Math.abs(m - rec) >= 30 ? ` (측정은 ${bareLabel(axisLevelLabel(axis, m))})` : '';
  return `${recLabel} (${hint}) · ${measuredNum}${diff}`;
}

export function featureTexts(cls: PersonalColorClassification, skin: { itaCategory: string; lab: { l: number } }, tone: Tone): ReportNarrative['features'] {
  // 대비감: 레퍼런스 카드처럼 '이 타입에 맞는 코디 대비'를 앞에 두고, 측정 관찰값(피부-헤어/눈 명도 차)은 근거로 덧붙인다.
  // 검은 머리는 측정 대비가 높게 나오기 쉬워, 관찰값만 쓰면 뮤트·라이트 타입 판정과 표가 서로 어긋난다.
  return {
    skinTone: `${ITA_WORD[skin.itaCategory] ?? ''} ${UNDERTONE_BASE[cls.undertone]}`.trim(),
    value: axisRowText('value', cls, tone),
    chroma: axisRowText('chroma', cls, tone),
    clarity: axisRowText('clarity', cls, tone),
    contrast: contrastText(cls, tone),
    imageKeywords: getToneProfile(tone).imageKeywords.join(' / '),
  };
}

/** 톤 원형의 대비 축(0..100) = 이 타입에 권장하는 코디 대비 수준 */
export function toneContrastLevel(tone: Tone): number {
  return Math.round(TONE_PROTOTYPES[tone][3] * 100);
}

/**
 * ④ 대비감 값: '낮음~중간 (과한 대비 비추천) · 측정 피부·헤어 ΔL* 75'.
 * 앞부분은 판정 타입의 권장 대비(카드와 같은 표현), 뒷부분은 실제 측정값.
 */
export function contrastText(cls: PersonalColorClassification, tone: Tone): string {
  const rec = toneContrastLevel(tone);
  const recLabel = axisLevelLabel('contrast', rec);
  const recHint = rec < 40 ? '과한 대비 비추천' : rec < 60 ? '중간 대비가 무난함' : '또렷한 대비가 잘 어울림';
  const darks = [cls.inputs.hairLab?.l, cls.inputs.eyeLab?.l].filter((v): v is number => typeof v === 'number');
  const measured = cls.inputs.contrastEstimated || !darks.length ? '헤어·눈 미측정, 중간값 가정' : `측정 피부·헤어 명도 차 ΔL* ${Math.round(cls.inputs.skinLab.l - Math.min(...darks))}`;
  return `${recLabel} (${recHint}) · ${measured}`;
}

/**
 * ⑩ 그루밍 항목. core groomingTemplate은 'unspecified'에도 남성 항목(수염)을 주므로,
 * 앱에서 '선택 안 함'은 수염 대신 헤어 스타일링을 넣은 중립 항목으로 바꾼다. (core로 승격 후보)
 */
export function appGroomingTemplate(tone: Tone, gender: Gender): ReturnType<typeof groomingTemplate> {
  const base = groomingTemplate(tone, gender);
  if (gender !== 'unspecified') return base;
  const p = getToneProfile(tone);
  return base.map((g) =>
    g.key === 'beard'
      ? {
          key: 'hair-styling',
          icon: 'hair' as const,
          label: '헤어 스타일링',
          suggestion: `${p.hair[0].color.name}·${p.hair[1]?.color.name ?? p.hair[0].color.name} 계열을 유지하고 결을 정돈해 마무리하세요.`,
          colors: p.hair.slice(0, 2).map((h) => h.color),
        }
      : g,
  );
}

/** 그루밍 항목 이름 (AI 프롬프트용, 순서 동일) */
export function groomingKeysText(gender: Gender): string {
  return appGroomingTemplate('summer-mute', gender)
    .map((g) => g.label)
    .join(', ');
}

/**
 * 성별 변형을 바꾼 뒤 ⑥⑦⑩·12 문구가 템플릿인지 (AI 리포트에서만 의미 있음).
 * AI 서술은 생성 당시 스타일 기준이라, 다른 스타일로 바꾸면 해당 섹션은 측정 기반 템플릿으로 채운다.
 */
export function variantUsesTemplateNarrative(report: {
  source: string;
  type: { tone: Tone };
  variant: { gender: Gender };
  tops: { tip: string };
  grooming: { items: { suggestion: string }[] };
}): boolean {
  if (report.source !== 'hybrid') return false;
  const g = report.variant.gender;
  const p = getToneProfile(report.type.tone);
  const tpl = appGroomingTemplate(report.type.tone, g).map((x) => x.suggestion);
  return report.tops.tip === adaptGenderText(p.topsTip, g) && report.grooming.items.every((it, i) => it.suggestion === tpl[i]);
}

/** 성별 변형에 맞춰 템플릿 문구의 의류 명칭을 바꾼다 */
export function adaptGenderText(text: string, gender: Gender): string {
  if (gender === 'female') return text.replace(/셔츠/g, '블라우스').replace(/수트/g, '아우터');
  if (gender === 'unspecified') return text.replace(/셔츠/g, '상의').replace(/수트/g, '아우터');
  return text;
}

function isCoolSide(cls: PersonalColorClassification): boolean {
  return cls.coolPercent > cls.warmPercent;
}

export function warmCoolTexts(cls: PersonalColorClassification): { warmText: string; coolText: string } {
  const cool = isCoolSide(cls);
  const close = Math.abs(cls.warmPercent - cls.coolPercent) < 20;
  if (close)
    return {
      warmText: '부드러운 웜 계열은 무난하지만 진한 주황·카키는 피부가 누렇게 보일 수 있어요.',
      coolText: '탁하지 않은 쿨 계열은 무난하지만 차가운 원색은 피부가 창백해 보일 수 있어요.',
    };
  return cool
    ? { warmText: '노란·주황 기가 강한 색을 대면 피부가 누렇고 칙칙해 보일 수 있어요.', coolText: '푸른·회색 기가 도는 색을 대면 피부가 맑고 깨끗해 보여요.' }
    : { warmText: '노란·골드 기가 도는 색을 대면 혈색이 살아나고 생기 있어 보여요.', coolText: '푸른 기가 강한 차가운 색을 대면 피부가 창백하고 푸석해 보일 수 있어요.' };
}

export function analysisPointText(cls: PersonalColorClassification, skin: { lch: { h: number; c: number }; lab: { b: number } }, tone: Tone): string {
  const p = getToneProfile(tone);
  const side = cls.undertone === 'cool' ? '핑크~뉴트럴 쪽' : cls.undertone === 'warm' ? '옐로 쪽' : '웜·쿨 중간';
  const head = `측정한 피부 색상각 ${skin.lch.h.toFixed(0)}°, b* ${skin.lab.b.toFixed(1)}로 ${side}입니다.`;
  // 뉴트럴 언더톤에서 톤 프로필의 단정적 문장('핑크 베이스가 도드라지고…')을 붙이면 앞 문장과 모순된다.
  if (cls.undertone === 'neutral') {
    const lean = isCoolSide(cls) ? '쿨' : '웜';
    const near = isCoolSide(cls) ? '푸른·회색 기가 살짝 도는' : '노란 기가 살짝 도는';
    return `${head} 웜·쿨 어느 쪽도 강하지 않아 극단적인 색만 피하면 폭넓게 어울리고, 살짝 ${lean} 쪽이라 ${near} 부드러운 색을 얼굴 옆에 두면 가장 안정적입니다.`;
  }
  return `${head} ${p.analysisPoint}`;
}

function topsWord(gender: Gender) {
  return gender === 'female' ? '블라우스' : gender === 'male' ? '셔츠' : '상의';
}
function outerWord(gender: Gender) {
  return gender === 'male' ? '수트' : '아우터';
}

/** 12 오늘 바로 적용할 포인트 (템플릿) */
export function todayActionsTemplate(tone: Tone, gender: Gender): string[] {
  const p = getToneProfile(tone);
  const metals = p.metals.slice(0, 2).map((m) => METAL_LABEL_KO[m]).join('/');
  const kw = p.imageKeywords[1] ?? p.imageKeywords[0];
  const items = [
    `${p.tops[1]?.name ?? p.tops[0].name} ${topsWord(gender)} + ${p.outer[0].name} ${outerWord(gender)}로 ${kw} 인상 만들기`,
    `${metals} 톤 악세서리로 얼굴 주변 정리하기`,
    `${p.hair[0].color.name} 또는 ${p.hair[1]?.color.name ?? p.hair[0].color.name} 헤어로 피부 톤과 맞추기`,
  ];
  if (gender === 'female') items.push(`${p.makeup.lip[0].name} 계열 립으로 혈색 살리기`);
  else items.push(`${p.point[0].name} 포인트 컬러(${gender === 'male' ? '넥타이' : '소품'})로 인상 업그레이드`);
  return items;
}

export function avoidIntroText(cls: PersonalColorClassification): string {
  return isCoolSide(cls) ? '인상이 무거워지거나 피부가 칙칙해 보일 수 있어요.' : '피부가 창백해지거나 생기가 사라져 보일 수 있어요.';
}

/** 키가 없거나 AI가 실패했을 때의 결정적 서술 */
export function templateNarrative(cls: PersonalColorClassification, face: Pick<FaceAnalysis, 'skin'>, gender: Gender): ReportNarrative {
  const tone = cls.tone;
  const p = getToneProfile(tone);
  const skin = face.skin.corrected;
  return {
    firstImpression: p.firstImpression.slice(0, 4),
    hashtags: p.hashtags.slice(0, 4),
    typeDescription: p.description,
    analysisPoint: analysisPointText(cls, skin, tone),
    ...warmCoolTexts(cls),
    features: featureTexts(cls, skin, tone),
    topsTip: adaptGenderText(p.topsTip, gender),
    outerTip: adaptGenderText(p.outerTip, gender),
    hairIntro: p.hairIntro,
    hairTip: p.hairTip,
    grooming: appGroomingTemplate(tone, gender).map((g) => g.suggestion),
    avoidIntro: avoidIntroText(cls),
    todayActions: todayActionsTemplate(tone, gender),
    gender,
  };
}

const nonEmpty = (s: string | undefined, fb: string) => (s && s.trim() ? s.trim() : fb);
/** AI가 그루밍 제안 앞에 붙이는 항목 이름('피부: …')을 뗀다. 화면 표의 왼쪽 칸에 이미 항목 이름이 있다. */
const stripLeadLabel = (s: string | undefined) => s?.replace(/^\s*[가-힣]+(?: [가-힣]+)?\s*[:：]\s*/, '');
const nonEmptyList = (xs: string[] | undefined, fb: string[], max: number) => {
  const c = (xs ?? []).map((x) => x.trim()).filter(Boolean);
  return (c.length ? c : fb).slice(0, max);
};

/* ------------------------------------------------------------------ AI 문구 후처리 */

const SEASON_WORD = /(봄웜|여름쿨|가을웜|겨울쿨)(?!\s*(?:라이트|브라이트|트루|뮤트|딥))/;

/**
 * AI 서술 표기 정리.
 * - 색온도: '3290 K', '3,290 K' → '3,290K' (리포트의 다른 곳과 같은 표기)
 * - 타입 이름: '보조 타입은 겨울쿨(7%)'처럼 계절만 쓴 경우 규칙 결과의 전체 이름('겨울쿨 트루')으로 고정
 */
export function polishAiText(text: string, ctx?: { tone: Tone; secondaryTone: Tone }): string {
  let t = text
    .replace(/(?<![\d.,])(\d{4,5})\s?K(?![A-Za-z])/g, (_, n: string) => `${Number(n).toLocaleString('en-US')}K`)
    .replace(/(\d,\d{3})\s+K(?![A-Za-z])/g, '$1K');
  if (!ctx) return t;
  const primary = getToneProfile(ctx.tone).nameKo;
  const secondary = getToneProfile(ctx.secondaryTone).nameKo;
  const seasonOf = (name: string) => name.split(' ')[0];
  // '보조 타입은 겨울쿨' → 보조 타입 이름
  t = t.replace(new RegExp(`(보조\\s*(?:가능\\s*)?타입[은는이가]?\\s*)${SEASON_WORD.source}`, 'g'), (m, lead: string, season: string) =>
    seasonOf(secondary) === season ? `${lead}${secondary}` : m,
  );
  // '겨울쿨(7%)'처럼 점수와 함께 쓴 계절 이름 → 1·2순위 중 계절이 하나만 맞으면 그 이름
  t = t.replace(new RegExp(`${SEASON_WORD.source}(?=\\s*\\(\\d)`, 'g'), (m, season: string) => {
    const hits = [...new Set([primary, secondary].filter((n) => seasonOf(n) === season))];
    return hits.length === 1 ? hits[0] : m;
  });
  return t;
}

/** AI 서술을 템플릿 위에 덮는다 (빈 값은 템플릿 유지, 해시태그는 # 정규화). ctx가 있으면 타입 이름·숫자 표기를 정리한다. */
export function mergeAiNarrative(base: ReportNarrative, ai: AiNarrative, ctx?: { tone: Tone; secondaryTone: Tone }): ReportNarrative {
  const merged = mergeAiNarrativeRaw(base, ai);
  const p = (x: string) => polishAiText(x, ctx);
  return {
    ...merged,
    firstImpression: merged.firstImpression.map(p),
    typeDescription: p(merged.typeDescription),
    analysisPoint: p(merged.analysisPoint),
    warmText: p(merged.warmText),
    coolText: p(merged.coolText),
    features: {
      skinTone: p(merged.features.skinTone),
      value: p(merged.features.value),
      chroma: p(merged.features.chroma),
      clarity: p(merged.features.clarity),
      contrast: p(merged.features.contrast),
      imageKeywords: merged.features.imageKeywords,
    },
    topsTip: p(merged.topsTip),
    outerTip: p(merged.outerTip),
    hairIntro: p(merged.hairIntro),
    hairTip: p(merged.hairTip),
    grooming: merged.grooming.map(p),
    avoidIntro: p(merged.avoidIntro),
    todayActions: merged.todayActions.map(p),
  };
}

function mergeAiNarrativeRaw(base: ReportNarrative, ai: AiNarrative): ReportNarrative {
  const hashtags = nonEmptyList(ai.hashtags, base.hashtags, 5).map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''));
  const grooming = base.grooming.map((g, i) => nonEmpty(stripLeadLabel(ai.grooming[i]), g));
  return {
    firstImpression: nonEmptyList(ai.firstImpression, base.firstImpression, 4),
    hashtags,
    typeDescription: nonEmpty(ai.typeDescription, base.typeDescription),
    analysisPoint: nonEmpty(ai.analysisPoint, base.analysisPoint),
    warmText: nonEmpty(ai.warmText, base.warmText),
    coolText: nonEmpty(ai.coolText, base.coolText),
    features: {
      skinTone: nonEmpty(ai.featureSkinTone, base.features.skinTone),
      value: nonEmpty(ai.featureValue, base.features.value),
      chroma: nonEmpty(ai.featureChroma, base.features.chroma),
      clarity: nonEmpty(ai.featureClarity, base.features.clarity),
      contrast: nonEmpty(ai.featureContrast, base.features.contrast),
      imageKeywords: ai.imageKeywords.filter(Boolean).length ? ai.imageKeywords.filter(Boolean).slice(0, 4).join(' / ') : base.features.imageKeywords,
    },
    topsTip: nonEmpty(ai.topsTip, base.topsTip),
    outerTip: nonEmpty(ai.outerTip, base.outerTip),
    hairIntro: nonEmpty(ai.hairIntro, base.hairIntro),
    hairTip: nonEmpty(ai.hairTip, base.hairTip),
    grooming,
    avoidIntro: nonEmpty(ai.avoidIntro, base.avoidIntro),
    todayActions: nonEmptyList(ai.todayActions, base.todayActions, 4),
    gender: base.gender,
  };
}
