/**
 * 리포트 조립 (순수 함수): 얼굴 분석 + (선택) 전신 분석 + 분류 결과 + 서술 → PersonalColorReport.
 * 섹션 구조는 레퍼런스 카드(navy-men-personal-color-report-card.jpeg)와 1:1.
 */
import {
  type BodyAnalysis,
  type ConfidenceFactor,
  type FaceAnalysis,
  type Gender,
  METAL_LABEL_KO,
  type Metal,
  type PersonalColorClassification,
  type PersonalColorReport,
  PersonalColorReportSchema,
  type ReportConfidence,
  type SwatchShape,
  type Tone,
} from '@celeber/core/contracts';
import {
  COOL_GRADIENT,
  DEFAULT_CAUTIONS,
  DEFAULT_DISCLAIMER,
  DEFAULT_REPORT_SUBTITLE,
  WARM_GRADIENT,
  buildReportVariant,
  computeReportConfidence,
  getToneProfile,
  nearestInPalette,
  reportTitle,
  toneSeason,
  tonePaletteAll,
} from '@celeber/core/personal-color';
import { drapeAnchorFromAnalysis } from '@celeber/camera-face/lib';
import { toBodyStyling } from '@celeber/camera-body/lib';
import { type ReportNarrative, adaptGenderText, appGroomingTemplate, todayActionsTemplate } from './narrative';

/* ------------------------------------------------------------------ 드레이핑 조화도 */

/** 색이 톤의 추천 영역에 가까울수록 1, 워스트 영역에 가까울수록 0 (ΔE2000 차이 시그모이드) */
export function drapeHarmony(hex: string, tone: Tone): number {
  const p = getToneProfile(tone);
  const good = nearestInPalette(hex, tonePaletteAll(tone)).deltaE;
  const bad = nearestInPalette(hex, [...p.worst, ...p.drapeWorst]).deltaE;
  return Math.round((1 / (1 + Math.exp(-(bad - good) / 6))) * 100) / 100;
}

/* ------------------------------------------------------------------ 성별 변형 형태 */

export function topsShape(g: Gender): SwatchShape {
  return g === 'male' ? 'shirt' : g === 'female' ? 'blouse' : 'knit';
}
export function pointShape(g: Gender): SwatchShape {
  return g === 'male' ? 'tie' : g === 'female' ? 'scarf' : 'circle';
}
type AccessoryKind = PersonalColorReport['accessories']['items'][number]['kind'];
const KIND_LABEL: Record<AccessoryKind, string> = {
  watch: '시계',
  ring: '반지',
  necklace: '목걸이',
  earring: '귀걸이',
  bracelet: '팔찌',
  glasses: '안경테',
  belt: '벨트 버클',
  cufflinks: '커프스',
  bag: '가방 장식',
};
export function accessoryItems(metals: Metal[], g: Gender): PersonalColorReport['accessories']['items'] {
  const kinds: AccessoryKind[] = g === 'male' ? ['watch', 'watch', 'watch'] : g === 'female' ? ['earring', 'necklace', 'ring'] : ['watch', 'ring', 'glasses'];
  const ms = metals.length ? metals : (['silver'] as Metal[]);
  return kinds.map((kind, i) => {
    const metal = ms[i % ms.length];
    return { kind, metal, label: `${METAL_LABEL_KO[metal]} ${KIND_LABEL[kind]}` };
  });
}

/* ------------------------------------------------------------------ 신뢰도 */

export type RuleAiAgreement = boolean | 'season-only' | null;

export function ruleAiAgreement(ruleTone: Tone, aiTone: Tone | undefined | null): RuleAiAgreement {
  if (!aiTone) return null;
  if (aiTone === ruleTone) return true;
  return toneSeason(aiTone) === toneSeason(ruleTone) ? 'season-only' : false;
}

