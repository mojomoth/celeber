/**
 * 규칙 기반 추구미 가이드 초안 (결정적). AI 키가 없으면 이 초안이 그대로 결과가 되고,
 * AI가 있으면 서술 필드만 Claude 결과로 바꾼다(색 치환·갭·팔레트 매핑은 항상 이 계산을 쓴다).
 */
import type { ColorSubstitution, Gap, GuideItem, NamedColor, VibeGuide } from '@celeber/core/contracts';
import { METAL_LABEL_KO } from '@celeber/core/contracts';
import { chroma, hexToLab } from '@celeber/core/color';
import { nearestInPalette, getToneProfile } from '@celeber/core/personal-color';
import { type MyPalette, paletteFromReport } from '@celeber/personal-color-report/lib';
import { GAP_LARGE, GAP_SIMILAR, computeGaps, largestGaps, myStyleKeywords, pointContrastOnly } from './gaps';
import { analysisLimits, guideLimitations, guideVibe } from './limits';
import { FAR_FROM_FACE, mapCelebPalette, nearWorst, substituteOutfit } from './palette-map';
import { wj } from './josa';
import type { GuideContext, GuideDraft } from './types';

type Action = VibeGuide['actions'][number];
type DoNot = VibeGuide['doNotCopy'][number];

const DIFF_ORDER: Record<Action['difficulty'], number> = { easy: 0, medium: 1, hard: 2 };
export const DIFFICULTY_LABEL_KO: Record<Action['difficulty'], string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
export const AREA_LABEL_KO: Record<Action['area'], string> = { face: '얼굴', outfit: '코디', mood: '분위기' };

/** 쉬움 → 어려움, 같은 난이도는 입력 순서 유지. priority 1..n 재부여 */
export function orderActions(actions: Omit<Action, 'priority'>[], max = 8): Action[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => DIFF_ORDER[x.a.difficulty] - DIFF_ORDER[y.a.difficulty] || x.i - y.i)
    .slice(0, max)
    .map(({ a }, i) => ({ ...a, priority: i + 1 }));
}

export function celebDisplayName(ctx: GuideContext): string {
  return ctx.vibe.celebName?.trim() || '선택한 인물';
}

/* ------------------------------------------------------------------ 얼굴 */

function hairGuide(ctx: GuideContext, p: MyPalette): { items: GuideItem[]; hairNear?: { celeb: NamedColor; mine: NamedColor; deltaE: number; avoid: boolean } } {
  const r = ctx.report;
  const ch = ctx.vibe.personalColor.hair;
  const items: GuideItem[] = [];
  let hairNear: { celeb: NamedColor; mine: NamedColor; deltaE: number; avoid: boolean } | undefined;
  if (ch && p.hair.length) {
    const celeb: NamedColor = { hex: ch.hex, name: ch.nameKo };
    const near = nearestInPalette(ch.hex, p.hair);
    const avoid = p.hairAvoid.length ? nearestInPalette(ch.hex, p.hairAvoid).deltaE < 10 : false;
    hairNear = { celeb, mine: near.color, deltaE: near.deltaE, avoid };
    items.push({
      title: '헤어 컬러',
      detail:
        near.deltaE < 8
          ? `연예인 헤어 ${wj(ch.nameKo, '은/는')} 내 추천 헤어 ${wj(near.color.name, '와/과')} 가까워 그대로 따라 해도 됩니다.`
          : `연예인 헤어는 ${ch.nameKo}입니다. ${avoid ? '내 톤에서는 피할 색에 가까워 ' : ''}내 팔레트에서는 ${wj(near.color.name, '이/가')} 가장 가깝고 잘 어울립니다.`,
      colors: [celeb, near.color],
    });
  } else {
    items.push({
      title: '헤어 컬러',
      detail: `${r.hair.intro} 추천: ${r.hair.items.map((h) => h.color.name).join(', ')}.`,
      colors: r.hair.items.map((h) => h.color).slice(0, 4),
    });
  }
  items.push({ title: '피할 헤어 컬러', detail: r.hair.tip, colors: r.hair.avoid.slice(0, 3) });
  return { items, hairNear };
}

/** 색 이름에서 측정 부위 표시('(입술)')를 뗀다. 조사는 떼어 낸 이름 기준으로 붙인다. */
export const stripLipTag = (name: string) => name.replace(/\s*\(입술\)/, '').trim() || name;

