/**
 * 사람 영역 마스크(PoseLandmarker segmentation mask)에서 실루엣 폭과 머리끝/발끝을 잰다. 순수 함수.
 *
 * - 마스크는 행 우선 배열(길이 width*height), 값은 신뢰도(0..1) 또는 0/255.
 * - 폭은 "몸 중심 x를 포함하는 연속 구간"의 길이다. 팔이 몸통에 붙어 있으면 구간이 넓어지므로
 *   허리/골반 행에서는 팔 구간(어깨→팔꿈치→손목) 중심선이 몸통 구간 안에 있으면 팔 반폭만큼 안쪽을 윤곽으로 보정하고
 *   armsOverlap 플래그를 세운다.
 * - 옷의 부피도 폭에 포함된다(몸에 붙는 옷일수록 정확).
 */
import type { Px } from './pose';

export interface PersonMask {
  data: ArrayLike<number>;
  width: number;
  height: number;
  /** 이 값 이상이면 사람 (기본: 값 범위가 0..1이면 0.5, 0..255면 128) */
  threshold?: number;
}

export interface SilhouetteGuides {
  /** 모두 마스크 픽셀 좌표 */
  shoulderMid: Px;
  hipMid: Px;
  kneeMid: Px;
  /** 팔 구간(어깨→팔꿈치, 팔꿈치→손목) — 허리/골반 행에서 몸통 구간과 겹치면 팔을 빼고 폭을 추정 */
  armSegments: [Px, Px][];
  /** 팔(소매 포함) 반폭 px. 겹친 팔 중심선에서 이만큼 안쪽을 몸 윤곽으로 본다 */
  armHalfWidth: number;
  /** 머리 중심 x와 탐색 반폭 */
  headCenterX: number;
  headHalfBand: number;
  /** 머리끝 탐색 하한(이보다 아래는 보지 않음: 보통 코 y) */
  headSearchBottomY: number;
  /** 발 영역 x 범위와 탐색 시작 y(발목) */
  feetX0: number;
  feetX1: number;
  feetSearchTopY: number;
}

export interface SilhouetteRow {
  y: number;
  x0: number;
  x1: number;
  width: number;
  armsOverlap: boolean;
  /** 팔 보정 전 구간이 사진 왼쪽/오른쪽 끝 열에 닿음 */
  touchesSide?: boolean;
}

export interface SilhouetteMeasurement {
  shoulder: SilhouetteRow | null;
  waist: SilhouetteRow | null;
  hip: SilhouetteRow | null;
  /** 머리 위쪽 사람 픽셀의 최상단 y (헤어 포함) */
  topY: number | null;
  /** 발 아래쪽 사람 픽셀의 최하단 y */
  bottomY: number | null;
  /** 발 범위의 사람 픽셀이 마스크 마지막 행(사진 하단)에 닿음 — 발이 잘렸을 가능성 */
  bottomTouchesEdge: boolean;
  /** 머리 띠의 사람 픽셀이 마스크 첫 행(사진 상단)에 닿음 — 정수리가 잘렸을 가능성 */
  topTouchesEdge: boolean;
  /** topTouchesEdge일 때 첫 사람 픽셀 행에서 머리 띠와 겹치는 가장 긴 구간 ÷ 머리 띠 폭. 머리 중간이 잘렸으면 1 안팎(넘을 수 있음), 머리끝만 닿았으면 작다 */
  topEdgeCover: number;
  /** 어깨·허리·골반 행의 몸 구간이 사진 왼쪽/오른쪽 끝 열에 닿음 — 몸 옆이 잘렸을 가능성 */
  sideTouchesEdge: boolean;
  /** 마스크 내 사람 픽셀 비율 */
  coverage: number;
  /** 팔이 허리/골반 폭 구간에 겹쳐 보정한 행이 있는지 */
  armsOverlap: boolean;
}