/** 색이 강한 인공 조명 (화이트밸런스 보정이 크게 개입하는 광원) */
const HARSH_LIGHT = new Set(['incandescent', 'warm-led', 'fluorescent', 'mixed']);
/** 피부 부위 간 색 편차가 이 값(ΔE)을 넘으면 조명 얼룩/색 번짐으로 본다 */
export const SKIN_SPREAD_UNRELIABLE_DE = 15;
/**
 * 사진 속 사람 피부로 볼 수 있는 보정 피부값 범위. 아주 어두운 피부도 정상 노출이면 L* 25, ITA -60° 안쪽이다.
 * 이 밖이면 노출 실패(너무 어둡거나 하얗게 날아감)로 보고 판정을 믿지 않는다.
 */
export const SKIN_PLAUSIBLE = { lMin: 25, lMax: 92, itaMin: -60, itaMax: 80 } as const;
/** 정면 사진 노출 오류 (camera-face quality 코드) */
const EXPOSURE_ERRORS: Record<string, string> = {
  'face-dark': '정면 얼굴이 너무 어두워',
  'face-bright': '정면 얼굴이 하얗게 날아가',
};
/** 재촬영 권장일 때 웜/쿨 %와 타입 명확도에 거는 신뢰도 상한 */
export const UNRELIABLE_TRUST = 0.4;

/** 보정 피부값이 사람 피부 범위를 벗어났는지 */
export function skinOutOfRange(face: FaceAnalysis): boolean {
  const s = face.skin.corrected;
  const { lMin, lMax, itaMin, itaMax } = SKIN_PLAUSIBLE;
  return s.lab.l < lMin || s.lab.l > lMax || s.ita < itaMin || s.ita > itaMax;
}

/**
 * 측정 조건이 판정을 믿기 어려운 수준인지. 다음 중 하나면 재촬영 권장(점수 상한 49, ② 아래 안내, ⑬ 맨 앞).
 * 1) 색이 강한 조명(백열·전구색 LED·형광·혼합, 3,800K 미만/8,000K 초과, 조명 품질 0.45 미만)에서 피부 부위 간 편차까지 큼
 * 2) 정면 사진에 노출 오류('얼굴이 너무 어둡습니다' 등)가 있는데 그대로 진행함
 * 3) 보정 피부 L*나 ITA가 사람 피부 범위를 벗어남
 * 분류기 1·2위 차가 커도(확신이 높아 보여도) 신뢰도가 '보통' 이상으로 나오지 않게 한다.
 */
export function unreliableCapture(face: FaceAnalysis): { unreliable: boolean; reason: string } {
  const env = face.environment;
  const harsh = HARSH_LIGHT.has(env.lightSource) || env.cctK < 3800 || env.cctK > 8000 || env.lightingQuality < 0.45;
  const spread = face.skin.regionSpreadDeltaE;
  const causes: string[] = [];
  const exposure = face.front.quality.issues.find((i) => i.severity === 'error' && EXPOSURE_ERRORS[i.code]);
  if (exposure) causes.push(`${EXPOSURE_ERRORS[exposure.code]} 피부색을 제대로 잴 수 없었습니다.`);
  if (skinOutOfRange(face)) {
    const s = face.skin.corrected;
    causes.push(`측정된 피부값(L* ${s.lab.l.toFixed(1)}, ITA ${Math.round(s.ita)}°)이 사람 피부에서 나오기 어려운 값입니다.`);
  }
  if (harsh && spread > SKIN_SPREAD_UNRELIABLE_DE) {
    causes.push(`${env.lightSourceLabel}(${env.cctK.toLocaleString('en-US')}K) 아래에서 이마·볼·턱 색 편차(ΔE ${spread.toFixed(1)})가 커서 웜/쿨 판정이 흔들릴 수 있습니다.`);
  }
  if (!causes.length) return { unreliable: false, reason: '' };
  const fix = exposure || causes.length > 1 || skinOutOfRange(face) ? '밝은 자연광을 마주 보고 정면에서 다시 촬영해 주세요.' : '자연광 정면에서 다시 촬영해 주세요.';
  return { unreliable: true, reason: `${causes.join(' ')} ${fix}` };
}