/** 립 매핑에 쓸 포인트 색의 최소 채도 (CIELAB C*) */
const LIP_ACCENT_MIN_CHROMA = 15;

/** 얼굴 가이드의 메이크업/그루밍 항목과, 액션에서 같은 색을 쓰도록 고른 립 색 */
function makeupGuide(ctx: GuideContext): { items: GuideItem[]; lip?: NamedColor } {
  const r = ctx.report;
  const gender = r.variant.gender;
  if (gender === 'female') {
    const prof = getToneProfile(r.type.tone);
    // 블랙·그레이 같은 무채색은 립으로 옮길 '포인트 색'이 아니다. 입술 측정색이나 유채색만 쓴다.
    const accent = [...ctx.vibe.palette.accent, ...ctx.vibe.palette.sub].find((c) => c.name.includes('(입술)') || chroma(hexToLab(c.hex)) >= LIP_ACCENT_MIN_CHROMA);
    const items: GuideItem[] = [];
    let lipColor: NamedColor | undefined = prof.makeup.lip[0];
    if (accent && prof.makeup.lip.length) {
      const lip = nearestInPalette(accent.hex, prof.makeup.lip);
      const accentName = stripLipTag(accent.name);
      lipColor = lip.color;
      items.push({ title: '립', detail: `연예인 룩의 포인트 색 ${wj(accentName, '은/는')} 내 립 팔레트의 ${wj(lip.color.name, '로/으로')} 옮기면 혈색이 자연스럽습니다.`, colors: [{ ...accent, name: accentName }, lip.color] });
    } else {
      items.push({ title: '립', detail: `${prof.makeup.lip.map((c) => c.name).join(' / ')} 계열이 혈색을 살립니다.`, colors: prof.makeup.lip });
    }
    items.push({ title: '아이', detail: `${prof.makeup.eye.map((c) => c.name).join(' / ')} 섀도로 음영만 주세요.`, colors: prof.makeup.eye });
    items.push({ title: '베이스·치크', detail: `${wj(prof.makeup.base, '로/으로')} 정돈하고 ${wj(prof.makeup.cheek.map((c) => c.name).join(' / '), '을/를')} 얇게 더하세요.`, colors: prof.makeup.cheek });
    return { items, ...(lipColor ? { lip: lipColor } : {}) };
  }
  // 남성/선택 안 함: 연예인 사진에서 측정된 값(입술색·헤어 명도)을 내 팔레트에 대응시킨 항목을 먼저,
  // 그다음 리포트 ⑩ 그루밍 중 피부·눈썹·수염처럼 사진과 무관하게 유효한 항목을 덧붙인다.
  return { items: [...celebFaceItems(ctx), ...r.grooming.items.slice(0, 3).map((g) => ({ title: `${g.label} (내 리포트)`, detail: g.suggestion, ...(g.colors?.length ? { colors: g.colors } : {}) }))] };
}

