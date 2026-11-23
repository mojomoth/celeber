/**
 * ⑤ 톤 컬러 적용 예시(드레이핑) 합성 기하. 순수 함수 (canvas 그리기는 components/DrapeThumb).
 *
 * 같은 정면 사진에서 같은 크롭을 쓰고 턱 아래 천의 색만 바꾼다 → 조명·표정·구도가 모든 썸네일에서 같다.
 * 좌표: anchor는 정면 사진 정규화 좌표(0..1), 크롭은 원본 픽셀, 천 윤곽은 출력 캔버스 픽셀.
 */

export interface DrapeAnchor {
  chin: { x: number; y: number };
  jawLeft: { x: number; y: number };
  jawRight: { x: number; y: number };
  faceBox: { x: number; y: number; w: number; h: number };
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** 크롭 기본값: 얼굴 위 22%부터 턱 아래 얼굴 높이 60%까지 (사진이 턱 바로 아래에서 끝나면 최소 35%) */
export const DRAPE_CROP = { above: 0.22, belowChin: 0.6, minBelowChin: 0.35 } as const;

/**
 * 얼굴 + 목 주변을 담는 크롭 (원본 픽셀). aspect = 너비/높이.
 * 사진 밖으로 나가도 되며(아래쪽은 천이 덮는다), 호출 쪽에서 교집합만 그린다.
 */
export function drapeCrop(anchor: DrapeAnchor, imgW: number, imgH: number, aspect = 0.8): CropRect {
  const fb = anchor.faceBox;
  const fh = fb.h * imgH;
  const top = fb.y * imgH - DRAPE_CROP.above * fh;
  const chinY = anchor.chin.y * imgH;
  // 사진 밖(아래)으로 크게 나가지 않도록: 사진 끝까지만, 단 천이 들어갈 최소 공간은 확보
  const bottom = Math.min(chinY + DRAPE_CROP.belowChin * fh, Math.max(imgH, chinY + DRAPE_CROP.minBelowChin * fh));
  const sh = Math.max(1, bottom - top);
  const sw = sh * aspect;
  const cx = (fb.x + fb.w / 2) * imgW;
  return { sx: cx - sw / 2, sy: top, sw, sh };
}

/** 원본 크롭과 이미지의 교집합 → drawImage 인자 (원본 영역, 대상 영역). 겹치지 않으면 null */
export function cropIntersection(crop: CropRect, imgW: number, imgH: number, outW: number, outH: number): { src: CropRect; dst: { dx: number; dy: number; dw: number; dh: number } } | null {
  const x0 = Math.max(0, crop.sx);
  const y0 = Math.max(0, crop.sy);
  const x1 = Math.min(imgW, crop.sx + crop.sw);
  const y1 = Math.min(imgH, crop.sy + crop.sh);
  if (x1 <= x0 || y1 <= y0) return null;
  const s = outW / crop.sw;
  const sy = outH / crop.sh;
  return {
    src: { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 },
    dst: { dx: (x0 - crop.sx) * s, dy: (y0 - crop.sy) * sy, dw: (x1 - x0) * s, dh: (y1 - y0) * sy },
  };
}

/**
 * 천 윤곽 (출력 캔버스 픽셀). 위쪽 가장자리: 어깨 → 목 옆 → 턱 아래 → 목 옆 → 어깨.
 * 모든 점은 턱끝 높이 이상(아래)이므로 얼굴을 가리지 않는다.
 */
export interface DrapeOutline {
  /** 위쪽 가장자리 (왼쪽→오른쪽) — 곡선 제어점 */
  top: Pt[];
  /** 아래 닫는 점 (오른쪽 아래, 왼쪽 아래) */
  bottom: [Pt, Pt];
  /** 주름 곡선 (시작, 제어, 끝) */
  folds: [Pt, Pt, Pt][];
  /** 턱끝 (캔버스) */
  chin: Pt;
  /** 얼굴 폭/높이 (캔버스 픽셀) */
  faceW: number;
  faceH: number;
}

export function drapeOutline(anchor: DrapeAnchor, crop: CropRect, imgW: number, imgH: number, outW: number, outH: number): DrapeOutline {
  const s = outW / crop.sw;
  const toC = (p: { x: number; y: number }): Pt => ({ x: (p.x * imgW - crop.sx) * s, y: (p.y * imgH - crop.sy) * s });
  const C = toC(anchor.chin);
  const a = toC(anchor.jawLeft);
  const b = toC(anchor.jawRight);
  const L = a.x <= b.x ? a : b;
  const R = a.x <= b.x ? b : a;
  const fw = anchor.faceBox.w * imgW * s;
  const fh = anchor.faceBox.h * imgH * s;

  const shoulderY = C.y + 0.4 * fh;
  const collarY = C.y + 0.15 * fh;
  const neckY = C.y + 0.03 * fh;
  const underChinY = C.y + 0.08 * fh;
  const top: Pt[] = [
    { x: 0, y: Math.min(outH, shoulderY) },
    { x: L.x - 0.16 * fw, y: collarY },
    { x: L.x + 0.12 * fw, y: neckY },
    { x: C.x, y: underChinY },
    { x: R.x - 0.12 * fw, y: neckY },
    { x: R.x + 0.16 * fw, y: collarY },
    { x: outW, y: Math.min(outH, shoulderY) },
  ];
  const folds: [Pt, Pt, Pt][] = [
    [{ x: L.x + 0.05 * fw, y: neckY + 0.06 * fh }, { x: L.x - 0.05 * fw, y: C.y + 0.32 * fh }, { x: L.x - 0.3 * fw, y: outH }],
    [{ x: C.x - 0.12 * fw, y: underChinY + 0.05 * fh }, { x: C.x - 0.16 * fw, y: C.y + 0.35 * fh }, { x: C.x - 0.1 * fw, y: outH }],
    [{ x: C.x + 0.12 * fw, y: underChinY + 0.05 * fh }, { x: C.x + 0.18 * fw, y: C.y + 0.33 * fh }, { x: C.x + 0.14 * fw, y: outH }],
    [{ x: R.x - 0.05 * fw, y: neckY + 0.06 * fh }, { x: R.x + 0.05 * fw, y: C.y + 0.32 * fh }, { x: R.x + 0.32 * fw, y: outH }],
  ];
  return { top, bottom: [{ x: outW, y: outH }, { x: 0, y: outH }], folds, chin: C, faceW: fw, faceH: fh };
}

/** 얼굴 bbox만 있을 때 근사 앵커 (camera-face drapeAnchorFromAnalysis와 같은 규칙) */
export function anchorFromFaceBox(fb: DrapeAnchor['faceBox']): DrapeAnchor {
  return { chin: { x: fb.x + fb.w / 2, y: fb.y + fb.h }, jawLeft: { x: fb.x + fb.w * 0.85, y: fb.y + fb.h * 0.8 }, jawRight: { x: fb.x + fb.w * 0.15, y: fb.y + fb.h * 0.8 }, faceBox: fb };
}

/** hex 밝기 조절 (-1..1) */
export function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}
