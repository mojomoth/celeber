/**
 * 광원/화이트밸런스: RGB→CCT(McCamy), CCT→백색점, gray-world, 기준 백색(흰 종이) 보정,
 * von Kries / Bradford 색순응.
 */
import {
  D65,
  type LinearRgb,
  type Rgb,
  type Xy,
  type Xyz,
  clamp,
  linearToSrgb,
  linearToXyz,
  rgbToXyz,
  srgbToLinear,
  xyToXyz,
  xyzToLinear,
  xyzToXy,
} from './convert';

/* ------------------------------------------------------------------ CCT */

/**
 * McCamy(1992) 근사: xy 색도 → 상관 색온도(K). 2,000~12,500K 범위에서 오차 수십 K 수준.
 */
export function xyToCctMcCamy(xy: Xy): number {
  const n = (xy.x - 0.332) / (0.1858 - xy.y);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}
/** 평균 sRGB(0..255) → CCT(K). 무채색에 가까운 영역(벽, 종이, 장면 평균)에 적용해야 의미가 있다. */
export function rgbToCct(rgb: Rgb): number {
  return xyToCctMcCamy(xyzToXy(rgbToXyz(rgb)));
}

/**
 * CCT(K) → 백색점 xy. 4,000K 이상은 CIE 주광 궤적, 그 미만은 Planckian 궤적 근사(Kim et al. 2002).
 */
