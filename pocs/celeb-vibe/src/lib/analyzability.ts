/**
 * 분석 가능성 규칙 판정 (AI 없이 측정값만으로). 결과를 먼저 짧게 보여주고, AI가 있으면 사유를 보강한다.
 */
import type { Analyzability } from '@celeber/core/contracts';
import type { ServerImageStats, VibeMeasurement } from './measurement';

export type ReasonCode = Analyzability['reasons'][number]['code'];
export type Reason = Analyzability['reasons'][number];

/** 사유 코드 → 짧은 라벨 (썸네일 위 표시용) */
export const REASON_LABEL_KO: Record<ReasonCode, string> = {
  'no-person': '인물 없음',
  'multiple-people': '여러 명',
  backlight: '역광',
  occluded: '얼굴 가림',
  'low-resolution': '저해상도',
  'heavy-filter': '강한 필터',
  cropped: '잘림',
  'face-too-small': '얼굴 작음',
  'extreme-lighting': '극단적 조명',
  'not-photo': '사진 아님',
  other: '기타',
};

export const FRAMING_LABEL_KO: Record<Analyzability['framing'], string> = {
  'full-body': '전신',
  'upper-body': '상반신',
  face: '얼굴',
  unknown: '판별 불가',
};

export const THRESHOLDS = {
  /** 짧은 변 최소 픽셀 */
  minEdgePx: 360,
  /** 퍼스널컬러 측정에 필요한 얼굴 높이(px) */
  minFaceHeightPx: 72,
  /** 역광: 얼굴 밝기 / 장면 밝기 */
  backlightRatio: 0.62,
  /** 하이라이트 클리핑 비율 */
  clippedHigh: 0.22,
  clippedLow: 0.35,
  darkLuma: 42,
  brightLuma: 228,
  /** 평균 채도(0..1) 이상이면 강한 필터 의심 */
  saturationFilter: 0.52,
} as const;

/** 측정 없이(서버 통계만) 판정할 때 쓰는 기본 안내 */
export const STATS_ONLY_MESSAGE = '브라우저 측정 없이 사진 통계만으로 판정했습니다.';
export const PC_REFERENCE_ONLY_MESSAGE = '얼굴을 직접 측정하지 않아 퍼스널컬러는 참고용 추정입니다.';
export const DETECTOR_FAILED_MESSAGE = '브라우저 인물 검출기를 실행하지 못해(모델 로드 실패·미지원 브라우저 등) 사진 통계로 판정했습니다. 인물 수와 얼굴은 확인하지 못했습니다.';
export const FORCED_NO_PERSON_MESSAGE = '브라우저 측정에서 인물을 찾지 못했습니다. 요청에 따라 보이는 부분만 분석했습니다.';
/** 측정 없이 AI가 판정한 경우의 안내. PC_REFERENCE_ONLY_MESSAGE와 다른 문장이어야 statsOnly()가 'AI가 인물 수를 셌음'을 구분한다 */
export const AI_UNMEASURED_MESSAGE = '얼굴을 직접 측정하지 않아 AI가 판단한 퍼스널컬러는 참고용입니다.';

export const UNDEREXPOSED_MESSAGE = '사진이 매우 어둡습니다. 옷 색도 실제보다 어둡게 나올 수 있습니다.';
export const UNDEREXPOSED_ITEM_NOTE = '노출이 부족한 사진이라 실제 색보다 어둡게 측정됐을 수 있습니다.';

/** 노출 부족(매우 어둡거나 암부가 뭉개짐). 옷 색도 어둡게 읽히므로 아이템 색에 안내를 단다 */
export function isUnderexposed(m: VibeMeasurement | undefined, stats: ServerImageStats | undefined): boolean {
  const meanLuma = m?.scene.meanLuma ?? stats?.meanLuma ?? 128;
  const clippedLow = m?.scene.clippedLow ?? stats?.clippedLow ?? 0;
  return meanLuma < THRESHOLDS.darkLuma || clippedLow > THRESHOLDS.clippedLow;
}

/** 퍼스널컬러 측정 조건을 깨는 사유 (측정 없이 판정할 때 AI 판단과 합칠 때 사용) */
const PC_CONDITION_CODES: ReadonlySet<ReasonCode> = new Set<ReasonCode>(['low-resolution', 'heavy-filter', 'extreme-lighting', 'backlight', 'face-too-small']);

