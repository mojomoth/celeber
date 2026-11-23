/**
 * 비율 수치 → 참조 범위, 표시 문자열, 한 줄 해석, 코디 제안 (순수 함수).
 *
 * 참조 범위 근거(성인 인체 측정 평균값 기반의 대략치, 남녀 공통):
 * - 키/머리 길이(정수리~턱): 일반 성인 6.5~8등신, 평균 7~7.5.
 * - 고관절 높이/키 ≈ 0.50~0.53 (PoseLandmarker 엉덩이 점은 고관절 근처).
 * - 어깨 관절 사이 폭/키 ≈ 0.19~0.23, 실루엣(삼각근 포함) 어깨 폭/키 ≈ 0.23~0.28.
 * - 허벅지(고관절~무릎)/정강이(무릎~발목) ≈ 0.95~1.15, 팔 길이(어깨~손목)/키 ≈ 0.31~0.36.
 * 실측 데이터로 튜닝한 값이 아니며, 사진 각도·옷 부피·자세에 따라 달라진다.
 */
import type { BodyFrame, BodyRatios, RatioInsight } from '@celeber/core/contracts';
import type { WidthMethod } from './classify';

export type RatioKey = keyof BodyRatios;

export interface RatioReference {
  min: number;
  max: number;
  ideal?: number;
  label: string;
  /** 막대 시각화 축 범위 */
  domain: [number, number];
}

export function ratioReference(key: RatioKey, method: WidthMethod = 'silhouette'): RatioReference | undefined {
  switch (key) {
    case 'headsTall':
      return { min: 6.5, max: 8, ideal: 7.5, label: '성인 일반 6.5~8등신', domain: [5.5, 9] };
    case 'headToHeight':
      return { min: 0.125, max: 0.154, label: '키의 12.5~15.4%', domain: [0.1, 0.18] };
    case 'upperToLower':
      return { min: 0.88, max: 1.0, ideal: 0.92, label: '상체:하체 1:1.0~1.14', domain: [0.7, 1.2] };
    case 'legToHeight':
      return { min: 0.48, max: 0.53, ideal: 0.52, label: '키의 48~53%', domain: [0.4, 0.6] };
    case 'shoulderToHip':
      return method === 'silhouette'
        ? { min: 0.98, max: 1.25, label: '실루엣 기준 0.98~1.25', domain: [0.75, 1.5] }
        : { min: 1.25, max: 1.65, label: '관절점 기준 1.25~1.65', domain: [1.0, 2.0] };
    case 'waistToHip':
      return { min: 0.72, max: 0.9, label: '실루엣 기준 0.72~0.90', domain: [0.6, 1.05] };
    case 'shoulderToHeight':
      return method === 'silhouette'
        ? { min: 0.23, max: 0.28, label: '실루엣 기준 키의 23~28%', domain: [0.17, 0.33] }
        : { min: 0.19, max: 0.23, label: '관절점 기준 키의 19~23%', domain: [0.14, 0.28] };
    case 'armToHeight':
      return { min: 0.31, max: 0.36, label: '키의 31~36%', domain: [0.26, 0.41] };
    case 'thighToShin':
      return { min: 0.95, max: 1.15, label: '0.95~1.15', domain: [0.75, 1.35] };
    default:
      return undefined;
  }
}

