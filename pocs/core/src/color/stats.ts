/**
 * 강건 통계: 퍼센타일, 트림 평균, 휘도 기반 하이라이트/그림자 컷 후 평균 색.
 */
import type { Rgb } from './convert';
import { srgb8ToLinear } from './illuminant';
import { clamp, linearChannelToSrgb } from './convert';

export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
export function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}
export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
}
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}
/** 양 끝 비율(lowPct, highPct: 0..1)을 잘라낸 평균 */
export function trimmedMean(values: number[], lowPct = 0.1, highPct = 0.1): number {
  const s = [...values].sort((a, b) => a - b);
  const a = Math.floor(s.length * lowPct);
  const b = Math.ceil(s.length * (1 - highPct));
  return mean(s.slice(a, Math.max(a + 1, b)));
}

export interface RobustColorResult {
  /** 결과 평균 색 (sRGB 0..255, 선형 공간에서 평균 후 감마 적용) */
  rgb: Rgb;
  /** 컷 후 사용된 픽셀 수 */
  used: number;
  /** 입력 픽셀 수 */
  total: number;
  /** 사용된 픽셀 luma의 표준편차 (균일도; 낮을수록 안정) */
  lumaStd: number;
  /** 사용된 픽셀의 채널별 표준편차 (sRGB 0..255) */
  channelStd: Rgb;
}

/**
 * 휘도 퍼센타일 컷(하이라이트/그림자 제거) 후 선형 평균 색.
 * pixels: Rgb 배열 (ROI 마스크로 추출한 픽셀). lowPct/highPct: 0..1 (예: 0.1, 0.05).
 */
export function robustMeanColor(pixels: Rgb[], lowPct = 0.1, highPct = 0.05): RobustColorResult {
  const total = pixels.length;
  if (total === 0) return { rgb: { r: NaN, g: NaN, b: NaN }, used: 0, total, lumaStd: NaN, channelStd: { r: NaN, g: NaN, b: NaN } };
  const lumas = pixels.map((p) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b);
  const sorted = Float64Array.from(lumas).sort();
  const lo = percentile(sorted, lowPct);
  const hi = percentile(sorted, 1 - highPct);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  const used: Rgb[] = [];
  const usedL: number[] = [];
  for (let i = 0; i < total; i++) {
    if (lumas[i] < lo || lumas[i] > hi) continue;
    const p = pixels[i];
    sr += srgb8ToLinear(p.r);
    sg += srgb8ToLinear(p.g);
    sb += srgb8ToLinear(p.b);
    used.push(p);
    usedL.push(lumas[i]);
    n++;
  }
  if (n === 0) return robustMeanColor(pixels, 0, 0);
  const toS = (v: number) => clamp(linearChannelToSrgb(v / n)) * 255;
  return {
    rgb: { r: toS(sr), g: toS(sg), b: toS(sb) },
    used: n,
    total,
    lumaStd: stddev(usedL),
    channelStd: { r: stddev(used.map((p) => p.r)), g: stddev(used.map((p) => p.g)), b: stddev(used.map((p) => p.b)) },
  };
}