export interface ResolvedMeasurement {
  /** 판정에 실제로 쓸 측정값. 믿을 수 없으면 undefined → 서버 통계 경로 */
  measurement: VibeMeasurement | undefined;
  /** 측정값을 버린 경우 그 사유 (사용자에게 표시) */
  fallback?: Reason;
}

/**
 * 브라우저 측정값을 그대로 믿어도 되는지 결정한다.
 * - 검출기(얼굴/포즈)가 실패했는데 인물 0명 → '인물 없음'이 아니라 '측정 불가'. 서버 통계 경로로 판정한다.
 * - 검출기가 정상인데 인물 0명이고 사용자가 '그래도 분석'(force) → 서버 통계 경로로 진행하되 경고를 남긴다.
 */
export function resolveMeasurement(m: VibeMeasurement | undefined, opts: { force?: boolean } = {}): ResolvedMeasurement {
  if (!m) return { measurement: undefined };
  const personCount = Math.max(m.faceCount, m.poseCount);
  if (personCount > 0) return { measurement: m };
  const failed = m.detectors && (m.detectors.face === 'failed' || m.detectors.pose === 'failed');
  if (failed) return { measurement: undefined, fallback: { code: 'other', message: DETECTOR_FAILED_MESSAGE, severity: 'warn' } };
  if (opts.force) return { measurement: undefined, fallback: { code: 'no-person', message: FORCED_NO_PERSON_MESSAGE, severity: 'warn' } };
  return { measurement: m };
}

/**
 * 측정값(브라우저) + 서버 통계 → 분석 가능성.
 * measurement가 없으면(서버만 호출된 경우) 서버 통계만으로 보수적으로 판정한다.
 * 이때 퍼스널컬러는 얼굴을 측정하지 않았으므로 참고용(partial.personalColor=false)으로 표시한다.
 * @param opts.fallback resolveMeasurement가 측정값을 버린 사유 (기본 안내 대신 표시)
 */