/**
 * 조명 자체가 판정을 흔들 수 있는 촬영인지 (부위 편차와 무관하게).
 * 환경 단계가 '재촬영 권장'을 냈거나, 조명 품질이 0.45 미만이거나, 색이 강한 인공 조명이면 true.
 * 이때 ③ 웜/쿨 %와 ⑭ 타입 구분 명확도를 조명 신뢰도(trust)만큼 50:50 쪽으로 줄이고, 점수 상한을 둔다.
 */
export function lightingCaution(face: FaceAnalysis): { flagged: boolean; trust: number; reason: string } {
  const env = face.environment;
  const harsh = HARSH_LIGHT.has(env.lightSource) || env.cctK < 3800 || env.cctK > 8000;
  const flagged = env.retakeRecommended || env.lightingQuality < 0.45 || harsh;
  if (!flagged) return { flagged: false, trust: 1, reason: '' };
  const lq = Math.max(0, Math.min(1, env.lightingQuality));
  const trust = Math.round((0.4 + 0.4 * Math.min(1, lq / 0.75)) * 100) / 100;
  const why = [
    env.retakeRecommended ? '환경 촬영에서 재촬영 권장' : '',
    `${env.lightSourceLabel} ${env.cctK.toLocaleString('en-US')}K`,
    `조명 품질 ${Math.round(lq * 100)}점`,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    flagged,
    trust,
    reason: `조명 확인 필요: ${why}. ${harsh ? '색이 있는 조명에서는' : '노출·조명 상태가 나쁘면'} 보정 후에도 웜/쿨이 바뀔 수 있어 웜/쿨 비율과 타입 확신도를 낮춰 표시했습니다. 자연광 정면에서 다시 촬영해 보세요.`,
  };
}

/** 웜/쿨 %와 타입 명확도에 쓰는 측정 신뢰도: 조명 경고면 조명 신뢰도, 재촬영 권장이면 최대 0.4 */
export function captureTrust(face: FaceAnalysis): number {
  const t = lightingCaution(face).trust;
  return unreliableCapture(face).unreliable ? Math.min(t, UNRELIABLE_TRUST) : t;
}

/** 조명 신뢰도만큼 웜 %를 50 쪽으로 당긴다 (합 100 유지) */
export function softenWarmPercent(warm: number, trust: number): { warm: number; cool: number } {
  const w = Math.round(50 + (warm - 50) * Math.max(0, Math.min(1, trust)));
  return { warm: w, cool: 100 - w };
}

/** 조명 경고 시 점수 상한 */
export const FLAGGED_LIGHTING_SCORE_CAP = 55;

/** 사진 밝기가 적정이 아니면 조명 요인 점수에 거는 상한 */
const BRIGHTNESS_LIGHT_CAP: Record<string, number> = { 'too-dark': 0.45, dim: 0.7, bright: 0.7, 'too-bright': 0.45 };
const BRIGHTNESS_TEXT: Record<string, string> = {
  'too-dark': '사진이 너무 어둡습니다',
  dim: '사진이 조금 어둡습니다',
  bright: '사진이 조금 밝습니다',
  'too-bright': '사진이 너무 밝아 하얗게 날아간 부분이 있습니다',
};

/** ⑭ '조명 조건' 근거: 조명 품질과 사진 밝기를 함께 본다 ('조명이 고르고 밝기가 적정합니다 (… 조금 어두움)' 같은 모순 방지) */
export function lightingDetail(env: FaceAnalysis['environment'], lq: number): string {
  const where = `${env.lightSourceLabel} · ${env.cctK.toLocaleString('en-US')}K`;
  const bright = BRIGHTNESS_TEXT[env.brightness.level];
  if (!bright) return `${lq >= 0.75 ? '조명이 고르고 밝기가 적정합니다.' : lq >= 0.5 ? '조명에 일부 제약이 있습니다.' : '조명 조건이 좋지 않습니다.'} (${where})`;
  const head = lq >= 0.75 ? '조명은 고른 편이지만' : lq >= 0.5 ? '조명에 일부 제약이 있고' : '조명 조건이 좋지 않고';
  return `${head} ${bright}. (${where})`;
}

