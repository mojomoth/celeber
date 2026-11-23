/**
 * 규칙 초안 생성 → (AI 또는 Mock) → 계약 VibeAnalysis 조립. 순수 함수 (서버/테스트 공용).
 */
import type { Analyzability, ImageRef, NamedColor, OutfitItem, VibeAnalysis, VibePersonalColor } from '@celeber/core/contracts';
import { VibeAnalysisSchema } from '@celeber/core/contracts';
import { colorNameKo, deltaE2000, describeColor, hexToLab } from '@celeber/core/color';
import { classifyMeasuredColors, getToneProfile, toneSeason } from '@celeber/core/personal-color';
import { UNDEREXPOSED_ITEM_NOTE, forceAnalyzable, isUnderexposed, judgeAnalyzability, mergeAnalyzability, resolveMeasurement } from './analyzability';
import { type VibeAi, clamp01, normalizeHex } from './ai-schema';
import type { ServerImageStats, VibeMeasurement } from './measurement';
import { frameLabelFromRatio } from './pose';
import {
  type Palette,
  type RuleOutfit,
  type RulePersonalColor,
  lightingCaveat,
  ruleLookName,
  ruleMood,
  ruleOutfitFromMeasurement,
  ruleOutfitFromStats,
  ruleOutfitSummary,
  rulePalette,
  rulePersonalColor,
  ruleSilhouette,
  ruleStyleKeywords,
  reconcileUndertone,
  toneAgreement,
  vibeColorConfidence,
} from './rules';

export interface RuleDraft {
  measured: boolean;
  /**
   * 규칙 판정에 실제로 쓴 측정값. 검출기 실패·강제 분석(인물 미검출) 등으로 입력 측정값을 버렸으면 undefined.
   * 프롬프트와 최종 조립에는 이 값을 써야 한다.
   */
  measurement: VibeMeasurement | undefined;
  /** 입력 측정값이 있었지만 믿을 수 없어 서버 통계 경로로 판정함 */
  measurementDropped: boolean;
  /** 사용자가 '그래도 분석'을 선택함 (AI 판정과 병합한 뒤에도 유지) */
  forced: boolean;
  analyzability: Analyzability;
  outfit: RuleOutfit;
  palette: Palette;
  styleKeywords: string[];
  silhouette: string;
  summary: string;
  mood: { keywords: string[]; firstImpression: string; references: string[] };
  lookName: string;
  personalColor: RulePersonalColor;
  body?: VibeAnalysis['body'];
}

/** 사람 몸에서 나올 수 있는 비율 범위 (camera-body RATIO_BOUNDS와 같은 값). 벗어나면 전신 비율은 측정하지 않은 것으로 둔다. */
const BODY_BOUNDS = { headsTall: [3, 13], upperToLower: [0.3, 3], legToHeight: [0.2, 0.85], shoulderToHip: [0.4, 3] } as const;
export function plausibleBody(b: NonNullable<VibeMeasurement['body']>): boolean {
  return (Object.keys(BODY_BOUNDS) as (keyof typeof BODY_BOUNDS)[]).every((k) => {
    const v = b[k];
    return v === undefined || (Number.isFinite(v) && v >= BODY_BOUNDS[k][0] && v <= BODY_BOUNDS[k][1]);
  });
}