export function judgeAnalyzability(m: VibeMeasurement | undefined, stats: ServerImageStats | undefined, opts: { fallback?: Reason } = {}): Analyzability {
  const reasons: Reason[] = [];
  const add = (code: ReasonCode, message: string, severity: 'info' | 'warn' | 'error' = 'warn') => {
    if (!reasons.some((r) => r.code === code)) reasons.push({ code, message, severity });
  };

  const width = m?.width ?? stats?.width ?? 0;
  const height = m?.height ?? stats?.height ?? 0;
  const grayscale = m?.scene.grayscale ?? stats?.grayscale ?? false;
  const meanLuma = m?.scene.meanLuma ?? stats?.meanLuma ?? 128;
  const clippedHigh = m?.scene.clippedHigh ?? stats?.clippedHigh ?? 0;
  const clippedLow = m?.scene.clippedLow ?? stats?.clippedLow ?? 0;
  const meanSat = m?.scene.meanSaturation ?? stats?.meanSaturation ?? 0.2;

  let outfit = true;
  let personalColor = true;
  let mood = true;

  if (width && height && Math.min(width, height) < THRESHOLDS.minEdgePx) {
    add('low-resolution', `해상도가 낮습니다 (${width}×${height}px). 색과 소재 판별이 부정확할 수 있습니다.`);
    personalColor = false;
  }
  if (grayscale) {
    add('heavy-filter', '흑백 사진이라 색 분석을 할 수 없습니다.', 'error');
    personalColor = false;
    outfit = false;
  } else if (meanSat >= THRESHOLDS.saturationFilter) {
    add('heavy-filter', '채도가 매우 높아 필터 보정이 의심됩니다. 실제 색과 다를 수 있습니다.');
    personalColor = false;
  }
  if (meanLuma < THRESHOLDS.darkLuma || meanLuma > THRESHOLDS.brightLuma || clippedHigh > THRESHOLDS.clippedHigh || clippedLow > THRESHOLDS.clippedLow) {
    add('extreme-lighting', isUnderexposed(m, stats) ? UNDEREXPOSED_MESSAGE : '하이라이트가 날아간 부분이 많습니다.');
    personalColor = false;
  }

  let personCount: number;
  let framing: Analyzability['framing'] = 'unknown';
  if (m) {
    personCount = Math.max(m.faceCount, m.poseCount);
    framing = m.pose?.framing ?? (m.faceCount > 0 ? 'face' : 'unknown');
    if (personCount === 0) {
      add('no-person', '사진에서 인물을 찾지 못했습니다.', 'error');
      outfit = false;
      personalColor = false;
      mood = false;
    } else if (personCount > 1) {
      add('multiple-people', `인물이 ${personCount}명 보입니다. 한 명만 나온 사진이 정확합니다.`, 'error');
    }
    if (m.face) {
      if (m.face.heightPx < THRESHOLDS.minFaceHeightPx) {
        add('face-too-small', `얼굴이 작게 찍혔습니다 (${Math.round(m.face.heightPx)}px). 피부색 측정이 불안정합니다.`);
        personalColor = false;
      }
      const ratio = m.scene.meanLuma > 0 ? m.face.faceMeanLuma / m.scene.meanLuma : 1;
      if (ratio < THRESHOLDS.backlightRatio && m.scene.meanLuma > 110) {
        add('backlight', `역광입니다. 얼굴이 배경보다 어둡습니다 (밝기 비 ${ratio.toFixed(2)}).`);
        personalColor = false;
      }
      if (Math.abs(m.face.yawDeg) > 40) add('occluded', '얼굴이 옆으로 많이 돌아가 있어 피부 측정 영역이 적습니다.', 'info');
    } else if (personCount > 0) {
      // 몸은 보이는데 얼굴 랜드마크가 없음: 가림(선글라스/마스크/머리카락) 또는 뒷모습
      if (m.pose?.visible.head) add('occluded', '얼굴이 가려졌거나 돌아가 있어 피부색을 측정하지 못했습니다.');
      else add('cropped', '얼굴이 사진 밖으로 잘렸습니다.');
      personalColor = false;
    }
    if (framing === 'face') {
      add('cropped', '얼굴 위주 사진이라 코디는 보이는 부분만 분석합니다.', 'info');
    } else if (framing === 'upper-body') {
      add('cropped', '상반신 사진입니다. 하의와 신발은 분석에서 빠집니다.', 'info');
    }
    if (framing === 'face' || framing === 'unknown') outfit = outfit && m.regions.length > 0;
  } else {
    // 측정 없음: 서버 통계만으로 판정 (인물 수는 알 수 없음 → AI 또는 사용자가 확인)
    personCount = 1;
    framing = 'unknown';
    if (stats && stats.centerToBorderLuma < THRESHOLDS.backlightRatio && stats.meanLuma > 110) {
      add('backlight', '가장자리보다 중앙이 어둡습니다. 역광일 수 있습니다.');
      personalColor = false;
    }
    const fb = opts.fallback;
    if (fb && fb.code !== 'other') add(fb.code, fb.message, fb.severity ?? 'warn');
    const base = fb?.code === 'other' ? fb.message : STATS_ONLY_MESSAGE;
    add('other', `${base} ${PC_REFERENCE_ONLY_MESSAGE}`, fb?.code === 'other' ? (fb.severity ?? 'warn') : 'info');
    // 사진 중앙의 피부색 유사 픽셀만으로는 배경을 피부로 오인할 수 있다 → 퍼스널컬러는 참고용
    personalColor = false;
  }

  const blocking = reasons.some((r) => r.severity === 'error');
  const analyzable = !blocking && (outfit || personalColor) && personCount >= 1;
  return { analyzable, partial: { outfit, personalColor, mood }, personCount, framing, reasons };
}

/**
 * 규칙 판정 + AI 판정 병합. AI는 사유를 추가할 수 있고(not-photo, occluded 등), 부분 가능 여부는 둘 다 true여야 true.
 * 측정 기반 사람 수가 있으면 그것을 우선한다(AI는 얼굴로 사람을 세지 않고 장면 전체를 본다).
 * 측정 없이 판정한 경우 partial.personalColor는 사진 조건 사유만 반영한다(AI 신뢰도 계산용). 측정이 없으면 최종 조립에서 참고용(false)으로 내린다.
 * 측정 없이 AI가 적은 '여러 명'·'인물 없음'·'사진 아님'은 오류다(측정이 있으면 측정 인물 수를 믿으므로 '여러 명'은 경고).
 * force=true(사용자가 '그래도 분석')면 병합 뒤에 forceAnalyzable을 적용해 AI가 다시 넣은 '여러 명' 오류도 경고로 낮춘다.
 */