/**
 * ⑭ 피부 측정 품질 근거: camera-face의 내부 사유(게인·강도·픽셀 수)를 사용자 문장으로 바꾼다.
 * 문제를 알리는 사유를 앞에 두고 최대 2개만 쓴다.
 */
export function skinReasonTexts(reasons: readonly string[]): string[] {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const r of reasons) {
    let m: RegExpExecArray | null;
    if (/조명 추정 신뢰도가 낮아/.test(r)) problems.push('조명 추정이 불확실해 색 보정을 약하게 적용했습니다.');
    else if ((m = /^촬영 품질 오류\((.+?)\)/.exec(r))) problems.push(`촬영 문제(${m[1]})가 있어 점수를 낮췄습니다.`);
    else if (/^촬영 품질 경고/.test(r)) problems.push('촬영 품질 경고가 있어 점수를 낮췄습니다.');
    else if (/^피부 샘플 픽셀이 적습니다/.test(r)) problems.push('피부가 보이는 면적이 작습니다. 얼굴을 더 크게 찍으면 정확해집니다.');
    else if (/^일부 피부 영역/.test(r)) problems.push('이마·볼·턱 중 일부를 측정하지 못했습니다.');
    else if (/보정량이 (커서|큽니다)/.test(r)) problems.push('조명 색 보정량이 커서 원래 조명의 영향이 남아 있을 수 있습니다.');
    else if (/^피부 밝기 편차/.test(r)) problems.push('그림자나 반사광 때문에 피부 밝기 편차가 큽니다.');
    else if (/^보정에 쓸 배경 정보가 없어/.test(r)) problems.push('조명 색을 추정할 배경이 없어 원본 색을 그대로 썼습니다.');
    else if (/^흰 종이 기준 백색/.test(r)) notes.push('흰 종이를 기준으로 색을 보정했습니다.');
    else if (/gray-world 게인 기하 평균/.test(r)) notes.push('환경 사진과 얼굴 배경으로 조명 색을 추정해 보정했습니다.');
    else if ((m = /^(환경 사진|얼굴 사진 배경) gray-world/.exec(r))) notes.push(`${m[1] === '환경 사진' ? '환경 사진' : '얼굴 배경'}으로 조명 색을 추정해 보정했습니다.`);
    // 그 밖(픽셀 수, 조명 품질 반영, 마스크 사용, 부위 편차)은 다른 요인과 겹치거나 내부 정보라 뺀다.
  }
  return [...problems, ...notes].slice(0, 2);
}

/** 정면 촬영 오류 코드 → 리포트 근거용 짧은 이름 (camera-face quality 코드) */
const CAPTURE_ISSUE_LABEL: Record<string, string> = {
  'face-dark': '얼굴 어두움',
  'face-bright': '얼굴 과다 노출',
  'face-cut': '얼굴 잘림',
  'too-small': '얼굴이 작음',
  'too-large': '얼굴이 너무 가까움',
  yaw: '고개 좌우 각도',
  pitch: '고개 위아래 각도',
  roll: '고개 기울어짐',
  'off-center': '얼굴 위치',
  'no-face': '얼굴 미검출',
};

/** ⑭ 정면 검출·촬영 품질: 촬영 오류 1건마다 0.7배 (강행 촬영이 점수에 드러나게) */
export function captureQualityScore(q: FaceAnalysis['front']['quality']): number {
  const errors = q.issues.filter((i) => i.severity === 'error').length;
  return q.detectionScore * (q.passed ? 1 : 0.8) * 0.7 ** errors;
}

