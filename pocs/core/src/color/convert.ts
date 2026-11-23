/**
 * 색 변환: sRGB(0..255) ↔ linear RGB(0..1) ↔ CIE XYZ(D65, Y=0..1) ↔ CIELAB(D65) ↔ LCh.
 * 수식 출처: IEC 61966-2-1 (sRGB), CIE 15:2004 (Lab). 모든 함수는 순수 함수.
 */

/** sRGB 8비트 채널 값(0..255, 실수 허용). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}
/** 0..1 선형 RGB. */
export type LinearRgb = Rgb;
/** CIE XYZ (Y: 0..1 스케일). */
export interface Xyz {
  x: number;
  y: number;
  z: number;
}
/** CIELAB: l 0..100, a/b 대략 -128..127. */
export interface Lab {
  l: number;
  a: number;
  b: number;
}
/** CIE LCh(ab): c = chroma, h = hue angle(도, 0..360). */
export interface Lch {
  l: number;
  c: number;
  h: number;
}
/** CIE xy 색도 좌표. */
export interface Xy {
  x: number;
  y: number;
}

/** D65 기준 백색점 (Y=1). CIE 1931 2°. */
export const D65: Xyz = { x: 0.95047, y: 1.0, z: 1.08883 };
/** D50 기준 백색점 (Y=1). */
export const D50: Xyz = { x: 0.96422, y: 1.0, z: 0.82521 };

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number, d = 0) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

/* ------------------------------------------------------------------ sRGB ↔ linear */

/** sRGB 감마 해제: 채널 0..1 → 선형 0..1 */
export function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
/** 선형 0..1 → sRGB 감마 0..1 */
export function linearChannelToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}
/** sRGB(0..255) → 선형 RGB(0..1) */
export function srgbToLinear(rgb: Rgb): LinearRgb {
  return {
    r: srgbChannelToLinear(rgb.r / 255),
    g: srgbChannelToLinear(rgb.g / 255),
    b: srgbChannelToLinear(rgb.b / 255),
  };
}
/** 선형 RGB(0..1) → sRGB(0..255, 실수; 범위 밖은 클램프) */
export function linearToSrgb(lin: LinearRgb): Rgb {
  return {
    r: clamp(linearChannelToSrgb(lin.r)) * 255,
    g: clamp(linearChannelToSrgb(lin.g)) * 255,
    b: clamp(linearChannelToSrgb(lin.b)) * 255,
  };
}

/* ------------------------------------------------------------------ linear ↔ XYZ */

// IEC 61966-2-1 행렬 (D65)
const M_RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;
const M_XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

export function linearToXyz(c: LinearRgb): Xyz {
  const m = M_RGB_TO_XYZ;
  return {
    x: m[0][0] * c.r + m[0][1] * c.g + m[0][2] * c.b,
    y: m[1][0] * c.r + m[1][1] * c.g + m[1][2] * c.b,
    z: m[2][0] * c.r + m[2][1] * c.g + m[2][2] * c.b,
  };
}
export function xyzToLinear(v: Xyz): LinearRgb {
  const m = M_XYZ_TO_RGB;
  return {
    r: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    g: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    b: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}
export const rgbToXyz = (rgb: Rgb): Xyz => linearToXyz(srgbToLinear(rgb));
export const xyzToRgb = (xyz: Xyz): Rgb => linearToSrgb(xyzToLinear(xyz));

/* ------------------------------------------------------------------ XYZ ↔ Lab */

const EPS = 216 / 24389; // 0.008856
const KAPPA = 24389 / 27; // 903.3

export function xyzToLab(v: Xyz, white: Xyz = D65): Lab {
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(v.x / white.x);
  const fy = f(v.y / white.y);
  const fz = f(v.z / white.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
export function labToXyz(lab: Lab, white: Xyz = D65): Xyz {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const inv = (t: number) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
  const yr = lab.l > KAPPA * EPS ? fy ** 3 : lab.l / KAPPA;
  return { x: inv(fx) * white.x, y: yr * white.y, z: inv(fz) * white.z };
}
export const rgbToLab = (rgb: Rgb): Lab => xyzToLab(rgbToXyz(rgb));
export const labToRgb = (lab: Lab): Rgb => xyzToRgb(labToXyz(lab));

/* ------------------------------------------------------------------ Lab ↔ LCh */

export function labToLch(lab: Lab): Lch {
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h };
}
export function lchToLab(lch: Lch): Lab {
  const r = (lch.h * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(r), b: lch.c * Math.sin(r) };
}
/** Lab의 chroma C*ab */
export const chroma = (lab: Lab): number => Math.hypot(lab.a, lab.b);
/** Lab의 hue angle h_ab (도, 0..360) */
export const hueAngle = (lab: Lab): number => labToLch(lab).h;

/* ------------------------------------------------------------------ XYZ ↔ xy */

export function xyzToXy(v: Xyz): Xy {
  const s = v.x + v.y + v.z;
  return s === 0 ? { x: D65.x / (D65.x + 1 + D65.z), y: 1 / (D65.x + 1 + D65.z) } : { x: v.x / s, y: v.y / s };
}
/** xy + Y → XYZ */
export function xyToXyz(xy: Xy, Y = 1): Xyz {
  return { x: (xy.x * Y) / xy.y, y: Y, z: ((1 - xy.x - xy.y) * Y) / xy.y };
}

/* ------------------------------------------------------------------ HEX */

/** '#RRGGBB' 또는 'RRGGBB' 또는 '#RGB' → Rgb */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`invalid hex color: ${hex}`);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
/** Rgb(0..255 실수 허용) → '#RRGGBB'(대문자) */
export function rgbToHex(rgb: Rgb): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`.toUpperCase();
}
export const hexToLab = (hex: string): Lab => rgbToLab(hexToRgb(hex));
export const labToHex = (lab: Lab): string => rgbToHex(labToRgb(lab));

/** 상대 휘도 (WCAG, 0..1) */
export function relativeLuminance(rgb: Rgb): number {
  const l = srgbToLinear(rgb);
  return 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b;
}
/** Rec.601 luma (0..255) — 밝기 판정/퍼센타일 컷용 빠른 근사 */
export const luma = (rgb: Rgb): number => 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;

/** 두 색의 대비율 (WCAG) */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 표시용 반올림 */
export function roundLab(lab: Lab, d = 1): Lab {
  return { l: round(lab.l, d), a: round(lab.a, d), b: round(lab.b, d) };
}
export function roundRgb(rgb: Rgb): Rgb {
  return { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
}

/** Lab 공간 선형 보간 (그라데이션/드레이핑 보조색 생성용) */
export function mixLab(a: Lab, b: Lab, t: number): Lab {
  return { l: a.l + (b.l - a.l) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t };
}
export function mixHex(a: string, b: string, t: number): string {
  return labToHex(mixLab(hexToLab(a), hexToLab(b), t));
}
