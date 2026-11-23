/**
 * Claude 구조화 출력 스키마(서술 필드만)와 프롬프트, 규칙 초안과의 병합.
 * 색 치환·갭·팔레트 매핑 같은 수치는 AI에 맡기지 않는다 — 프롬프트에 근거로만 넣는다.
 * 스키마는 얕게: default/transform/refine/regex 없음.
 */
import { z } from 'zod';
import type { GuideItem, VibeGuide } from '@celeber/core/contracts';
import { OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { guideVibe } from './limits';
import { dedupeDoNotCopy, hasVividColor, orderActions } from './rules';
import type { GuideContext, GuideDraft } from './types';

const AiItem = z.object({ title: z.string(), detail: z.string() });

export const GuideAiSchema = z.object({
  summary: z.string(),
  faceSummary: z.string(),
  outfitSummary: z.string(),
  moodSummary: z.string(),
  hair: z.array(AiItem),
  makeup: z.array(AiItem),
  outfit: z.array(AiItem),
  mood: z.array(AiItem),
  moodKeywords: z.array(z.string()),
  actions: z.array(
    z.object({
      difficulty: z.enum(['easy', 'medium', 'hard']),
      area: z.enum(['face', 'outfit', 'mood']),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  doNotCopy: z.array(z.object({ element: z.string(), reason: z.string(), alternative: z.string() })),
});
export type GuideAi = z.infer<typeof GuideAiSchema>;

export const GUIDE_SYSTEM_PROMPT = [
  '연예인 사진에서 분석한 룩(추구미)을 사용자의 퍼스널컬러에 맞게 옮기는 스타일 가이드를 한국어로 씁니다.',
  '사진 속 인물이 누구인지 추정하거나 언급하지 않습니다. 이름은 사용자가 입력한 메타데이터일 뿐입니다.',
  '외모를 평가하거나 과장된 칭찬, 이모지, 마케팅 문구를 쓰지 않습니다.',
  '색 이름과 수치는 제공된 계산 결과(substitutions, paletteMapping, gaps)를 그대로 인용하고 새로 만들지 않습니다. 사진에서 본 색을 다른 색으로 바꾸라고 쓸 때는 반드시 그 결과의 to/mine 색을 씁니다.',
  'limitations가 있으면 그 사진의 색·측정은 믿기 어렵습니다. 연예인 톤·피부색을 단정하지 말고, 계산 결과에 없는 비교는 만들지 않습니다.',
  '문장은 짧고 구체적으로: 항목 detail은 1~2문장, 요약은 2문장 이내.',
].join('\n');

/** 프롬프트에 넣을 근거 (서술 필드는 빼고 수치·색만) */
export function guidePromptFacts(ctx: GuideContext, draft: GuideDraft) {
  const r = ctx.report;
  // 규칙 계산과 같은 입력: 인물 없음·색 측정 불가면 믿을 수 없는 아이템·색을 뺀 분석
  const v = guideVibe(ctx.vibe);
  const colorCompared = draft.gaps.some((g) => COLOR_AXES.has(g.axis) && !g.unavailable);
  return {
    me: {
      tone: `${r.type.nameKo} (${r.type.nameEn})`,
      secondary: r.type.secondary.nameKo,
      undertone: r.classification.undertone,
      style: r.variant.gender,
      tops: r.tops.items.map((i) => i.color.name),
      outer: r.outer.items.map((i) => i.color.name),
      hair: r.hair.items.map((h) => h.color.name),
      metals: r.accessories.metals,
      bodyFrame: r.bodyStyling?.frameLabel ?? null,
    },
    celebLook: {
      lookName: v.lookName,
      items: v.outfit.items.map((i) => ({ category: OUTFIT_CATEGORY_LABEL_KO[i.category], name: i.name, color: i.color.name, material: i.material, fit: i.fit })),
      styleKeywords: v.outfit.styleKeywords,
      silhouette: v.outfit.silhouette,
      mood: v.mood.keywords,
      firstImpression: v.mood.firstImpression,
      tone: colorCompared ? (v.personalColor.toneNameKo ?? null) : null,
      hair: v.personalColor.hair?.nameKo ?? null,
    },
    substitutions: draft.outfit.substitutions.map((s) => ({ item: s.itemName, from: s.celebColor.name, to: s.myColor.name, keep: s.keepOriginal, deltaE: s.deltaE })),
    paletteMapping: draft.paletteMapping.map((m) => ({ from: m.celeb.name, mine: m.mine.name, keep: m.deltaE === 0 })),
    limitations: draft.limitations ?? [],
    gaps: draft.gaps.filter((g) => !g.unavailable).map((g) => ({ axis: g.label, me: g.me, celeb: g.celeb, gap: g.gap, poles: g.poles })),
    ruleDoNotCopy: draft.doNotCopy.map((d) => d.element),
  };
}

export function buildGuidePrompt(ctx: GuideContext, draft: GuideDraft): string {
  const facts = guidePromptFacts(ctx, draft);
  const grooming = ctx.report.variant.gender === 'female' ? '메이크업(베이스/립/아이/치크)' : '그루밍(피부/눈썹/수염 또는 헤어 스타일링/향수)';
  return [
    `계산 결과: ${JSON.stringify(facts)}`,
    '',
    '첨부한 사진은 사용자가 고른 연예인 룩 사진입니다. 사진의 헤어 스타일·소재·실루엣을 관찰해 아래를 작성하세요.',
    '- summary: 이 룩을 내 퍼스널컬러로 옮기는 핵심 2문장',
    '- faceSummary / outfitSummary / moodSummary: 각 한 문장',
    '- hair: 헤어 스타일·컬러 제안 2~3개 (내 추천 헤어 컬러 안에서)',
    `- makeup: ${grooming} 제안 2~4개`,
    '- outfit: 치환 결과를 바탕으로 한 코디 제안 2~4개 (소재·핏 포함)',
    '- mood: 분위기를 내 색으로 표현하는 방법 2~3개',
    '- moodKeywords: 분위기 키워드 3~5개 (단어)',
    '- actions: 쉬운 것부터 어려운 것까지 실행 순서 4~7개 (difficulty: easy/medium/hard, area: face/outfit/mood)',
    '- doNotCopy: 그대로 따라 하면 안 되는 요소와 이유, 대체안 2~4개 (ruleDoNotCopy를 참고)',
  ].join('\n');
}

/** Mock: 규칙 초안을 AI 스키마 형태로 (결정적) */
export function draftToAi(d: GuideDraft): GuideAi {
  const strip = (xs: GuideItem[]) => xs.map(({ title, detail }) => ({ title, detail }));
  return {
    summary: d.summary,
    faceSummary: d.face.summary,
    outfitSummary: d.outfit.summary,
    moodSummary: d.mood.summary,
    hair: strip(d.face.hair),
    makeup: strip(d.face.makeup),
    outfit: strip(d.outfit.items),
    mood: strip(d.mood.items),
    moodKeywords: d.mood.keywords,
    actions: d.actions.map(({ difficulty, area, title, detail }) => ({ difficulty, area, title, detail })),
    doNotCopy: d.doNotCopy,
  };
}

const COLOR_AXES: ReadonlySet<string> = new Set(['warmth', 'value', 'chroma', 'contrast', 'clarity']);
const clean = (s: string) => s.trim();
const nonEmpty = <T extends { title: string; detail: string }>(xs: T[]) => xs.filter((x) => clean(x.title) && clean(x.detail));

/**
 * 규칙 초안 + AI 서술 병합.
 *  - 색이 붙은 규칙 항목(측정·계산 근거)은 앞에 남기고, AI 항목을 뒤에 붙인다(제목 중복 제거, 최대 max개).
 *  - 액션은 AI 결과가 있으면 대체(쉬움→어려움 재정렬), doNotCopy는 규칙 + AI 합집합(같은 주의는 하나만, 룩에 원색이 없으면 원색 주의 제외).
 *  - 제한된 사진(limitations)이면 전체 요약·코디 요약은 규칙 문장을 쓴다. AI가 사진에서 본 색으로 치환 결과와 다른 말을 하지 않게 한다.
 */
export function mergeAiGuide(d: GuideDraft, ai: GuideAi): GuideDraft {
  const mergeItems = (rule: GuideItem[], aiItems: { title: string; detail: string }[], max = 6): GuideItem[] => {
    const colored = rule.filter((i) => i.colors?.length);
    const out: GuideItem[] = [...colored];
    const seen = new Set(out.map((i) => i.title));
    for (const a of nonEmpty(aiItems)) {
      if (seen.has(a.title)) continue;
      seen.add(a.title);
      out.push({ title: clean(a.title), detail: clean(a.detail) });
    }
    if (out.length === colored.length) {
      for (const i of rule) {
        if (seen.has(i.title)) continue;
        seen.add(i.title);
        out.push(i);
      }
    }
    return out.slice(0, max);
  };
  const actions = nonEmpty(ai.actions);
  const vivid = hasVividColor([...d.paletteMapping.map((m) => m.celeb), ...d.outfit.substitutions.map((x) => x.celebColor)]);
  const aiDoNot = ai.doNotCopy
    .filter((x) => clean(x.element) && clean(x.alternative))
    .filter((x) => vivid || !/원색/.test(x.element))
    .map((x) => ({ element: clean(x.element), reason: clean(x.reason), alternative: clean(x.alternative) }));
  const doNotCopy = dedupeDoNotCopy([...d.doNotCopy, ...aiDoNot]);
  const limited = !!d.limitations?.length;
  const kw = ai.moodKeywords.map((k) => k.replace(/^#/, '').trim()).filter(Boolean);
  return {
    ...d,
    summary: (!limited && clean(ai.summary)) || d.summary,
    face: { hair: mergeItems(d.face.hair, ai.hair, 4), makeup: mergeItems(d.face.makeup, ai.makeup, 5), summary: clean(ai.faceSummary) || d.face.summary },
    outfit: { substitutions: d.outfit.substitutions, items: mergeItems(d.outfit.items, ai.outfit, 7), summary: (!limited && clean(ai.outfitSummary)) || d.outfit.summary },
    mood: { keywords: kw.length ? kw.slice(0, 5) : d.mood.keywords, items: mergeItems(d.mood.items, ai.mood, 5), summary: clean(ai.moodSummary) || d.mood.summary },
    actions: actions.length ? orderActions(actions) : d.actions,
    doNotCopy,
  };
}

/** 저장된 가이드가 AI 서술을 담았는지 (배지·안내용) */
export function guideSourceLabel(g: Pick<VibeGuide, 'source' | 'isMock'>): string {
  if (g.source === 'hybrid') return '측정 계산 + AI 서술';
  if (g.source === 'ai') return 'AI 서술';
  if (g.isMock) return '측정 계산 + 데모 서술';
  return '측정 계산 (규칙 서술)';
}