/** ⑭ 실제 측정 품질에서 신뢰도 계산 (고정값 없음) */
export function reportConfidence(face: FaceAnalysis, cls: PersonalColorClassification, aiTone: Tone | null | undefined): ReportConfidence {
  const q = face.front.quality;
  const env = face.environment;
  const light = lightingCaution(face);
  const u = unreliableCapture(face);
  const trust = captureTrust(face);
  const lq = Math.min(env.lightingQuality, BRIGHTNESS_LIGHT_CAP[env.brightness.level] ?? 1);
  // 신뢰도가 낮으면 1·2위 차를 그대로 믿지 않는다. 0.35에서 만점이므로 먼저 자르고 곱해야 표시 점수에도 감점이 보인다.
  const margin = Math.min(cls.margin, 0.35) * trust;
  const base = computeReportConfidence({
    lightingQuality: lq,
    whiteBalanceDeltaE: face.skin.whiteBalance.deltaE,
    whiteBalanceMethod: face.skin.whiteBalance.method,
    skinConfidence: face.skin.confidence,
    faceDetectionScore: captureQualityScore(q),
    skinSpreadDeltaE: face.skin.regionSpreadDeltaE,
    classifierMargin: margin,
    ruleAiAgreement: ruleAiAgreement(cls.tone, aiTone),
    hasHair: !!face.featureColors.hair,
    hasEyes: !!face.featureColors.eyes,
  });
  // 근거 문구에 실제 측정값을 덧붙인다
  const errorLabels = [...new Set(q.issues.filter((i) => i.severity === 'error').map((i) => CAPTURE_ISSUE_LABEL[i.code] ?? '촬영 기준 미달'))];
  const factors: ConfidenceFactor[] = base.factors.map((f) => {
    if (f.key === 'lighting') return { ...f, detail: lightingDetail(env, lq) };
    if (f.key === 'face-detection') {
      const issues = errorLabels.length ? `, ${errorLabels.join(' · ')}` : '';
      return { ...f, detail: `${f.detail} (검출 ${Math.round(q.detectionScore * 100)}%, 좌우 ${Math.round(face.front.yawDeg)}°${issues})` };
    }
    if (f.key === 'classifier-margin') {
      const gap = Math.round(cls.margin * 100);
      if (trust >= 1) return { ...f, detail: `${f.detail} (1·2위 차 ${gap}%p)` };
      const why = u.unreliable ? '촬영 상태를 고려해' : '조명 영향을 고려해';
      if (cls.margin / 0.35 >= 0.57) return { ...f, detail: `1·2위 차는 ${gap}%p지만 ${why} 확신도를 낮춰 반영했습니다.` };
      return { ...f, detail: `보조 타입과 점수가 가깝습니다(1·2위 차 ${gap}%p). ${why} 확신도를 더 낮췄습니다.` };
    }
    if (f.key === 'skin-uniformity' && u.unreliable && face.skin.regionSpreadDeltaE > SKIN_SPREAD_UNRELIABLE_DE) return { ...f, detail: `${f.detail} (조명 얼룩 의심)` };
    if (f.key === 'skin-measurement') {
      const extra = skinReasonTexts(face.skin.confidenceReasons);
      return extra.length ? { ...f, detail: `${f.detail} ${extra.join(' ')}` } : f;
    }
    return f;
  });
  if (u.unreliable) {
    // 앱 단 감점: 점수의 70%, 최대 49 → 항상 '낮은 신뢰도'. 점수는 여전히 측정값에 따라 달라진다.
    const score = Math.min(49, Math.round(base.score * 0.7));
    return { score, grade: 'low', gradeLabel: '낮은 신뢰도 · 재촬영 권장', factors };
  }
  if (light.flagged) {
    // 상한 55로 부드럽게 눌러(50 초과분은 10%만 반영) 측정 품질에 따른 순서는 유지한다.
    const score = base.score <= 50 ? base.score : Math.min(FLAGGED_LIGHTING_SCORE_CAP, Math.round(50 + (base.score - 50) * 0.1));
    const grade = score >= 50 ? 'medium' : 'low';
    return { score, grade, gradeLabel: grade === 'medium' ? '보통 신뢰도 · 조명 확인 필요' : '낮은 신뢰도 · 조명 확인 필요', factors };
  }
  return { ...base, factors };
}