function makeIsOn(mask: PersonMask): (x: number, y: number) => boolean {
  let thr = mask.threshold;
  if (thr === undefined) {
    let max = 0;
    const step = Math.max(1, Math.floor(mask.data.length / 5000));
    for (let i = 0; i < mask.data.length; i += step) if (mask.data[i] > max) max = mask.data[i];
    thr = max > 1.001 ? 128 : 0.5;
  }
  const t = thr;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
    return mask.data[(y | 0) * mask.width + (x | 0)] >= t;
  };
}

/**
 * y행에서 cx를 포함하는(없으면 cx에 가장 가까운, maxDist 이내) 연속 구간. 1~2px 틈은 메운다.
 */
export function rowSegment(mask: PersonMask, y: number, cx: number, opts: { gap?: number; maxDist?: number } = {}): { x0: number; x1: number } | null {
  const isOn = makeIsOn(mask);
  return rowSegmentWith(isOn, mask.width, y, cx, opts);
}

function rowSegmentWith(isOn: (x: number, y: number) => boolean, width: number, y: number, cx: number, opts: { gap?: number; maxDist?: number } = {}): { x0: number; x1: number } | null {
  const gap = opts.gap ?? Math.max(1, Math.round(width * 0.004));
  const maxDist = opts.maxDist ?? width * 0.05;
  const yi = Math.round(y);
  let start = Math.round(cx);
  if (!isOn(start, yi)) {
    let found = -1;
    for (let d = 1; d <= maxDist; d++) {
      if (isOn(start - d, yi)) {
        found = start - d;
        break;
      }
      if (isOn(start + d, yi)) {
        found = start + d;
        break;
      }
    }
    if (found < 0) return null;
    start = found;
  }
  const extend = (dir: -1 | 1): number => {
    let x = start;
    let miss = 0;
    let last = start;
    while (x + dir >= 0 && x + dir < width) {
      x += dir;
      if (isOn(x, yi)) {
        last = x;
        miss = 0;
      } else if (++miss > gap) break;
    }
    return last;
  };
  return { x0: extend(-1), x1: extend(1) };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 사람 마스크에서 어깨/허리/골반 실루엣 폭과 머리끝/발끝 */
export function measureSilhouette(mask: PersonMask, g: SilhouetteGuides): SilhouetteMeasurement {
  const isOn = makeIsOn(mask);
  let on = 0;
  const step = Math.max(1, Math.floor(mask.data.length / 20000));
  let seen = 0;
  for (let i = 0; i < mask.data.length; i += step) {
    seen++;
    if (isOn(i % mask.width, Math.floor(i / mask.width))) on++;
  }
  const coverage = seen ? on / seen : 0;

  const torso = g.hipMid.y - g.shoulderMid.y;
  const thigh = g.kneeMid.y - g.hipMid.y;
  const centerAt = (y: number): number => {
    if (y <= g.shoulderMid.y) return g.shoulderMid.x;
    if (y <= g.hipMid.y) return lerp(g.shoulderMid.x, g.hipMid.x, (y - g.shoulderMid.y) / Math.max(1, torso));
    return lerp(g.hipMid.x, g.kneeMid.x, Math.min(1, (y - g.hipMid.y) / Math.max(1, thigh)));
  };
  const armXAt = (seg: [Px, Px], y: number): number | null => {
    const [a, b] = seg;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y > hi || hi - lo < 1) return null;
    return lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
  };
  const measureRow = (y: number, correctArms: boolean): SilhouetteRow | null => {
    const cx = centerAt(y);
    const seg = rowSegmentWith(isOn, mask.width, y, cx);
    if (!seg) return null;
    let { x0, x1 } = seg;
    const touchesSide = x0 <= 0 || x1 >= mask.width - 1;
    let armsOverlap = false;
    if (correctArms) {
      for (const s of g.armSegments) {
        const ax = armXAt(s, y);
        if (ax === null || ax <= x0 || ax >= x1) continue;
        armsOverlap = true;
        if (ax < cx) x0 = Math.max(x0, Math.min(cx - 1, ax + g.armHalfWidth));
        else x1 = Math.min(x1, Math.max(cx + 1, ax - g.armHalfWidth));
      }
    }
    return { y: Math.round(y), x0, x1, width: x1 - x0 + 1, armsOverlap, ...(touchesSide ? { touchesSide } : {}) };
  };
  const scan = (y0: number, y1: number, pick: 'max' | 'min', correctArms = true): SilhouetteRow | null => {
    if (!(torso > 4)) return null;
    const n = Math.max(3, Math.min(60, Math.round(Math.abs(y1 - y0))));
    let best: SilhouetteRow | null = null;
    for (let i = 0; i <= n; i++) {
      const r = measureRow(lerp(y0, y1, i / n), correctArms);
      if (!r) continue;
      if (!best || (pick === 'max' ? r.width > best.width : r.width < best.width)) best = r;
    }
    return best;
  };

  // 어깨: 어깨 관절 바로 아래 띠의 최대 폭 (삼각근 포함)
  // (어깨 띠는 위팔이 곧 어깨 윤곽이므로 팔 보정을 하지 않는다)
  const shoulder = scan(g.shoulderMid.y + torso * 0.03, g.shoulderMid.y + torso * 0.14, 'max', false);
  // 허리: 몸통 45~85% 구간의 최소 폭 (자연 허리)
  const waist = scan(g.shoulderMid.y + torso * 0.45, g.shoulderMid.y + torso * 0.85, 'min');
  // 골반: 고관절 약간 위 ~ 허벅지 35% 구간의 최대 폭
  const hip = thigh > 4 ? scan(g.hipMid.y - torso * 0.04, g.hipMid.y + thigh * 0.35, 'max') : null;

  // 머리끝: 머리 중심 띠 안에서 가장 위의 사람 픽셀
  let topY: number | null = null;
  const hx0 = Math.max(0, Math.floor(g.headCenterX - g.headHalfBand));
  const hx1 = Math.min(mask.width - 1, Math.ceil(g.headCenterX + g.headHalfBand));
  const yStop = Math.min(mask.height - 1, Math.round(g.headSearchBottomY));
  outerTop: for (let y = 0; y <= yStop; y++) {
    let run = 0;
    for (let x = hx0; x <= hx1; x++) {
      if (isOn(x, y)) {
        // 잡음 한 점은 무시: 가로로 2px 이상 이어진 경우만
        if (++run >= 2) {
          topY = y;
          break outerTop;
        }
      } else run = 0;
    }
  }

  const topTouchesEdge = topY !== null && topY <= 1;
  let topEdgeCover = 0;
  if (topTouchesEdge && hx1 > hx0) {
    // 머리 띠와 겹치는 가장 긴 구간(띠 밖으로 이어진 부분 포함). 고개를 돌리면 머리가 코 기준 띠의 한쪽으로 치우치므로 띠로 자르지 않는다
    let best = 0;
    let x = 0;
    while (x < mask.width) {
      if (!isOn(x, topY!)) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < mask.width && isOn(x, topY!)) x++;
      if (x0 <= hx1 && x - 1 >= hx0) best = Math.max(best, x - x0);
    }
    topEdgeCover = best / (hx1 - hx0 + 1);
  }

  // 발끝: 발 x 범위에서 가장 아래 사람 픽셀
  let bottomY: number | null = null;
  const fx0 = Math.max(0, Math.floor(g.feetX0));
  const fx1 = Math.min(mask.width - 1, Math.ceil(g.feetX1));
  const yStart = Math.max(0, Math.round(g.feetSearchTopY));
  outerBottom: for (let y = mask.height - 1; y >= yStart; y--) {
    let run = 0;
    for (let x = fx0; x <= fx1; x++) {
      if (isOn(x, y)) {
        if (++run >= 2) {
          bottomY = y;
          break outerBottom;
        }
      } else run = 0;
    }
  }

  return {
    shoulder,
    waist,
    hip,
    topY,
    bottomY,
    bottomTouchesEdge: bottomY !== null && bottomY >= mask.height - 2,
    topTouchesEdge,
    topEdgeCover,
    sideTouchesEdge: [shoulder, waist, hip].some((r) => r?.touchesSide),
    coverage,
    armsOverlap: [shoulder, waist, hip].some((r) => r?.armsOverlap),
  };
}