export function cctToXy(cct: number): Xy {
  const T = clamp(cct, 1667, 25000);
  if (T >= 4000) {
    const x =
      T <= 7000
        ? -4.607e9 / T ** 3 + 2.9678e6 / T ** 2 + 0.09911e3 / T + 0.244063
        : -2.0064e9 / T ** 3 + 1.9018e6 / T ** 2 + 0.24748e3 / T + 0.23704;
    const y = -3 * x * x + 2.87 * x - 0.275;
    return { x, y };
  }
  const x =
    T <= 4000
      ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
      : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
  let y: number;
  if (T <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  else if (T <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return { x, y };
}
export const cctToWhiteXyz = (cct: number): Xyz => xyToXyz(cctToXy(cct), 1);

/* ------------------------------------------------------------------ 색순응 */

export type AdaptationMethod = 'bradford' | 'von-kries' | 'xyz-scaling';

const CAT: Record<AdaptationMethod, number[][]> = {
  bradford: [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ],
  // Hunt-Pointer-Estévez (D65 정규화)
  'von-kries': [
    [0.4002, 0.7076, -0.0808],
    [-0.2263, 1.1653, 0.0457],
    [0, 0, 0.9182],
  ],
  'xyz-scaling': [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};

function mul(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
function inv3(m: number[][]): number[][] {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/**
 * von Kries 계열 색순응: srcWhite 조명 아래의 XYZ를 dstWhite(기본 D65) 조명 아래의 대응색으로 변환.
 */
export function adaptXyz(xyz: Xyz, srcWhite: Xyz, dstWhite: Xyz = D65, method: AdaptationMethod = 'bradford'): Xyz {
  const M = CAT[method];
  const Mi = inv3(M);
  const s = mul(M, [srcWhite.x, srcWhite.y, srcWhite.z]);
  const d = mul(M, [dstWhite.x, dstWhite.y, dstWhite.z]);
  const c = mul(M, [xyz.x, xyz.y, xyz.z]);
  const adapted: [number, number, number] = [(c[0] * d[0]) / s[0], (c[1] * d[1]) / s[1], (c[2] * d[2]) / s[2]];
  const out = mul(Mi, adapted);
  return { x: out[0], y: out[1], z: out[2] };
}

/** sRGB 색을 측정된 광원 백색(sRGB)에서 D65로 순응. whiteRgb: 흰 종이/회색 기준의 평균 색. */
export function adaptRgbToD65(rgb: Rgb, whiteRgb: Rgb, method: AdaptationMethod = 'bradford'): Rgb {
  const srcW = rgbToXyz(whiteRgb);
  // 밝기는 유지하고 색도만 맞추기 위해 Y=1로 정규화
  const srcWn: Xyz = { x: srcW.x / srcW.y, y: 1, z: srcW.z / srcW.y };
  return linearToSrgb(xyzToLinear(adaptXyz(rgbToXyz(rgb), srcWn, D65, method)));
}
/** 추정 CCT 기반 순응 (기준 백색이 없을 때) */
export function adaptRgbFromCct(rgb: Rgb, cct: number, method: AdaptationMethod = 'bradford'): Rgb {
  return linearToSrgb(xyzToLinear(adaptXyz(rgbToXyz(rgb), cctToWhiteXyz(cct), D65, method)));
}

/* ------------------------------------------------------------------ 채널 게인 방식 */

/** 선형 RGB 채널 게인 (r,g,b 곱). g=1로 정규화되어 있음. */
export interface WbGains {
  r: number;
  g: number;
  b: number;
}

/**
 * Gray-world 가정: 장면 평균은 무채색이다 → 선형 RGB 평균의 채널 게인.
 * pixels: RGBA(Uint8ClampedArray 등) 또는 Rgb 배열. 과포화/너무 어두운 픽셀은 제외.
 * maxGain으로 극단적 보정을 막는다.
 */
export function grayWorldGains(
  pixels: ArrayLike<number> | Rgb[],
  opts: { stride?: number; minLuma?: number; maxLuma?: number; maxGain?: number } = {},
): WbGains {
  const { minLuma = 20, maxLuma = 245, maxGain = 1.8 } = opts;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  const add = (r: number, g: number, b: number) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < minLuma || y > maxLuma) return;
    sr += srgbLut[r | 0];
    sg += srgbLut[g | 0];
    sb += srgbLut[b | 0];
    n++;
  };
  if (Array.isArray(pixels) && typeof pixels[0] === 'object') {
    for (const p of pixels as Rgb[]) add(p.r, p.g, p.b);
  } else {
    const arr = pixels as ArrayLike<number>;
    const stride = (opts.stride ?? 1) * 4;
    for (let i = 0; i + 2 < arr.length; i += stride) add(arr[i], arr[i + 1], arr[i + 2]);
  }
  if (n === 0 || sr === 0 || sb === 0) return { r: 1, g: 1, b: 1 };
  const mr = sr / n;
  const mg = sg / n;
  const mb = sb / n;
  const lim = (v: number) => clamp(v, 1 / maxGain, maxGain);
  return { r: lim(mg / mr), g: 1, b: lim(mg / mb) };
}

/** 기준 백색(흰 종이 등) 평균 sRGB → 게인 */
export function referenceWhiteGains(whiteRgb: Rgb, maxGain = 2.5): WbGains {
  const l = srgbToLinear(whiteRgb);
  if (l.r <= 0 || l.b <= 0) return { r: 1, g: 1, b: 1 };
  const lim = (v: number) => clamp(v, 1 / maxGain, maxGain);
  return { r: lim(l.g / l.r), g: 1, b: lim(l.g / l.b) };
}

/** 게인을 sRGB 색에 적용 (선형 공간에서 곱) */
export function applyGains(rgb: Rgb, gains: WbGains, strength = 1): Rgb {
  const l = srgbToLinear(rgb);
  const k = (g: number) => 1 + (g - 1) * strength;
  const out: LinearRgb = { r: l.r * k(gains.r), g: l.g * k(gains.g), b: l.b * k(gains.b) };
  return linearToSrgb(out);
}

/** 게인을 RGBA 버퍼 전체에 적용 (새 Uint8ClampedArray 반환) — 보정 전/후 미리보기용 */
export function applyGainsToPixels(data: ArrayLike<number>, gains: WbGains, strength = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const kr = 1 + (gains.r - 1) * strength;
  const kg = 1 + (gains.g - 1) * strength;
  const kb = 1 + (gains.b - 1) * strength;
  const lutR = buildGainLut(kr);
  const lutG = buildGainLut(kg);
  const lutB = buildGainLut(kb);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = lutR[data[i]];
    out[i + 1] = lutG[data[i + 1]];
    out[i + 2] = lutB[data[i + 2]];
    out[i + 3] = data[i + 3];
  }
  return out;
}

/** 게인이 만드는 보정량(무채색 기준 ΔE 근사) — 신뢰도 계산 입력 */
export function gainsMagnitude(gains: WbGains): number {
  return Math.hypot(Math.log(gains.r), Math.log(gains.b)) * 100;
}

/** 게인 → 장면 광원의 대략적 CCT (게인의 역 = 광원의 백색 색) */
export function gainsToCct(gains: WbGains): number {
  const white: LinearRgb = { r: 1 / gains.r, g: 1, b: 1 / gains.b };
  return xyToCctMcCamyFromXyz(linearToXyz(white));
}
function xyToCctMcCamyFromXyz(v: Xyz): number {
  return xyToCctMcCamy(xyzToXy(v));
}

/* ------------------------------------------------------------------ LUT */

const srgbLut: Float64Array = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return t;
})();
/** 0..255 sRGB → 선형 0..1 (LUT) */
export const srgb8ToLinear = (v: number): number => srgbLut[Math.max(0, Math.min(255, v | 0))];

function buildGainLut(k: number): Uint8ClampedArray {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const lin = srgbLut[i] * k;
    const c = lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.min(lin, 1) ** (1 / 2.4) - 0.055;
    t[i] = Math.round(clamp(c) * 255);
  }
  return t;
}