/* ------------------------------------------------------------------ 조립 */

export interface AssembleInput {
  id: string;
  now: string;
  faceSessionId: string;
  face: FaceAnalysis;
  bodySessionId: string | null;
  body: BodyAnalysis | null;
  gender: Gender;
  userSelected: boolean;
  classification: PersonalColorClassification;
  narrative: ReportNarrative;
  /** 'ai' = AI 서술(Anthropic 또는 OpenAI), 'mock' = 키 없음/실패로 템플릿, 'rules' = AI를 일부러 건너뜀 */
  narrativeSource: 'ai' | 'mock' | 'rules';
  aiOpinion?: PersonalColorReport['aiOpinion'];
  model?: string | null;
}

export function reportBasis(face: FaceAnalysis, body: BodyAnalysis | null): string[] {
  const b = ['업로드한 정면 얼굴 사진'];
  if (face.side) b.push('측면 얼굴 사진');
  if (face.environment.image) b.push('환경(조명) 사진');
  if (body?.status === 'complete') b.push('전신 사진');
  return b;
}

/**
 * 촬영 단계 경고 → 리포트 문구. 촬영 중에만 할 수 있는 행동 지시('…을 눌러 주세요')는 리포트에서 따를 수 없으므로
 * '무엇이 결과에 어떤 영향을 줬는지'로 바꾸거나 뺀다.
 */
export function reportWarningText(w: { code: string; message: string }): string | null {
  const code = w.code.replace(/^env:/, '');
  if (code === 'white-ref-invalid') return '흰 종이 기준점이 과다 노출되었거나 너무 작아 기준 백색으로 쓰지 않았습니다.';
  if (code === 'side:skipped' || code === 'side:no-landmarks') return null; // 퍼스널컬러와 무관
  if (/(눌러|탭해|터치해) 주세요/.test(w.message)) return null;
  return w.message;
}

function cautionItems(face: FaceAnalysis): string[] {
  const u = unreliableCapture(face);
  const light = lightingCaution(face);
  const retake = u.unreliable ? [`재촬영 권장: ${u.reason}`] : light.flagged ? [light.reason] : [];
  const measured = face.warnings
    .filter((w) => w.severity === 'error' || w.severity === 'warn')
    .map((w) => reportWarningText(w))
    .filter((t): t is string => !!t)
    .slice(0, 2)
    // camera-face 경고는 '정면 — 메시지' 형식이다. 리포트 문구에는 엠대시를 쓰지 않는다.
    .map((t) => {
      const m = /^(정면|측면) — (.+)$/.exec(t);
      return m ? `이번 촬영(${m[1]}): ${m[2]}` : `이번 촬영: ${t}`;
    });
  return [...retake, ...DEFAULT_CAUTIONS, ...measured];
}