/** 측정값/통계 → 규칙 초안. force=true면 '여러 명' 등을 경고로 낮춰 진행 */
export function buildRuleDraft(input: VibeMeasurement | undefined, stats: ServerImageStats | undefined, opts: { force?: boolean } = {}): RuleDraft {
  const resolved = resolveMeasurement(input, opts);
  const m = resolved.measurement;
  let analyzability = judgeAnalyzability(m, stats, { fallback: resolved.fallback });
  if (opts.force) analyzability = forceAnalyzable(analyzability);
  // 브라우저 측정이 있으면 측정 영역만 쓴다 (상반신/얼굴 사진에서 중앙 하단을 하의로 오인하지 않도록)
  const outfit = m ? ruleOutfitFromMeasurement(m) : stats ? ruleOutfitFromStats(stats) : { items: [], clusters: [], notes: [] };
  if (!analyzability.partial.outfit) outfit.items = outfit.items.filter((i) => i.category !== 'shoes');
  const palette = rulePalette(outfit.clusters, m?.face?.lips?.rgb);
  const styleKeywords = ruleStyleKeywords(palette);
  const frameLabel = frameLabelFromRatio(m?.body?.shoulderToHip);
  const body: VibeAnalysis['body'] =
    m?.body && m.pose?.framing === 'full-body' && plausibleBody(m.body)
      ? {
          measured: true,
          headsTall: m.body.headsTall,
          upperToLower: m.body.upperToLower,
          legToHeight: m.body.legToHeight,
          shoulderToHip: m.body.shoulderToHip,
          frameLabel,
          notes: ['PoseLandmarker 관절 좌표 기반 근사치입니다. 원근·자세·신발 굽에 따라 달라집니다.', '어깨/골반 비는 관절 사이 거리라 실제 외곽선 비보다 크게 나옵니다.'],
        }
      : undefined;
  const silhouette = ruleSilhouette(outfit.items, analyzability.framing, body?.frameLabel);
  return {
    measured: !!m?.face,
    measurement: m,
    measurementDropped: !!input && !m,
    forced: !!opts.force,
    analyzability,
    outfit,
    palette,
    styleKeywords,
    silhouette,
    summary: ruleOutfitSummary(outfit.items, styleKeywords),
    mood: ruleMood(styleKeywords, palette),
    lookName: ruleLookName(styleKeywords, palette),
    personalColor: rulePersonalColor(m, stats, analyzability.partial.personalColor),
    body,
  };
}

/** 규칙 초안 → AI 스키마 형태 (Mock 응답). 같은 입력이면 같은 출력 */
export function draftToAi(d: RuleDraft): VibeAi {
  const pc = d.personalColor.pc;
  return {
    analyzability: {
      analyzable: d.analyzability.analyzable,
      personCount: d.analyzability.personCount,
      framing: d.analyzability.framing,
      outfit: d.analyzability.partial.outfit,
      personalColor: d.analyzability.partial.personalColor,
      mood: d.analyzability.partial.mood,
      issues: [],
    },
    outfit: {
      items: d.outfit.items.map((i) => ({
        category: i.category,
        name: i.name,
        color: { hex: i.color.hex, name: i.color.name },
        secondaryColors: (i.secondaryColors ?? []).map((c) => ({ hex: c.hex, name: c.name })),
        material: i.material ?? '',
        fit: i.fit ?? '',
        pattern: i.pattern ?? '',
        note: i.note ?? '',
        box: i.box ?? { x: 0, y: 0, w: 0, h: 0 },
      })),
      styleKeywords: d.styleKeywords,
      silhouette: d.silhouette,
      summary: d.summary,
    },
    personalColor: {
      skinHex: pc.skin?.hex ?? '',
      hairHex: pc.hair?.hex ?? '',
      eyeHex: pc.eyes?.hex ?? '',
      tone: pc.tone ?? 'unknown',
      undertone: pc.undertone ?? 'unknown',
      confidence: pc.confidence,
      evidence: [],
      lightingCaveat: '',
    },
    mood: d.mood,
    palette: d.palette,
    lookName: d.lookName,
  };
}