export const RATIO_LABEL_KO: Record<RatioKey, string> = {
  headsTall: '등신',
  headToHeight: '머리 길이 / 키',
  upperToLower: '상체 : 하체',
  legToHeight: '다리 길이 / 키',
  shoulderToHip: '어깨 / 골반 폭',
  waistToHip: '허리 / 골반 폭',
  shoulderToHeight: '어깨 폭 / 키',
  armToHeight: '팔 길이 / 키',
  thighToShin: '허벅지 / 정강이',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function formatRatio(key: RatioKey, v: number): string {
  switch (key) {
    case 'headsTall':
      return `${v.toFixed(1)}등신`;
    case 'upperToLower': {
      const upper = v / (1 + v);
      return `${Math.round(upper * 100)} : ${100 - Math.round(upper * 100)}`;
    }
    case 'legToHeight':
    case 'headToHeight':
    case 'shoulderToHeight':
    case 'armToHeight':
      return pct(v);
    default:
      return v.toFixed(2);
  }
}

/**
 * 화면에 보이는 자릿수로 반올림한 값. 범위 판정과 한 줄 해석은 이 값으로 한다
 * (0.307을 '31%'로 보여 주면서 '키의 31~36%'보다 낮다고 하지 않도록).
 */
export function displayedValue(key: RatioKey, v: number): number {
  switch (key) {
    case 'headsTall':
      return Math.round(v * 10) / 10;
    case 'upperToLower': {
      const u = Math.round((v / (1 + v)) * 100);
      return u >= 100 ? v : u / (100 - u);
    }
    case 'legToHeight':
    case 'headToHeight':
    case 'shoulderToHeight':
    case 'armToHeight':
      return Math.round(v * 100) / 100;
    default:
      return Math.round(v * 100) / 100;
  }
}

/** 참조 범위 판정 (표시 값 기준) */
export function rangeVerdict(key: string, value: number, ref: { min: number; max: number }): 'in' | 'low' | 'high' {
  const v = key in RATIO_LABEL_KO ? displayedValue(key as RatioKey, value) : value;
  // 반올림한 경계값끼리 비교할 때 부동소수 오차(0.31 vs 0.31000000000000005)를 무시한다
  const eps = 1e-9;
  if (v < ref.min - eps) return 'low';
  if (v > ref.max + eps) return 'high';
  return 'in';
}

function comment(key: RatioKey, raw: number, method: WidthMethod): string {
  const v = displayedValue(key, raw);
  switch (key) {
    case 'headsTall':
      if (v < 6.5) return '머리 비율이 큰 편으로 측정됐습니다. 위에서 내려 찍은 사진이나 헤어 볼륨도 영향을 줍니다.';
      if (v < 7) return '평균에 가까운 비율입니다. 세로선을 이어 주면 더 길어 보입니다.';
      if (v < 7.7) return '머리와 몸의 균형이 고른 비율입니다.';
      return '키 대비 머리가 작아 세로로 긴 인상을 주는 비율입니다.';
    case 'upperToLower':
      if (v > 1.0) return '상체가 긴 편입니다. 허리선을 올리는 코디가 다리를 길어 보이게 합니다.';
      if (v >= 0.88) return '상체와 하체의 길이가 고른 편입니다.';
      return '하체가 긴 편입니다. 상의 길이를 자유롭게 고를 수 있습니다.';
    case 'legToHeight':
      if (v < 0.48) return '키 대비 다리 시작점이 낮게 측정됐습니다. 하이웨이스트가 효과적입니다.';
      if (v <= 0.53) return '키 대비 다리 길이가 평균 범위입니다.';
      return '키 대비 다리가 긴 편입니다.';
    case 'shoulderToHip': {
      const [lo, hi] = method === 'silhouette' ? [0.98, 1.25] : [1.25, 1.65];
      if (v > hi) return '어깨가 골반보다 확실히 넓은 상체 중심 실루엣입니다.';
      if (v >= (lo + hi) / 2) return '어깨가 골반보다 조금 넓습니다.';
      if (v >= lo) return '어깨와 골반 폭이 비슷한 균형형입니다.';
      return '골반이 어깨보다 넓은 하체 중심 실루엣입니다.';
    }
    case 'waistToHip':
      if (v < 0.75) return '허리선이 잘록하게 들어가 있습니다.';
      if (v <= 0.88) return '허리선이 완만하게 들어가 있습니다.';
      return '허리선이 일자에 가깝습니다. 옷 부피의 영향도 있을 수 있습니다.';
    case 'shoulderToHeight': {
      const [lo, hi] = method === 'silhouette' ? [0.23, 0.28] : [0.19, 0.23];
      if (v > hi) return '키 대비 어깨가 넓은 편입니다.';
      if (v >= lo) return '키 대비 어깨 폭이 평균 범위입니다.';
      return '키 대비 어깨가 좁은 편입니다.';
    }
    case 'armToHeight':
      if (v > 0.36) return '키 대비 팔이 긴 편입니다.';
      if (v >= 0.31) return '키 대비 팔 길이가 평균 범위입니다.';
      return '키 대비 팔이 짧게 측정됐습니다. 팔을 굽히면 짧게 잡힙니다.';
    case 'thighToShin':
      if (v > 1.15) return '허벅지가 정강이보다 긴 편입니다.';
      if (v >= 0.95) return '허벅지와 정강이 길이가 고른 편입니다.';
      return '정강이가 긴 편이라 무릎 아래 라인이 길어 보입니다.';
    case 'headToHeight':
      return v > 0.154 ? '키 대비 머리 길이가 긴 편입니다.' : '키 대비 머리 길이가 평균 범위입니다.';
  }
}

/** 표시 순서 */
export const INSIGHT_ORDER: RatioKey[] = ['headsTall', 'upperToLower', 'legToHeight', 'shoulderToHip', 'waistToHip', 'shoulderToHeight', 'thighToShin', 'armToHeight'];

export function buildInsights(ratios: BodyRatios, method: WidthMethod): RatioInsight[] {
  const out: RatioInsight[] = [];
  for (const key of INSIGHT_ORDER) {
    const v = ratios[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const ref = ratioReference(key, method);
    const methodNote = (key === 'shoulderToHip' || key === 'shoulderToHeight') && method === 'landmarks' ? ' (관절점)' : '';
    out.push({
      key,
      label: RATIO_LABEL_KO[key] + methodNote,
      value: v,
      display: formatRatio(key, v),
      reference: ref ? { min: ref.min, max: ref.max, ideal: ref.ideal, label: ref.label } : undefined,
      comment: comment(key, v, method),
    });
  }
  return out;
}

/** 시각화 축 범위 (RatioInsight.key → domain) */
export function insightDomain(key: string, method: WidthMethod = 'silhouette'): [number, number] | undefined {
  return ratioReference(key as RatioKey, method)?.domain;
}

/* ------------------------------------------------------------------ 코디 제안 */

export interface StylingGuide {
  suggestions: { title: string; detail: string }[];
  avoid: string[];
}

const FRAME_GUIDE: Record<BodyFrame, StylingGuide> = {
  'inverted-triangle': {
    suggestions: [
      { title: '상체는 단정하게', detail: '어깨 패드나 견장 없는 셔츠·니트, V넥이나 오픈 칼라로 어깨 폭을 나눠 보이게 합니다.' },
      { title: '하체에 볼륨', detail: '스트레이트·와이드 팬츠나 밝은 톤 하의로 상하 무게를 맞춥니다.' },
    ],
    avoid: ['어깨 패드가 강한 재킷', '가로 줄무늬 상의', '스키니 핏 하의만 단독으로'],
  },
  rectangle: {
    suggestions: [
      { title: '허리선 만들기', detail: '벨트, 셋업, 짧은 재킷으로 허리 위치를 드러내면 직선 실루엣에 강약이 생깁니다.' },
      { title: '레이어드', detail: '셔츠 위 니트, 오픈 아우터처럼 겹쳐 입어 입체감을 더합니다.' },
    ],
    avoid: ['허리선 없는 박시한 원피스·롱 티셔츠 단독', '위아래 모두 일자 핏'],
  },
  triangle: {
    suggestions: [
      { title: '어깨에 구조감', detail: '어깨선이 잡힌 재킷, 보트넥·카라 디테일로 상체 폭을 보강합니다.' },
      { title: '하체는 차분하게', detail: '어두운 톤의 스트레이트·부츠컷 하의로 시선을 위로 올립니다.' },
    ],
    avoid: ['밝은 색 스키니 하의', '엉덩이 주변 큰 포켓·장식'],
  },
  hourglass: {
    suggestions: [
      { title: '허리를 드러내는 핏', detail: '허리선이 맞는 셔츠, 랩 스타일, 벨트로 잘록한 허리를 살립니다.' },
      { title: '상하 균형 유지', detail: '어깨와 골반이 비슷하므로 한쪽만 부피를 키우지 않습니다.' },
    ],
    avoid: ['허리를 가리는 오버사이즈 상하의 조합'],
  },
  oval: {
    suggestions: [
      { title: '세로 라인', detail: '오픈 아우터, 롱 카디건, 단색 이너로 몸 중앙에 세로선을 만듭니다.' },
      { title: '구조감 있는 소재', detail: '몸에 달라붙지 않는 탄탄한 소재로 실루엣을 정돈합니다.' },
    ],
    avoid: ['허리를 조이는 얇은 벨트', '몸에 붙는 니트 단독'],
  },
};

/** 비율과 체형으로 코디 제안 (결정적). headsTall/upperToLower가 없으면 체형 제안만 */
export function buildStylingGuide(ratios: Partial<BodyRatios> | undefined, frame: BodyFrame | undefined): StylingGuide {
  const suggestions: StylingGuide['suggestions'] = [];
  const avoid: string[] = [];
  if (ratios?.upperToLower !== undefined) {
    if (ratios.upperToLower > 1.0) {
      suggestions.push({ title: '허리선 올리기', detail: '하이웨이스트 하의에 상의를 넣어 입거나 크롭 기장 상의로 다리 시작점을 올립니다.' });
      avoid.push('엉덩이를 덮는 긴 상의를 빼 입기');
    } else if (ratios.upperToLower < 0.88) {
      suggestions.push({ title: '상체 길이 보완', detail: '미드·로우 라이즈 하의, 상의를 빼 입는 기장으로 상하 균형을 맞춥니다.' });
    }
  }
  if (ratios?.headsTall !== undefined && ratios.headsTall < 7) {
    suggestions.push({ title: '세로선 연결', detail: '하의와 신발 색을 맞추고, V넥·긴 목걸이로 세로 시선을 만듭니다.' });
    avoid.push('하의와 대비가 큰 발목 양말·신발');
  }
  if (frame) {
    suggestions.push(...FRAME_GUIDE[frame].suggestions);
    avoid.push(...FRAME_GUIDE[frame].avoid);
  }
  return { suggestions, avoid: [...new Set(avoid)] };
}

export const stylingHintStrings = (g: StylingGuide): string[] => g.suggestions.map((s) => `${s.title}: ${s.detail}`);