export function assembleReport(i: AssembleInput): PersonalColorReport {
  const { face, classification: cls, narrative: n, gender } = i;
  const tone = cls.tone;
  const p = getToneProfile(tone);
  const variant = buildReportVariant(gender, i.userSelected);
  const isMock = i.narrativeSource === 'mock';
  const source = i.narrativeSource === 'ai' ? 'hybrid' : 'rules';
  const anchor = drapeAnchorFromAnalysis(face);
  const body = i.body && i.body.status === 'complete' ? i.body : null;
  const grooming = appGroomingTemplate(tone, gender).map((g, k) => ({ ...g, suggestion: n.grooming[k] ?? g.suggestion }));
  const env = face.environment;
  const wc = softenWarmPercent(cls.warmPercent, captureTrust(face));
  const isCool = cls.coolPercent > cls.warmPercent;

  const report: PersonalColorReport = {
    id: i.id,
    version: 1,
    createdAt: i.now,
    updatedAt: i.now,
    source,
    isMock,
    faceSessionId: i.faceSessionId,
    bodySessionId: body ? i.bodySessionId : null,
    header: {
      title: reportTitle(gender),
      subtitle: DEFAULT_REPORT_SUBTITLE,
      analyzedAt: i.now,
      basis: reportBasis(face, body),
      tool: i.narrativeSource === 'ai' ? `CELEBER 피부색 측정·규칙 분류 + AI 비전${i.model ? ` (${i.model})` : ''}` : 'CELEBER 피부색 측정 + 규칙 기반 분류',
    },
    variant,
    photos: {
      front: face.front.image,
      side: face.side?.image,
      body: body?.image,
      environment: env.image,
      drapeAnchor: anchor ?? undefined,
    },
    measurements: {
      skin: face.skin.corrected,
      skinRaw: face.skin.raw,
      hair: face.featureColors.hair,
      eyes: face.featureColors.eyes,
      lips: face.featureColors.lips,
      environment: { lightSourceLabel: env.lightSourceLabel, cctK: env.cctK, settingLabel: env.settingLabel },
    },
    classification: cls,
    aiOpinion: i.aiOpinion,
    firstImpression: { no: 1, title: '첫인상 브리핑', bullets: n.firstImpression.slice(0, 4), hashtags: n.hashtags.slice(0, 5) },
    type: {
      no: 2,
      title: '퍼스널컬러 타입',
      season: cls.season,
      tone,
      nameKo: p.nameKo,
      nameEn: p.nameEn,
      description: n.typeDescription,
      accentHex: p.accentHex,
      secondary: { tone: cls.secondaryTone, nameKo: getToneProfile(cls.secondaryTone).nameKo },
    },
    warmCool: {
      no: 3,
      title: '웜톤 vs 쿨톤 분석',
      warmPercent: wc.warm,
      coolPercent: wc.cool,
      undertone: cls.undertone,
      warmGradient: WARM_GRADIENT,
      coolGradient: COOL_GRADIENT,
      warmMarker: wc.warm / 100,
      coolMarker: wc.cool / 100,
      analysisPoint: n.analysisPoint,
      comparison: {
        warm: { colors: p.warmSamples, text: n.warmText },
        cool: { colors: p.coolSamples, text: n.coolText },
      },
    },
    features: {
      no: 4,
      title: '주요 특징 분석',
      rows: [
        { key: 'skinTone', icon: 'skin', label: '피부톤', value: n.features.skinTone, score: cls.axes.warmth },
        { key: 'value', icon: 'value', label: '명도', value: n.features.value, score: cls.axes.value },
        { key: 'chroma', icon: 'chroma', label: '채도', value: n.features.chroma, score: cls.axes.chroma },
        { key: 'clarity', icon: 'clarity', label: '청탁감', value: n.features.clarity, score: cls.axes.clarity },
        { key: 'contrast', icon: 'contrast', label: '대비감', value: n.features.contrast, score: cls.axes.contrast },
        { key: 'imageKeywords', icon: 'keyword', label: '이미지 키워드', value: n.features.imageKeywords },
      ],
      axes: cls.axes,
    },
    draping: {
      no: 5,
      title: '톤 컬러 적용 예시',
      best: p.drapeBest.slice(0, 4).map((color) => ({ color, harmony: drapeHarmony(color.hex, tone) })),
      worst: p.drapeWorst.slice(0, 4).map((color) => ({ color, harmony: drapeHarmony(color.hex, tone) })),
      bestCaption: isCool ? '얼굴이 맑고 깨끗해 보임' : '혈색이 살아나고 생기 있어 보임',
      worstCaption: isCool ? '칙칙해 보일 수 있음' : '창백하거나 푸석해 보일 수 있음',
    },
    tops: { no: 6, title: variant.labels.tops, items: p.tops.slice(0, 6).map((color) => ({ color, shape: topsShape(gender) })), tip: n.topsTip },
    outer: { no: 7, title: variant.labels.outer, items: p.outer.slice(0, 5).map((color) => ({ color, shape: 'fabric' as const })), tip: n.outerTip },
    accessories: {
      no: 8,
      title: variant.labels.accessories,
      pointLabel: variant.labels.pointItem,
      pointColors: p.point.slice(0, 4).map((color) => ({ color, shape: pointShape(gender) })),
      itemsLabel: '악세서리 추천',
      items: accessoryItems(p.metals, gender),
      metals: p.metals,
      metalSummary: p.metals.map((m) => METAL_LABEL_KO[m]).join(' / '),
      avoidMetals: p.avoidMetals,
    },
    hair: { no: 9, title: '추천 헤어 컬러', intro: n.hairIntro, items: p.hair.slice(0, 4), tip: n.hairTip, avoid: p.hairAvoid },
    grooming: { no: 10, title: variant.labels.grooming, items: grooming },
    avoidStyles: { no: 11, title: '비추천 스타일', intro: n.avoidIntro, items: p.avoidStyles.slice(0, 4) },
    todayActions: { no: 12, title: '오늘 바로 적용할 포인트', items: n.todayActions.slice(0, 4) },
    cautions: { no: 13, title: '정확도 주의사항', items: cautionItems(face) },
    confidence: { no: 14, title: '분석 신뢰도', ...reportConfidence(face, cls, i.aiOpinion?.tone) },
    bodyStyling: toBodyStyling(body),
    disclaimer: DEFAULT_DISCLAIMER,
  };
  return PersonalColorReportSchema.parse(report);
}