/** AI 프롬프트 (측정 요약 JSON 포함). 인물 이름은 넣지 않는다. */
export function buildVibePrompt(d: RuleDraft, input: VibeMeasurement | undefined, stats: ServerImageStats | undefined): string {
  // 규칙 판정이 버린 측정값(검출기 실패 등)은 AI에게도 근거로 주지 않는다
  const m = d.measurementDropped ? undefined : input;
  const pc = d.personalColor.pc;
  const measured = {
    image: m ? { width: m.width, height: m.height } : stats ? { width: stats.width, height: stats.height } : undefined,
    measuredBy: m ? 'browser-mediapipe' : d.measurementDropped ? 'server-pixel-stats (browser detector failed or found no person)' : 'server-pixel-stats',
    personCount: m ? Math.max(m.faceCount, m.poseCount) : undefined,
    framing: d.analyzability.framing,
    ruleIssues: d.analyzability.reasons.map((r) => `${r.code}: ${r.message}`),
    outfitRegions: d.outfit.items.map((i) => ({ category: i.category, measuredColor: i.color.hex, colorName: i.color.name, box: i.box })),
    outfitNotes: d.outfit.notes,
    personalColor: pc.skin
      ? {
          skin: pc.skin.hex,
          skinLab: pc.skin.lab,
          hair: pc.hair?.hex,
          eyes: pc.eyes?.hex,
          // 규칙 톤·축은 넣지 않는다. AI 톤은 교차 검증(신뢰도 ±)에 쓰므로 규칙 판정을 보면 그대로 따라간다
          measuredFromFaceLandmarks: pc.measured,
        }
      : undefined,
    scene: m ? { meanLuma: Math.round(m.scene.meanLuma), cctK: m.scene.cctK, grayscale: m.scene.grayscale } : stats ? { meanLuma: Math.round(stats.meanLuma), grayscale: stats.grayscale } : undefined,
    body: d.body,
  };
  return [
    '첨부한 사진의 인물에 대해 코디, 퍼스널컬러, 분위기를 분석해 주세요.',
    '먼저 분석 가능성(인물 수, 프레이밍, 불가 사유)을 판정하고, 가능한 부분만 채우세요.',
    '코디: 보이는 아이템별로(아우터/상의/하의/원피스/신발/가방/액세서리/모자/안경/주얼리) 종류, 주색(hex+한국어 이름), 소재, 핏, 패턴, 사진 위 위치(box).',
    '퍼스널컬러: 피부/헤어/눈동자 색 hex, 추정 12톤, 언더톤, 근거, 신뢰도(0..1), 조명 한계.',
    '분위기: 무드 키워드 3~5개, 첫인상 한 문장, 이미지 레퍼런스 단어 2~4개, 컬러 팔레트(주조/보조/포인트 각 1~2색).',
    '',
    `브라우저/서버 측정값(JSON): ${JSON.stringify(measured)}`,
  ].join('\n');
}

const toNamed = (c: { hex: string; name: string }, fallbackHex?: string): NamedColor | null => {
  const hex = normalizeHex(c.hex) ?? (fallbackHex ? normalizeHex(fallbackHex) : null);
  if (!hex) return null;
  return { hex, name: c.name?.trim() || colorNameKo(hex) };
};