export function mergeAnalyzability(
  rules: Analyzability,
  ai: { analyzable: boolean; personCount: number; framing: Analyzability['framing']; outfit: boolean; personalColor: boolean; mood: boolean; issues: { code: ReasonCode; message: string }[] } | null,
  measured: boolean,
  opts: { force?: boolean } = {},
): Analyzability {
  if (!ai) return opts.force ? forceAnalyzable(rules) : rules;
  const reasons = [...rules.reasons];
  for (const i of ai.issues) {
    const blockingCode = i.code === 'not-photo' || i.code === 'no-person' || (i.code === 'multiple-people' && !measured);
    if (!reasons.some((r) => r.code === i.code)) reasons.push({ code: i.code, message: i.message, severity: blockingCode ? 'error' : 'warn' });
  }
  const personCount = measured ? rules.personCount : Math.max(0, Math.round(ai.personCount));
  // 측정 없이 판정한 경우의 'other' 안내('사진 통계만으로 판정')는 AI가 사진을 봤으므로 'AI 판단·퍼스널컬러 참고용' 안내로 바꾼다
  const filtered = measured
    ? reasons
    : reasons.map((r) => {
        if (r.code !== 'other' || !r.message.includes(PC_REFERENCE_ONLY_MESSAGE)) return r;
        const lead = r.message.startsWith(DETECTOR_FAILED_MESSAGE) ? '브라우저 인물 검출기를 실행하지 못해 AI가 사진을 보고 판정했습니다.' : '브라우저 측정 없이 AI가 사진을 보고 판정했습니다.';
        return { ...r, message: `${lead} ${AI_UNMEASURED_MESSAGE}` };
      });
  if (!measured && personCount > 1 && !filtered.some((r) => r.code === 'multiple-people')) filtered.push({ code: 'multiple-people', message: `인물이 ${personCount}명 보입니다.`, severity: 'error' });
  if (!measured && personCount === 0 && !filtered.some((r) => r.code === 'no-person')) filtered.push({ code: 'no-person', message: '사진에서 인물을 찾지 못했습니다.', severity: 'error' });
  const pcRule = measured ? rules.partial.personalColor : !filtered.some((r) => PC_CONDITION_CODES.has(r.code));
  const partial = {
    outfit: rules.partial.outfit && ai.outfit,
    personalColor: pcRule && ai.personalColor,
    mood: rules.partial.mood && ai.mood,
  };
  const blocking = filtered.some((r) => r.severity === 'error');
  const merged: Analyzability = {
    analyzable: !blocking && (partial.outfit || partial.personalColor) && personCount >= 1,
    partial,
    personCount,
    framing: rules.framing !== 'unknown' ? rules.framing : ai.framing,
    reasons: filtered,
  };
  return opts.force ? forceAnalyzable(merged) : merged;
}

const FORCED_SUFFIX = {
  'multiple-people': '가장 크게 보이는 인물을 기준으로 분석했습니다.',
  'no-person': '요청에 따라 인물 없이 보이는 부분만 분석했습니다.',
} as const;

/**
 * 사용자가 '그래도 분석'을 선택했을 때: 여러 명이면 가장 큰 인물 기준, 인물 미검출이면 보이는 부분만 분석.
 * 흑백(heavy-filter)·사진 아님(not-photo) 같은 오류는 그대로 둔다. 여러 번 적용해도 결과가 같다.
 */
export function forceAnalyzable(a: Analyzability): Analyzability {
  const reasons = a.reasons.map((r) => {
    if ((r.code !== 'multiple-people' && r.code !== 'no-person') || r.severity !== 'error') return r;
    const suffix = FORCED_SUFFIX[r.code];
    return { ...r, severity: 'warn' as const, message: r.message.includes(suffix) ? r.message : `${r.message} ${suffix}` };
  });
  const blocking = reasons.some((r) => r.severity === 'error');
  return { ...a, reasons, analyzable: !blocking && (a.partial.outfit || a.partial.personalColor) };
}
