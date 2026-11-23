/**
 * 사진 속 옷 영역 색 바꾸기 (코디 색 치환 예시). 브라우저 canvas ImageData에 적용하는 순수 함수.
 *  - 아이템 box(정규화 bbox) 안에서 원래 옷 색(from)과 Lab 거리가 임계값 이하인 픽셀만 고른다.
 *  - 고른 픽셀은 Lab에서 (to - from)만큼 평행 이동 → 주름·음영(픽셀 간 L 차이)은 유지된다.
 *  - 경계는 임계값 근처에서 가중치를 줄여(feather) 자연스럽게 섞는다.
 *  - box 밖(얼굴·배경)은 건드리지 않는다.
 */
import type { Box } from '@celeber/core/contracts';
import { hexToLab, labToRgb, rgbToLab } from '@celeber/core/color';

export interface RecolorOptions {
  /** Lab 유클리드 거리 임계값. 생략하면 pickThreshold로 고른다 */
  threshold?: number;
  /** 0..1 — 임계값의 이 비율 구간에서 가중치를 0으로 줄인다 */
  feather?: number;
  /** box를 이 비율만큼 넓힌다 (bbox가 옷을 조금 덜 덮는 경우) */
  pad?: number;
}

export interface RecolorResult {
  changed: number;
  total: number;
  threshold: number;
}

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export function boxToPixels(box: Box, width: number, height: number, pad = 0) {
  const x0 = Math.max(0, Math.floor((box.x - box.w * pad) * width));
  const y0 = Math.max(0, Math.floor((box.y - box.h * pad) * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w * (1 + pad)) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h * (1 + pad)) * height));
  return { x0, y0, x1, y1 };
}

/** box 안 픽셀의 from 색 거리 분포에서, 영역의 25% 이상을 덮는 가장 작은 임계값 (16/22/30) */
export function pickThreshold(data: Uint8ClampedArray, width: number, height: number, box: Box, fromHex: string, pad = 0.02): number {
  const from = hexToLab(fromHex);
  const { x0, y0, x1, y1 } = boxToPixels(box, width, height, pad);
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  const ds: number[] = [];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const lab = rgbToLab({ r: data[i], g: data[i + 1], b: data[i + 2] });
      ds.push(Math.hypot(lab.l - from.l, lab.a - from.a, lab.b - from.b));
    }
  if (!ds.length) return 22;
  for (const t of [16, 22, 30]) if (ds.filter((d) => d <= t).length / ds.length >= 0.25) return t;
  return 30;
}

/** data(RGBA)를 제자리에서 바꾼다 */
export function recolorRegion(data: Uint8ClampedArray, width: number, height: number, box: Box, fromHex: string, toHex: string, opts: RecolorOptions = {}): RecolorResult {
  const pad = opts.pad ?? 0.02;
  const feather = opts.feather ?? 0.35;
  const threshold = opts.threshold ?? pickThreshold(data, width, height, box, fromHex, pad);
  const from = hexToLab(fromHex);
  const to = hexToLab(toHex);
  const dl = to.l - from.l;
  const da = to.a - from.a;
  const db = to.b - from.b;
  const hard = threshold * (1 - feather);
  const { x0, y0, x1, y1 } = boxToPixels(box, width, height, pad);
  let changed = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const lab = rgbToLab({ r: data[i], g: data[i + 1], b: data[i + 2] });
      const d = Math.hypot(lab.l - from.l, lab.a - from.a, lab.b - from.b);
      if (d > threshold) continue;
      const w = d <= hard ? 1 : (threshold - d) / (threshold - hard);
      const rgb = labToRgb({ l: Math.max(0, Math.min(100, lab.l + dl * w)), a: lab.a + da * w, b: lab.b + db * w });
      data[i] = clamp255(rgb.r);
      data[i + 1] = clamp255(rgb.g);
      data[i + 2] = clamp255(rgb.b);
      changed++;
    }
  return { changed, total: Math.max(0, (x1 - x0) * (y1 - y0)), threshold };
}