function sanitizeBox(b: { x: number; y: number; w: number; h: number } | undefined) {
  if (!b) return undefined;
  const x = clamp01(b.x);
  const y = clamp01(b.y);
  const w = Math.min(1 - x, clamp01(b.w));
  const h = Math.min(1 - y, clamp01(b.h));
  if (w <= 0.005 || h <= 0.005) return undefined;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

/**
 * AI 아이템 정리: hex 검증, box 정규화, 규칙 초안 box/색으로 보강.
 * @param opts.measured 규칙 초안 색이 브라우저 측정 영역에서 나온 값인지. 아니면(사진 중앙 통계·인물 없음) 사진에 없는 색일 수 있어 비교 노트를 달지 않는다
 */
export function sanitizeAiItems(ai: VibeAi['outfit']['items'], rule: OutfitItem[], opts: { measured?: boolean } = {}): OutfitItem[] {
  const measured = opts.measured ?? true;
  const out: OutfitItem[] = [];
  for (const it of ai) {
    const ruleSame = rule.find((r) => r.category === it.category);
    const color = toNamed(it.color, ruleSame?.color.hex);
    if (!color) continue;
    const secondaryColors = it.secondaryColors.map((c) => toNamed(c)).filter((c): c is NamedColor => !!c);
    const box = sanitizeBox(it.box) ?? ruleSame?.box;
    const notes: string[] = [];
    if (it.note.trim()) notes.push(it.note.trim());
    // AI 노트가 이미 측정색·조명 차이를 말했으면 같은 내용을 한 번 더 붙이지 않는다
    const aiMentionsGap = /측정|조명/.test(it.note);
    if (measured && !aiMentionsGap && ruleSame && deltaE2000(hexToLab(ruleSame.color.hex), hexToLab(color.hex)) > 12) notes.push(`측정색 ${ruleSame.color.name}(${ruleSame.color.hex})과 차이가 있습니다(조명 영향 가능).`);
    out.push({
      category: it.category,
      name: it.name.trim() || ruleSame?.name || it.category,
      color,
      secondaryColors: secondaryColors.length ? secondaryColors : undefined,
      material: it.material.trim() || undefined,
      fit: it.fit.trim() || undefined,
      pattern: it.pattern.trim() || undefined,
      box,
      note: notes.length ? notes.join(' ') : undefined,
    });
  }
  return out;
}

function sanitizePaletteList(list: { hex: string; name: string }[], max = 3): NamedColor[] {
  return list
    .map((c) => toNamed(c))
    .filter((c): c is NamedColor => !!c)
    .slice(0, max);
}

/** AI 퍼스널컬러 + 규칙 측정 병합 */
export function mergePersonalColor(rule: RulePersonalColor, ai: VibeAi['personalColor'] | null, conditionsOk: boolean, grayscale: boolean): VibePersonalColor {
  const r = rule.pc;
  if (!ai) return r;
  const aiTone = ai.tone !== 'unknown' ? ai.tone : undefined;
  const aiEvidence = ai.evidence.map((e) => e.trim()).filter(Boolean);
  const caveat = [r.lightingCaveat, ai.lightingCaveat.trim()].filter(Boolean).join(' ');
  if (grayscale) return { ...r, lightingCaveat: caveat };

  if (r.measured && r.tone) {
    // 측정 기반 분류가 기준. AI는 교차 검증
    const agreement = toneAgreement(r.tone, aiTone);
    const cls = rule.classification;
    const conf = vibeColorConfidence({
      measured: true,
      conditionsOk,
      skinUsed: undefined,
      classifierMargin: cls?.margin,
      agreement,
      hasHair: !!r.hair,
      hasEyes: !!r.eyes,
    });
    // 측정 기반 신뢰도(초안)에 일치도 보정만 반영
    const delta = agreement === true ? 0.1 : agreement === 'season-only' ? 0.04 : agreement === false ? -0.1 : 0;
    const score = Math.max(0.05, Math.min(conditionsOk ? 0.85 : 0.3, Math.round((r.confidence + delta) * 100) / 100));
    const aiLine = aiTone ? `AI 판단: ${getToneProfile(aiTone).nameKo}${agreement === true ? ' (측정 판정과 일치)' : agreement === 'season-only' ? ' (계절 일치)' : ' (측정 판정과 다름)'}` : 'AI는 톤을 판단하지 않았습니다.';
    const agreementFactor = conf.factors.find((f) => f.includes('AI 판단'));
    return {
      ...r,
      confidence: score,
      evidence: [...r.evidence, aiLine, ...(agreementFactor ? [agreementFactor] : []), ...aiEvidence.slice(0, 3)],
      lightingCaveat: caveat,
    };
  }

  // 측정 없음 → AI 판단 기준. 축은 AI가 본 피부/헤어/눈 색으로 분류기를 돌려 계산 (갭 비교용)
  // 규칙 초안의 색·톤은 사진 중앙 픽셀(옷·배경일 수 있음)이라, AI가 비운 값을 그것으로 되살리지 않는다
  const skinHex = normalizeHex(ai.skinHex);
  const hairHex = normalizeHex(ai.hairHex);
  const eyeHex = normalizeHex(ai.eyeHex);
  const skin = skinHex ? describeColor(skinHex, 'skin') : undefined;
  const hair = hairHex ? describeColor(hairHex) : undefined;
  const eyes = eyeHex ? describeColor(eyeHex) : undefined;
  const tone = aiTone;
  if (!tone && !skin) return notJudgedPersonalColor(aiEvidence, caveat, 'AI가 사진에서 피부색과 톤을 판단하지 않았습니다.');
  const cls = skin ? classifyMeasuredColors({ skin: skin.lab, hair: hair?.lab, eyes: eyes?.lab }) : undefined;
  const conf = vibeColorConfidence({ measured: false, conditionsOk, agreement: toneAgreement(cls?.tone, aiTone), hasHair: !!hair, hasEyes: !!eyes, aiConfidence: clamp01(ai.confidence) });
  return reconcileUndertone({
    measured: false,
    skin,
    hair,
    eyes,
    season: tone ? toneSeason(tone) : undefined,
    tone,
    toneNameKo: tone ? getToneProfile(tone).nameKo : undefined,
    undertone: ai.undertone !== 'unknown' ? ai.undertone : tone ? cls?.undertone : undefined,
    axes: cls?.axes,
    confidence: tone ? conf.score : 0,
    evidence: [...aiEvidence, ...conf.factors, ...(skinHex ? ['피부·헤어·눈 색은 AI가 사진에서 읽은 값이며 픽셀 측정값이 아닙니다.'] : [])],
    lightingCaveat: caveat,
  });
}

/** 톤·피부색을 판단하지 않은 퍼스널컬러 (흑백과 같은 '판단 안 함' 표시) */
export function notJudgedPersonalColor(evidence: string[], lightingCaveat: string, reason: string): VibePersonalColor {
  return { measured: false, confidence: 0, evidence: [reason, ...evidence.filter((e) => e !== reason)], lightingCaveat };
}

/** 분석할 인물이 없다고 확정된 경우 (인물 없음·사진 아님 오류. '그래도 분석'으로 경고가 된 경우는 제외) */
function noSubjectReason(a: Analyzability): 'no-person' | 'not-photo' | null {
  const r = a.reasons.find((x) => (x.code === 'no-person' || x.code === 'not-photo') && x.severity === 'error');
  return r ? (r.code as 'no-person' | 'not-photo') : null;
}

const RULE_FILLED_NOTE = '규칙 추정: AI가 이 아이템을 따로 적지 않아 측정 영역 색으로 채웠습니다.';
const RULE_FILLED_NOTE_UNMEASURED = '규칙 추정색: AI가 이 아이템을 따로 적지 않아 사진 중앙 통계로 추정한 색으로 채웠습니다.';
const NO_SUBJECT_LOOK_NAME = { 'no-person': '인물이 없는 사진', 'not-photo': '사진이 아닌 이미지' } as const;

export interface AssembleInput {
  id: string;
  createdAt: string;
  image: ImageRef;
  celebName?: string;
  celebId?: string;
  celebImageId?: string;
  draft: RuleDraft;
  measurement?: VibeMeasurement;
  stats?: ServerImageStats;
  ai: { data: VibeAi; source: 'ai' | 'mock'; model: string | null };
}

/**
 * 최종 퍼스널컬러와 분석 가능성 표시를 맞춘다.
 * - 톤이 없으면 퍼스널컬러는 분석하지 못한 것 → partial false ('모두 분석 가능'과 '톤 없음'이 함께 나오지 않게)
 * - 얼굴을 직접 측정하지 않았으면 톤이 있어도 참고용 → partial false (목록·상세에 '참고용' 표시)
 */
export function settlePersonalColorPartial(a: Analyzability, pc: VibePersonalColor): Analyzability {
  if (!a.partial.personalColor || (pc.tone && pc.measured)) return a;
  const partial = { ...a.partial, personalColor: false };
  // 톤이 없으면 퍼스널컬러로는 분석 가능하다고 할 수 없다. 참고용 톤이 있으면 기존 판정을 유지한다
  const analyzable = pc.tone ? a.analyzable : a.analyzable && partial.outfit;
  return { ...a, partial, analyzable };
}

/** 최종 VibeAnalysis 조립 + 계약 검증 */
export function assembleVibeAnalysis(i: AssembleInput): VibeAnalysis {
  const { draft } = i;
  const isAi = i.ai.source === 'ai';
  const ai = isAi ? i.ai.data : null;
  // 규칙 판정이 버린 측정값(검출기 실패 등)은 조립에도 쓰지 않는다
  const m = draft.measurementDropped ? undefined : i.measurement;
  const measured = !!m;
  let analyzability = mergeAnalyzability(
    draft.analyzability,
    ai ? { ...ai.analyzability, issues: ai.analyzability.issues.filter((x) => x.message.trim()) } : null,
    measured,
    { force: draft.forced },
  );
  const grayscale = m?.scene.grayscale ?? i.stats?.grayscale ?? false;

  let items: OutfitItem[] = draft.outfit.items;
  let styleKeywords = draft.styleKeywords;
  let silhouette = draft.silhouette;
  let summary = draft.summary;
  let mood = draft.mood;
  let palette: Palette = draft.palette;
  let lookName = draft.lookName;
  const noSubject = noSubjectReason(analyzability);
  if (ai) {
    // AI가 비운 항목은 해당 분석이 가능할 때만 규칙 초안으로 채운다.
    // 인물이 없거나 코디 분석이 불가하면 초안(사진 중앙을 상의·하의로 본 값)은 사진에 없는 내용이 된다
    const outfitOk = analyzability.partial.outfit && !noSubject;
    const moodOk = analyzability.partial.mood && !noSubject;
    const aiItems = sanitizeAiItems(ai.outfit.items, draft.outfit.items, { measured: measured && !noSubject });
    const filledNote = measured ? RULE_FILLED_NOTE : RULE_FILLED_NOTE_UNMEASURED;
    items = aiItems.length ? aiItems : outfitOk ? draft.outfit.items.map((it) => ({ ...it, note: filledNote })) : [];
    const aiKeywords = ai.outfit.styleKeywords.map((s) => s.trim()).filter(Boolean).slice(0, 4);
    styleKeywords = aiKeywords.length ? aiKeywords : outfitOk ? draft.styleKeywords : [];
    silhouette = ai.outfit.silhouette.trim() || (outfitOk ? draft.silhouette : '실루엣을 분석하지 않았습니다.');
    summary = ai.outfit.summary.trim() || (outfitOk ? draft.summary : '코디를 분석하지 않았습니다.');
    const aiMoodKeywords = ai.mood.keywords.map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (aiMoodKeywords.length || ai.mood.firstImpression.trim())
      mood = {
        keywords: aiMoodKeywords,
        firstImpression: ai.mood.firstImpression.trim() || (moodOk ? draft.mood.firstImpression : ''),
        references: ai.mood.references.map((s) => s.trim()).filter(Boolean).slice(0, 5),
      };
    else if (!moodOk) mood = { keywords: [], firstImpression: '', references: [] };
    const p = { main: sanitizePaletteList(ai.palette.main), sub: sanitizePaletteList(ai.palette.sub), accent: sanitizePaletteList(ai.palette.accent) };
    palette = p.main.length ? p : outfitOk ? draft.palette : { main: [], sub: [], accent: [] };
    lookName = ai.lookName.trim().slice(0, 40) || (outfitOk ? draft.lookName : noSubject ? NO_SUBJECT_LOOK_NAME[noSubject] : '코디 분석 제한 사진');
  }
  if (!analyzability.partial.outfit && items.length && !ai) {
    // 규칙상 코디 분석 불가(흑백 등)면 아이템 색은 신뢰할 수 없음 → 표시하되 노트
    items = items.map((it) => ({ ...it, note: [it.note, '사진 조건 때문에 색이 부정확할 수 있습니다.'].filter(Boolean).join(' ') }));
  }
  if (isUnderexposed(m, i.stats)) items = items.map((it) => (it.note?.includes(UNDEREXPOSED_ITEM_NOTE) ? it : { ...it, note: [it.note, UNDEREXPOSED_ITEM_NOTE].filter(Boolean).join(' ') }));

  let personalColor = mergePersonalColor(draft.personalColor, ai?.personalColor ?? null, analyzability.partial.personalColor, grayscale);
  // 측정한 얼굴 없이 '인물 없음/사진 아님'이 확정되면 톤·피부색을 채우지 않는다 (중앙 픽셀은 풍경·옷일 수 있음)
  if (noSubject && !personalColor.measured && (personalColor.tone || personalColor.skin))
    personalColor = notJudgedPersonalColor(ai ? ai.personalColor.evidence.map((e) => e.trim()).filter(Boolean) : [], personalColor.lightingCaveat, noSubject === 'no-person' ? '인물이 없어 퍼스널컬러를 판단하지 않았습니다.' : '사진이 아니라 퍼스널컬러를 판단하지 않았습니다.');
  if (!personalColor.lightingCaveat) personalColor.lightingCaveat = lightingCaveat(m, i.stats);
  analyzability = settlePersonalColorPartial(analyzability, personalColor);

  const source: VibeAnalysis['source'] = isAi ? (measured ? 'hybrid' : 'ai') : 'mock';
  const analysis: VibeAnalysis = {
    id: i.id,
    version: 1,
    createdAt: i.createdAt,
    image: i.image,
    celebName: i.celebName?.trim() || undefined,
    celebId: i.celebId || undefined,
    celebImageId: i.celebImageId || undefined,
    analyzability,
    outfit: { items, styleKeywords, silhouette, summary },
    personalColor,
    mood,
    body: draft.body,
    palette,
    lookName,
    source,
    isMock: !isAi,
    model: isAi ? (i.ai.model ?? undefined) : undefined,
  };
  return VibeAnalysisSchema.parse(analysis);
}
