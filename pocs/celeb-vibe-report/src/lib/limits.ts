/**
 * 연예인 사진 분석이 '제한된' 상태인지 판단한다.
 * celeb-vibe는 '그래도 분석하기'(force)로 강행한 분석을 analyzable=true로 저장하고 '인물 없음'·'여러 명' 사유를
 * error → warn으로 낮춘다. 그래서 analyzable만 보면 강행 여부를 놓친다. 사유 코드·심각도로 판단한다.
 *
 * 색 주의(colorCaution): 아주 어둡거나 역광·강한 보정 사진은 분석은 되지만 측정한 색이 실제 색이 아닐 수 있다.
 * 색을 왜곡하는 사유가 있으면 가이드 상단에 알리고, celeb-vibe가 그 사진을 partial.personalColor=false로
 * 판정했으면(colorUnusable) 피부·헤어·입술 색을 가이드 계산에서 뺀다(withoutColorMeasurements).
 * 측정 없이 사진 통계만 쓴 분석(partial.personalColor=false, 사유 없음)은 사진 색 문제가 아니라서 여기에 넣지 않는다.
 */
import type { Analyzability, VibeAnalysis } from '@celeber/core/contracts';

/** warn이어도 분석 결과 전체를 믿기 어렵게 만드는 사유 (강행 분석, 검출기 실패 등) */
const LIMITING_CODES: ReadonlySet<string> = new Set(['no-person', 'multiple-people', 'not-photo', 'other']);
/** 사진 색 자체를 왜곡하는 사유 */
export const COLOR_DISTORT_CODES: ReadonlySet<string> = new Set(['extreme-lighting', 'backlight', 'heavy-filter']);

export interface AnalysisLimits {
  /** 분석 불가였거나 강행한 사진 */
  limited: boolean;
  /** 인물을 찾지 못한 사진 (코디·얼굴 색 측정이 사람 기준이 아님) */
  noPerson: boolean;
  /** 화면에 보일 사유 (최대 2개, 끝 마침표 제거) */
  reasons: string[];
  /** 사진 색이 실제와 다를 수 있다: 조명·보정 사유 (인물 없음이면 false: noPerson이 이미 더 강한 제한) */
  colorCaution: boolean;
  /** colorCaution이면서 celeb-vibe가 퍼스널컬러 분석 불가로 판정: 피부·헤어 색을 비교에 쓰지 않는다 */
  colorUnusable: boolean;
  /** 색 주의 사유 (최대 2개, 끝 마침표 제거) */
  colorReasons: string[];
}

const msg = (m: string) => m.trim().replace(/[.。]$/, '');

export function analysisLimits(a: Analyzability): AnalysisLimits {
  const hits = a.reasons
    .filter((r) => r.severity === 'error' || (r.severity === 'warn' && LIMITING_CODES.has(r.code)))
    .sort((x, y) => (x.severity === 'error' ? -1 : 0) - (y.severity === 'error' ? -1 : 0));
  const limited = !a.analyzable || hits.length > 0;
  const noPerson = a.personCount === 0 || a.reasons.some((r) => r.code === 'no-person');
  const reasons = hits.map((r) => msg(r.message)).slice(0, 2);
  const colorReasons = noPerson ? [] : [...new Set(a.reasons.filter((r) => COLOR_DISTORT_CODES.has(r.code)).map((r) => msg(r.message)))].slice(0, 2);
  const colorCaution = colorReasons.length > 0;
  const colorUnusable = colorCaution && a.partial.personalColor === false;
  return {
    limited,
    noPerson,
    reasons: limited && !reasons.length ? ['분석하기 어려운 사진입니다'] : reasons,
    colorCaution,
    colorUnusable,
    colorReasons,
  };
}

/** 가이드에 실을 제한 사유: 분석 제한 사유 + 색 주의 사유 (중복 제거, 최대 3개) */
export function guideLimitations(l: AnalysisLimits): string[] {
  return [...new Set([...(l.limited ? l.reasons : []), ...l.colorReasons])].slice(0, 3);
}

/** 가이드 상단 제한 안내. 강행 분석은 '분석이 제한된 사진', 조명·보정만 문제면 '색이 실제와 다를 수 있는 사진' */
export function limitationNotice(limitations: string[], l: AnalysisLimits | null, colorCompared: boolean): { title: string; body: string } | null {
  if (!limitations.length) return null;
  const reasons = limitations.join(' / ');
  if (l && !l.limited && l.colorCaution) {
    return {
      title: '색이 실제와 다를 수 있는 사진으로 만든 가이드입니다',
      body: `${reasons}. ${colorCompared ? '색 비교와 ' : '피부·헤어 색은 비교하지 않았고, '}코디 색 치환은 참고만 하세요.`,
    };
  }
  return { title: '분석이 제한된 사진으로 만든 가이드입니다', body: `${reasons}. 색 비교와 코디 치환 결과는 참고만 하세요.` };
}

const notLip = (c: { name: string }) => !c.name.includes('(입술)');

/**
 * 인물을 찾지 못한 사진은 '코디 아이템'·'피부·헤어·입술 색'·'전신 비율'이 사람에서 잰 값이 아니다.
 * 가이드 계산에서는 이 값들을 지우고 사진 팔레트만 남긴다.
 */
export function withoutPersonMeasurements(v: VibeAnalysis): VibeAnalysis {
  const pc = v.personalColor;
  return {
    ...v,
    outfit: { ...v.outfit, items: [] },
    personalColor: { ...pc, hair: undefined, eyes: undefined, axes: undefined, measured: false, confidence: Math.min(pc.confidence, 0.1) },
    palette: { ...v.palette, sub: v.palette.sub.filter(notLip), accent: v.palette.accent.filter(notLip) },
    body: undefined,
  };
}

/**
 * 피부·헤어 색을 실제 색으로 볼 수 없는 사진(partial.personalColor=false): 측정값이 있어도
 * 피부·헤어·눈·입술 색과 색 축은 가이드 계산에서 뺀다. 코디·체형·분위기는 남긴다.
 */
export function withoutColorMeasurements(v: VibeAnalysis): VibeAnalysis {
  const pc = v.personalColor;
  return {
    ...v,
    personalColor: { ...pc, hair: undefined, eyes: undefined, axes: undefined, tone: undefined, toneNameKo: undefined, undertone: undefined, measured: false },
    palette: { ...v.palette, sub: v.palette.sub.filter(notLip), accent: v.palette.accent.filter(notLip) },
  };
}

/** 가이드 계산(규칙·AI 프롬프트)에 쓸 연예인 분석: 제한 사유에 맞춰 믿을 수 없는 측정값을 뺀다 */
export function guideVibe(v: VibeAnalysis): VibeAnalysis {
  const l = analysisLimits(v.analyzability);
  if (l.noPerson) return withoutPersonMeasurements(v);
  if (l.colorUnusable) return withoutColorMeasurements(v);
  return v;
}
