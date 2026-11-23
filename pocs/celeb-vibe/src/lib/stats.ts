/**
 * RGBA 픽셀 → 장면 통계 / 서버 휴리스틱 (순수 함수).
 * 브라우저(측정 단계의 scene)와 서버(sharp raw) 양쪽에서 쓴다.
 */
import { type Rgb, grayWorldGains, robustMeanColor } from '@celeber/core/color';
import { isSkinLike } from '@celeber/core/face';
import { dominantColors } from './kmeans';
import type { SceneMeasurement, ServerImageStats } from './measurement';
import { sceneCct } from './rules';

export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** 이 값보다 투명한 픽셀은 사진 내용이 아니라 여백으로 보고 통계에서 뺀다 */
export const ALPHA_MIN = 128;

/** 반투명 픽셀은 흰 배경에 합성한 색 (AI 입력 이미지와 같은 처리). 불투명이면 그대로 */
function over(v: number, a: number): number {
  return a >= 255 ? v : Math.round((v * a + 255 * (255 - a)) / 255);
}

/**
 * 장면 밝기/클리핑/채도/흑백 + gray-world 게인.
 * 투명 여백(alpha < ALPHA_MIN)은 빼고 계산한다. RGB가 0인 투명 영역 때문에 밝은 사진을 '매우 어둡다'고 판정하지 않도록.
 */
export function sceneStats(img: Pixels): SceneMeasurement {
  const { data, width, height } = img;
  const n = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(n / 40000)));
  let sum = 0;
  let cnt = 0;
  let hi = 0;
  let lo = 0;
  let sat = 0;
  let neutral = 0;
  let skipped = 0;
  const sampled: Rgb[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] ?? 255;
      if (a < ALPHA_MIN) {
        skipped++;
        continue;
      }
      const r = over(data[i], a);
      const g = over(data[i + 1], a);
      const b = over(data[i + 2], a);
      sampled.push({ r, g, b });
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += l;
      cnt++;
      if (l >= 250) hi++;
      if (l <= 6) lo++;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sat += (mx - mn) / 255;
      if (mx - mn <= 10) neutral++;
    }
  }
  // 불투명 사진은 기존과 같은 계산, 투명 여백이 있으면 남은 픽셀만으로 계산
  const gains = skipped ? grayWorldGains(sampled) : grayWorldGains(data, { stride: step });
  return {
    meanLuma: cnt ? sum / cnt : 0,
    clippedHigh: cnt ? hi / cnt : 0,
    clippedLow: cnt ? lo / cnt : 0,
    meanSaturation: cnt ? sat / cnt : 0,
    grayscale: cnt > 0 && neutral / cnt > 0.97,
    grayWorldGains: { r: round3(gains.r), g: round3(gains.g), b: round3(gains.b) },
    cctK: sceneCct(gains),
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 정규화 사각형 영역의 픽셀 (필터 통과분) */
export function rectPixels(img: Pixels, x0: number, y0: number, x1: number, y1: number, filter?: (r: number, g: number, b: number) => boolean, max = 6000): Rgb[] {
  const { data, width, height } = img;
  const px0 = Math.max(0, Math.floor(x0 * width));
  const px1 = Math.min(width - 1, Math.ceil(x1 * width));
  const py0 = Math.max(0, Math.floor(y0 * height));
  const py1 = Math.min(height - 1, Math.ceil(y1 * height));
  const area = Math.max(1, (px1 - px0 + 1) * (py1 - py0 + 1));
  const step = Math.max(1, Math.floor(Math.sqrt(area / max)));
  const out: Rgb[] = [];
  for (let y = py0; y <= py1; y += step) {
    for (let x = px0; x <= px1; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] ?? 255;
      if (a < ALPHA_MIN) continue;
      const r = over(data[i], a);
      const g = over(data[i + 1], a);
      const b = over(data[i + 2], a);
      if (filter && !filter(r, g, b)) continue;
      out.push({ r, g, b });
    }
  }
  return out;
}

function meanLuma(px: Rgb[]): number {
  if (!px.length) return 0;
  return px.reduce((s, p) => s + 0.299 * p.r + 0.587 * p.g + 0.114 * p.b, 0) / px.length;
}

/**
 * 서버 통계 (브라우저 측정이 없을 때의 대체 근거).
 * 인물이 가운데 있다고 가정하고 상단 중앙=얼굴/피부, 중앙=상의, 중하단=하의로 본다.
 */
export function serverImageStats(img: Pixels, original: { width: number; height: number }): ServerImageStats {
  const scene = sceneStats(img);
  const border = [...rectPixels(img, 0, 0, 1, 0.1, undefined, 2000), ...rectPixels(img, 0, 0, 0.1, 1, undefined, 2000), ...rectPixels(img, 0.9, 0, 1, 1, undefined, 2000)];
  const borderL = meanLuma(border);
  const skinPx = rectPixels(img, 0.25, 0.04, 0.75, 0.45, (r, g, b) => isSkinLike(r, g, b));
  const heuristicSkin = skinPx.length >= 200 ? robustMeanColor(skinPx, 0.15, 0.1) : undefined;
  const notSkin = (r: number, g: number, b: number) => !isSkinLike(r, g, b);
  const upper = rectPixels(img, 0.32, 0.3, 0.68, 0.55, notSkin);
  const lower = rectPixels(img, 0.34, 0.58, 0.66, 0.88, notSkin);
  return {
    width: original.width,
    height: original.height,
    meanLuma: scene.meanLuma,
    clippedHigh: scene.clippedHigh,
    clippedLow: scene.clippedLow,
    meanSaturation: scene.meanSaturation,
    grayscale: scene.grayscale,
    // 피부 유사 픽셀(얼굴 후보) 밝기 / 가장자리 밝기. 어두운 옷 때문에 오판하지 않도록 피부 픽셀만 본다
    centerToBorderLuma: heuristicSkin && borderL > 0 ? (0.299 * heuristicSkin.rgb.r + 0.587 * heuristicSkin.rgb.g + 0.114 * heuristicSkin.rgb.b) / borderL : 1,
    heuristicSkin: heuristicSkin ? { rgb: heuristicSkin.rgb, used: heuristicSkin.used, lumaStd: heuristicSkin.lumaStd } : undefined,
    heuristicUpper: upper.length >= 100 ? dominantColors(upper, { k: 3, seed: 'upper' }) : [],
    heuristicLower: lower.length >= 100 ? dominantColors(lower, { k: 3, seed: 'lower' }) : [],
  };
}