/** 연예인 사진 측정값 → 얼굴 가이드 항목 (성별 무관). 측정이 없으면 '측정 불가'를 명시한다. */
export function celebFaceItems(ctx: GuideContext): GuideItem[] {
  const r = ctx.report;
  const v = ctx.vibe;
  const prof = getToneProfile(r.type.tone);
  const items: GuideItem[] = [];
  // 립·혈색: celeb-vibe가 팔레트 포인트로 측정한 입술색
  const lip = [...v.palette.accent, ...v.palette.sub].find((c) => c.name.includes('(입술)'));
  if (lip && prof.makeup.lip.length) {
    const near = nearestInPalette(lip.hex, prof.makeup.lip);
    const lipName = stripLipTag(lip.name);
    items.push({
      title: '혈색·입술 톤',
      detail:
        near.deltaE < 8
          ? `연예인 입술색 ${wj(lipName, '은/는')} 내 팔레트의 ${wj(near.color.name, '와/과')} 가까워 비슷한 혈색을 내기 쉽습니다. 색이 도는 립밤 정도면 충분합니다.`
          : `연예인 입술색은 ${lipName}입니다. 내 톤에서는 ${wj(near.color.name, '이/가')} 가장 가까운 대안이라, 색이 도는 립밤·틴트로 혈색만 비슷하게 맞추세요.`,
      colors: [{ hex: lip.hex, name: lipName }, near.color],
    });
  }
  // 헤어 명도·대비: 연예인 헤어 L*와 내 헤어 L*
  const ch = v.personalColor.hair;
  const mh = r.measurements.hair;
  if (ch && mh) {
    const dL = Math.round(ch.lab.l - mh.lab.l);
    const recs = r.hair.items.map((h) => h.color);
    const closest = recs.length ? recs.reduce((a, b) => (Math.abs(hexL(b.hex) - ch.lab.l) < Math.abs(hexL(a.hex) - ch.lab.l) ? b : a)) : null;
    items.push({
      title: '헤어 명도·대비',
      detail:
        Math.abs(dL) < 10
          ? `연예인 헤어(${ch.nameKo})와 내 헤어(${mh.nameKo})의 밝기가 비슷해(ΔL* ${Math.abs(dL)}) 얼굴과 머리의 대비 인상도 비슷합니다.`
          : `연예인 헤어가 내 헤어보다 ${dL > 0 ? '밝아' : '어두워'}(ΔL* ${Math.abs(dL)}) 얼굴과 머리의 대비가 ${dL > 0 ? '부드럽게' : '또렷하게'} 보입니다.${closest ? ` 비슷한 인상을 원하면 내 추천 헤어 중 ${wj(closest.name, '이/가')} 명도가 가장 가깝습니다.` : ''}`,
      colors: [{ hex: ch.hex, name: `연예인 ${ch.nameKo}` }, { hex: mh.hex, name: `내 ${mh.nameKo}` }, ...(closest ? [closest] : [])],
    });
  }
  // 헤어 스타일(길이·앞머리·가르마)은 AI 서술로만 얻는다
  if (v.source === 'mock' || v.isMock) {
    items.push({ title: '헤어 스타일', detail: '헤어 길이·앞머리·가르마는 AI 분석이 있을 때만 서술합니다. 이번 결과에서는 측정하지 못했으니 사진을 보고 직접 비교해 주세요.' });
  }
  return items;
}

const hexL = (hex: string) => hexToLab(hex).l;

/* ------------------------------------------------------------------ 코디 */

function outfitItems(ctx: GuideContext, subs: ColorSubstitution[], p: MyPalette): GuideItem[] {
  const items: GuideItem[] = [];
  for (const s of subs) {
    if (s.keepOriginal) continue;
    items.push({ title: `${s.itemName}: ${s.celebColor.name} → ${s.myColor.name}`, detail: s.reason, colors: [s.celebColor, s.myColor] });
  }
  const kept = subs.filter((s) => s.keepOriginal);
  if (kept.length) items.push({ title: '그대로 둘 아이템', detail: `${kept.map((s) => `${s.itemName}(${s.celebColor.name})`).join(', ')}: 원래 색을 유지합니다.`, colors: kept.map((s) => s.celebColor).slice(0, 4) });
  const sil = ctx.vibe.outfit.silhouette;
  const body = ctx.report.bodyStyling;
  if (sil || body) {
    items.push({
      title: '실루엣',
      detail: [sil ? `연예인 룩: ${sil}.` : '', body?.suggestions[0] ? `내 체형(${body.frameLabel}) 기준: ${body.suggestions[0].title} — ${body.suggestions[0].detail}` : ''].filter(Boolean).join(' '),
    });
  }
  if (p.metals.length) {
    items.push({
      title: '액세서리 금속',
      detail: `${wj(p.metalLabels.join(' / '), '이/가')} 잘 맞습니다.${p.avoidMetals.length ? ` ${wj(p.avoidMetals.map((m) => METAL_LABEL_KO[m]).join(', '), '은/는')} 피하세요.` : ''}`,
    });
  }
  return items;
}

/* ------------------------------------------------------------------ 분위기 */