/* ------------------------------------------------------------------ 성별/스타일 변형 전환 */

/**
 * 저장된 리포트의 성별/스타일 변형을 바꾼다. 섹션 구조는 유지하고 ⑥⑦⑧⑩ 제목·형태·항목과 헤더 제목만 바꾼다.
 * narrative가 같은 성별 기준이면 그 그루밍/오늘 포인트를 쓰고, 아니면 새 성별 템플릿을 쓴다.
 */
export function applyVariant(report: PersonalColorReport, gender: Gender, userSelected: boolean, narrative?: ReportNarrative | null, now = new Date().toISOString()): PersonalColorReport {
  const tone = report.type.tone;
  const p = getToneProfile(tone);
  const variant = buildReportVariant(gender, userSelected);
  const useNarr = narrative && narrative.gender === gender ? narrative : null;
  const grooming = appGroomingTemplate(tone, gender).map((g, k) => ({ ...g, suggestion: useNarr?.grooming[k] ?? g.suggestion }));
  const sameGender = report.variant.gender === gender;
  const next: PersonalColorReport = {
    ...report,
    updatedAt: now,
    header: { ...report.header, title: reportTitle(gender) },
    variant,
    tops: {
      ...report.tops,
      title: variant.labels.tops,
      items: report.tops.items.map((it) => ({ ...it, shape: topsShape(gender) })),
      tip: useNarr?.topsTip ?? adaptGenderText(p.topsTip, gender),
    },
    outer: { ...report.outer, title: variant.labels.outer, tip: useNarr?.outerTip ?? adaptGenderText(p.outerTip, gender) },
    accessories: {
      ...report.accessories,
      title: variant.labels.accessories,
      pointLabel: variant.labels.pointItem,
      pointColors: report.accessories.pointColors.map((it) => ({ ...it, shape: pointShape(gender) })),
      items: accessoryItems(report.accessories.metals, gender),
    },
    grooming: { ...report.grooming, title: variant.labels.grooming, items: grooming },
    todayActions: { ...report.todayActions, items: sameGender && !useNarr ? report.todayActions.items : (useNarr?.todayActions ?? todayActionsTemplate(tone, gender)).slice(0, 4) },
  };
  return PersonalColorReportSchema.parse(next);
}