function moodGuide(ctx: GuideContext, gaps: Gap[]): { keywords: string[]; items: GuideItem[] } {
  const v = ctx.vibe;
  const mine = myStyleKeywords(ctx.report).map((k) => k.replace(/^#/, ''));
  const keywords = [...new Set(v.mood.keywords.map((k) => k.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 5);
  const shared = keywords.filter((k) => mine.some((m) => m.includes(k) || k.includes(m)));
  const items: GuideItem[] = [];
  if (v.mood.firstImpression) items.push({ title: '연예인 룩의 첫인상', detail: v.mood.firstImpression });
  items.push({
    title: '살릴 분위기',
    detail: shared.length
      ? `${wj(shared.join(', '), '은/는')} 내 인상과도 겹쳐 그대로 살리기 쉽습니다.`
      : `${wj(keywords.slice(0, 2).join(', ') || '룩의 분위기', '은/는')} 색보다 소재·실루엣으로 표현하세요. 색은 내 팔레트(${ctx.report.type.nameKo})를 지킵니다.`,
  });
  // 비교하지 못한 축(연예인 측정 없음)은 '비슷함'과 구분해 그대로 적는다
  const parts: string[] = [];
  const similar: string[] = [];
  const unknown: string[] = [];
  for (const [axis, label] of [['contrast', '대비'], ['value', '밝기']] as const) {
    const g = gaps.find((x) => x.axis === axis);
    if (!g || g.unavailable) unknown.push(label);
    else if (Math.abs(g.gap) < GAP_SIMILAR) similar.push(label);
    else if (axis === 'contrast')
      parts.push(g.gap > 0 ? (pointContrastOnly(ctx.report, g.gap) ? '명도 차는 하의·신발에만 두고 얼굴 옆은 부드럽게' : '대비는 상하의 명도 차로 만들고 얼굴 옆은 부드럽게') : '대비를 줄인 톤온톤 조합');
    else parts.push(g.gap > 0 ? '밝은 상의로 가볍게' : '어두운 아우터로 무게감 있게');
  }
  const sentences: string[] = [];
  if (parts.length) sentences.push(`${parts.join(', ')} 연출하면 분위기가 가까워집니다.`);
  if (similar.length) sentences.push(`${similar.join('와 ')} 수준은 비슷해 ${parts.length ? '그 부분은 ' : ''}색 조합을 그대로 참고해도 됩니다.`);
  if (unknown.length) sentences.push(`${unknown.join('·')}는 연예인 사진에서 피부·헤어 색을 제대로 잴 수 없어 비교하지 않았습니다. 사진을 보고 상하의 명도 조합만 참고하세요.`);
  items.push({ title: '대비·밝기로 맞추기', detail: sentences.join(' ') });
  if (v.mood.references.length) items.push({ title: '참고 이미지 단어', detail: v.mood.references.slice(0, 3).join(' / ') });
  return { keywords, items };
}

/* ------------------------------------------------------------------ 액션 / 주의 */

/** 얼굴 옆에 둘 '한 단계 부드러운 대비' 조합 (액션·주의 요소가 같은 대안을 쓴다) */
function softContrastPair(p: MyPalette): string {
  return `내 ${wj(p.outer[0]?.name ?? '아우터', '와/과')} ${p.tops[0]?.name ?? '상의'}`;
}

function buildActions(ctx: GuideContext, subs: ColorSubstitution[], p: MyPalette, gaps: Gap[], hairNear?: { celeb: NamedColor; mine: NamedColor; deltaE: number }, lip?: NamedColor): Omit<Action, 'priority'>[] {
  const out: Omit<Action, 'priority'>[] = [];
  const gender = ctx.report.variant.gender;
  const point = subs.find((s) => !s.keepOriginal && (s.category === 'accessory' || s.category === 'jewelry' || s.category === 'bag'));
  if (point) out.push({ difficulty: 'easy', area: 'outfit', title: `${point.itemName} 색을 ${wj(point.myColor.name, '로/으로')}`, detail: point.reason });
  if (p.metals.length) out.push({ difficulty: 'easy', area: 'outfit', title: `액세서리는 ${p.metalLabels[0]}`, detail: `${p.metalLabels.join(' / ')} 금속이 얼굴빛을 정돈합니다.` });
  if (gender === 'female') {
    // 얼굴 가이드의 립 항목과 같은 색
    const lipColor = lip ?? getToneProfile(ctx.report.type.tone).makeup.lip[0];
    if (lipColor) out.push({ difficulty: 'easy', area: 'face', title: `립을 ${lipColor.name} 계열로`, detail: '포인트 색을 얼굴 가까이 둘 때 가장 쉬운 방법입니다.' });
  } else {
    const g = ctx.report.grooming.items[0];
    if (g) out.push({ difficulty: 'easy', area: 'face', title: `${g.label} 정돈`, detail: g.suggestion });
  }
  const top = subs.find((s) => !s.keepOriginal && !FAR_FROM_FACE.has(s.category) && s.category !== 'jewelry' && s.category !== 'accessory');
  if (top) out.push({ difficulty: 'medium', area: 'outfit', title: `${wj(top.itemName, '을/를')} ${wj(top.myColor.name, '로/으로')} 바꾸기`, detail: `원래 ${top.celebColor.name}. ${top.reason}` });
  const far = subs.find((s) => !s.keepOriginal && FAR_FROM_FACE.has(s.category));
  if (far) out.push({ difficulty: 'medium', area: 'outfit', title: `${wj(far.itemName, '을/를')} ${wj(far.myColor.name, '로/으로')}`, detail: far.reason });
  const style = gaps.find((g) => g.axis === 'style' && !g.unavailable && Math.abs(g.gap) >= GAP_SIMILAR);
  if (style) out.push({ difficulty: 'medium', area: 'mood', title: style.gap > 0 ? '직선적인 아이템으로 시크함 더하기' : '부드러운 소재로 분위기 맞추기', detail: style.comment });
  const contrast = gaps.find((g) => g.axis === 'contrast' && !g.unavailable && Math.abs(g.gap) >= GAP_SIMILAR);
  if (contrast) {
    if (contrast.gap > 0 && pointContrastOnly(ctx.report, contrast.gap)) {
      // 대비를 올리라고 하지 않는다: 주의 요소('얼굴 가까이 강한 명도 대비')와 같은 대안
      out.push({
        difficulty: 'medium',
        area: 'mood',
        title: '대비는 얼굴에서 먼 곳에만',
        detail: `연예인 룩은 나보다 대비가 강합니다(+${Math.round(contrast.gap)}). 얼굴 옆은 ${softContrastPair(p)}처럼 한 단계 부드러운 대비로 두고, 명도 차는 하의·신발·가방에서만 주세요.`,
      });
    } else {
      out.push({ difficulty: 'medium', area: 'mood', title: contrast.gap > 0 ? '상하의 명도 차로 대비 만들기' : '톤온톤으로 대비 줄이기', detail: contrast.comment });
    }
  }
  if (hairNear && hairNear.deltaE >= 8) out.push({ difficulty: 'hard', area: 'face', title: `헤어 컬러를 ${wj(hairNear.mine.name, '로/으로')}`, detail: `연예인 헤어(${hairNear.celeb.name}) 대신 내 톤에 맞는 색으로 바꾸면 룩의 인상은 살리고 얼굴은 맑아 보입니다.` });
  const body = gaps.find((g) => g.axis === 'body-ratio' && !g.unavailable && Math.abs(g.gap) >= GAP_SIMILAR);
  if (body) out.push({ difficulty: 'hard', area: 'outfit', title: '실루엣으로 비율 맞추기', detail: body.comment });
  return out;
}

function buildDoNotCopy(ctx: GuideContext, subs: ColorSubstitution[], p: MyPalette, gaps: Gap[], hairNear?: { celeb: NamedColor; mine: NamedColor; avoid: boolean }): DoNot[] {
  const out: DoNot[] = [];
  for (const s of subs) {
    if (s.keepOriginal || FAR_FROM_FACE.has(s.category) || s.category === 'jewelry') continue;
    const w = nearWorst(s.celebColor.hex, p);
    if (w.near) out.push({ element: `얼굴 가까이 ${s.celebColor.name} ${s.itemName}`, reason: `내 워스트 컬러(${w.color.name})와 가까워 얼굴이 칙칙하거나 창백해 보일 수 있습니다.`, alternative: `${s.myColor.name} ${s.itemName}` });
  }
  if (hairNear?.avoid) out.push({ element: `${hairNear.celeb.name} 헤어`, reason: ctx.report.hair.tip, alternative: `${hairNear.mine.name} 헤어` });
  const metal = subs.find((s) => s.category === 'jewelry' && !s.keepOriginal);
  if (metal) out.push({ element: `${metal.celebColor.name} 주얼리`, reason: '내 추천 금속과 색이 달라 피부가 탁해 보일 수 있습니다.', alternative: `${metal.myColor.name} 주얼리` });
  const contrast = gaps.find((g) => g.axis === 'contrast' && !g.unavailable);
  if (contrast && contrast.gap >= GAP_LARGE)
    out.push({ element: '얼굴 가까이 강한 명도 대비 (블랙 × 화이트 등)', reason: '연예인보다 내 대비 수준이 낮아 얼굴이 옷에 묻힐 수 있습니다.', alternative: `얼굴 옆은 ${softContrastPair(p)}처럼 한 단계 부드러운 대비, 명도 차는 하의·신발에서` });
  // '선명한 원색' 주의는 룩에 실제로 고채도 색이 있을 때만 (무채색 룩에 원색 주의를 띄우지 않는다)
  const chromaGap = gaps.find((g) => g.axis === 'chroma' && !g.unavailable);
  if (chromaGap && chromaGap.gap >= GAP_LARGE && hasVividColor([...ctx.vibe.outfit.items.map((i) => i.color), ...ctx.vibe.palette.main, ...ctx.vibe.palette.sub, ...ctx.vibe.palette.accent]))
    out.push({ element: '선명한 원색을 얼굴 가까이', reason: '내 피부보다 채도가 강해 색이 얼굴보다 먼저 보입니다.', alternative: `원색은 소품으로, 얼굴 옆은 ${p.best[0]?.name ?? '내 베스트 컬러'}` });
  const warm = gaps.find((g) => g.axis === 'warmth' && !g.unavailable);
  if (warm && Math.abs(warm.gap) >= GAP_LARGE && !out.length)
    out.push({ element: warm.gap > 0 ? '따뜻한 색 상의' : '차가운 색 상의', reason: '연예인과 언더톤이 반대라 같은 색이 다르게 보입니다.', alternative: `${p.tops[0]?.name ?? '내 상의 추천색'}` });
  // 사진 보정 색감은 항상 주의 (비교 기준이 사진이라서)
  out.push({ element: '사진의 보정 색감 그대로', reason: ctx.vibe.personalColor.lightingCaveat || '연예인 사진은 조명·보정이 들어가 실제 색과 다를 수 있습니다.', alternative: '자연광에서 내 팔레트 색으로 확인' });
  return dedupeDoNotCopy(out);
}

/** 고채도(원색) 판단 기준 CIELAB C* */
export const VIVID_MIN_CHROMA = 40;
export function hasVividColor(colors: { hex: string }[]): boolean {
  return colors.some((c) => chroma(hexToLab(c.hex)) >= VIVID_MIN_CHROMA);
}

/** 같은 주의를 다른 말로 쓴 항목을 한 묶음으로 본다 (규칙·AI 병합에서 앞의 항목만 남긴다) */
const DO_NOT_COPY_GROUPS: [string, RegExp][] = [
  ['vivid', /원색|고채도|비비드|쨍한/],
  ['retouch', /보정|필터|편집|사진\s*(의\s*)?색감/],
  ['contrast', /명도\s*대비|강한\s*대비|블랙\s*[×x]\s*화이트/],
];
export function doNotCopyKey(element: string): string {
  for (const [k, re] of DO_NOT_COPY_GROUPS) if (re.test(element)) return k;
  return element.replace(/\s+/g, '');
}
export function dedupeDoNotCopy(items: DoNot[], max = 6): DoNot[] {
  const seen = new Set<string>();
  return items.filter((d) => {
    const k = doNotCopyKey(d.element);
    return seen.has(k) ? false : (seen.add(k), true);
  }).slice(0, max);
}

/* ------------------------------------------------------------------ 조립 */

/** 색 주의 사진의 코디 치환 사유 끝에 붙는 문장 */
export const COLOR_CAUTION_NOTE = '사진 조명·보정 때문에 원래 색이 실제와 다를 수 있습니다.';

export function buildRuleGuide(input: GuideContext): GuideDraft {
  // 분석이 제한된 사진(강행 분석): 사유를 가이드에 싣고, 인물이 없으면 사람에서 잰 값이 아닌 코디·얼굴 색·체형은 쓰지 않는다
  // 사진 색이 실제와 다를 수 있으면(아주 어두움·역광·강한 보정) 피부·헤어 색은 빼고, 코디 치환 사유에 불확실성을 적는다
  const limits = analysisLimits(input.vibe.analyzability);
  const ctx: GuideContext = { ...input, vibe: guideVibe(input.vibe) };
  const { report: r, vibe: v } = ctx;
  const p = paletteFromReport(r);
  const subs = substituteOutfit(v, p).map((x) => (limits.colorCaution ? { ...x, reason: `${x.reason} ${COLOR_CAUTION_NOTE}` } : x));
  const gaps = computeGaps(r, v, ctx.myBody);
  const paletteMapping = mapCelebPalette(v, p);
  const hair = hairGuide(ctx, p);
  const makeup = makeupGuide(ctx);
  const mood = moodGuide(ctx, gaps);
  const name = celebDisplayName(ctx);
  const changed = subs.filter((s) => !s.keepOriginal);
  const big = largestGaps(gaps, 2);
  // 요약은 아이템 치환과 사진 팔레트 매핑을 함께 본다 (매핑에서 색이 바뀌었는데 '그대로'라고 쓰지 않는다)
  const mapChanged = paletteMapping.filter((m) => m.celeb.hex.toUpperCase() !== m.mine.hex.toUpperCase()).length;
  const colorLine = changed.length
    ? `${changed.length}개 아이템 색만 바꾸면 룩의 구성은 그대로 살릴 수 있습니다.`
    : !subs.length
      ? limits.noPerson
        ? `사진에서 인물을 찾지 못해 코디 색 치환은 하지 않았고, 사진 팔레트 ${paletteMapping.length}색 중 ${mapChanged}색을 내 팔레트로 옮겼습니다.`
        : mapChanged
          ? `사진에서 코디 아이템을 찾지 못해 사진 팔레트 ${paletteMapping.length}색 중 ${mapChanged}색을 내 팔레트로 옮겼습니다.`
          : '사진에서 코디 아이템을 찾지 못했고, 사진 팔레트는 이미 내 팔레트와 가깝습니다.'
      : mapChanged
        ? `코디 아이템 색은 내 팔레트와 가까워 그대로 두고, 사진 팔레트 중 ${mapChanged}색만 내 팔레트 색으로 옮겼습니다.`
        : '코디 색이 이미 내 팔레트와 가까워 그대로 참고해도 됩니다.';
  const summary =
    `${name}의 ${wj(v.lookName, '을/를')} ${r.type.nameKo} 기준으로 옮겼습니다. ` +
    colorLine +
    (big.length ? ` 가장 큰 차이는 ${big.map((g) => g.label).join('·')}입니다.` : '') +
    (limits.colorCaution ? ' 사진 색이 실제와 다를 수 있어 색은 참고만 하세요.' : '');

  const faceSummary = hair.hairNear
    ? hair.hairNear.deltaE < 8
      ? `헤어 색은 그대로 따라 해도 되고, ${r.variant.gender === 'female' ? '메이크업' : '그루밍'}은 내 톤에 맞춥니다.`
      : `헤어는 ${hair.hairNear.mine.name} 쪽으로, ${r.variant.gender === 'female' ? '메이크업' : '그루밍'}은 내 톤에 맞춥니다.`
    : `헤어는 내 추천 컬러 안에서 고르고, ${r.variant.gender === 'female' ? '메이크업' : '그루밍'}은 내 톤에 맞춥니다.`;

  const outfitSummary = subs.length
    ? `${subs.length}개 아이템 중 ${changed.length}개 색을 내 팔레트로 바꾸고 나머지는 유지합니다.`
    : limits.noPerson
      ? '사진에서 인물을 찾지 못해 코디 색 치환은 하지 않았습니다. 팔레트 매핑만 참고하세요.'
      : '사진에서 코디 아이템을 찾지 못해 팔레트 매핑만 제안합니다.';

  const moodSummary = mood.keywords.length ? `${mood.keywords.slice(0, 3).join(', ')} 분위기를 내 색으로 표현합니다.` : '분위기는 소재와 실루엣으로 표현합니다.';

  return {
    reportId: r.id,
    vibeAnalysisId: v.id,
    celebId: v.celebId,
    celebName: name,
    lookName: v.lookName,
    thumbnail: v.image,
    summary,
    face: { hair: hair.items, makeup: makeup.items, summary: faceSummary },
    outfit: { substitutions: subs, items: outfitItems(ctx, subs, p), summary: outfitSummary },
    mood: { keywords: mood.keywords, items: mood.items, summary: moodSummary },
    paletteMapping,
    gaps,
    actions: orderActions(buildActions(ctx, subs, p, gaps, hair.hairNear, makeup.lip)),
    doNotCopy: buildDoNotCopy(ctx, subs, p, gaps, hair.hairNear),
    ...(limits.limited || limits.colorCaution ? { limitations: guideLimitations(limits) } : {}),
  };
}

/** 팔레트 매핑에서 실제로 바뀐 색 수 */
export function changedCount(g: Pick<GuideDraft, 'outfit'>): number {
  return g.outfit.substitutions.filter((s) => !s.keepOriginal).length;
}

