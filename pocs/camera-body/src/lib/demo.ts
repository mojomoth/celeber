/**
 * 데모(Mock) 전신: 같은 좌표로 그린 SVG 일러스트 + 33점 랜드마크 + 사람 마스크.
 * 카메라/사진 없이도 측정 → 저장 → 시각화 전체 경로를 확인할 수 있다. 결과는 isMock=true.
 * 실제 인물이 아닌 도식 그림이다.
 */
import type { Landmark3 } from '@celeber/core/contracts';
import type { FaceHeadPoints } from './analyze';
import type { PersonMask } from './silhouette';

export const DEMO_W = 600;
export const DEMO_H = 900;

type Pt = [number, number];

/** 사람 기준 left/right (정면 사진이므로 인물의 왼쪽 = 화면 오른쪽) */
const LM: Record<number, Pt> = {
  0: [300, 132],
  1: [310, 113],
  2: [318, 113],
  3: [326, 113],
  4: [290, 113],
  5: [282, 113],
  6: [274, 113],
  7: [342, 118],
  8: [258, 118],
  9: [312, 149],
  10: [288, 149],
  11: [375, 200],
  12: [225, 200],
  13: [397, 345],
  14: [203, 345],
  15: [408, 470],
  16: [192, 470],
  17: [414, 492],
  18: [186, 492],
  19: [410, 496],
  20: [190, 496],
  21: [402, 488],
  22: [198, 488],
  23: [353, 434],
  24: [247, 434],
  25: [332, 625],
  26: [268, 625],
  27: [328, 805],
  28: [272, 805],
  29: [330, 832],
  30: [270, 832],
  31: [340, 840],
  32: [260, 840],
};

export function demoLandmarks(): Landmark3[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: LM[i][0] / DEMO_W, y: LM[i][1] / DEMO_H, z: 0, visibility: 0.99 }));
}

/** FaceLandmarker 10/152에 해당하는 점 (정수리 60, 턱 167 → 머리 길이 107px) */
export function demoFace(): FaceHeadPoints {
  return { foreheadTop: { x: 300 / DEMO_W, y: 81.4 / DEMO_H }, chin: { x: 300 / DEMO_W, y: 167 / DEMO_H } };
}

const mirror = (poly: Pt[]): Pt[] => poly.map(([x, y]) => [DEMO_W - x, y]);

const TORSO: Pt[] = [
  [262, 186],
  [338, 186],
  [392, 206],
  [396, 236],
  [374, 300],
  [370, 360],
  [384, 430],
  [386, 480],
  [214, 480],
  [216, 430],
  [230, 360],
  [226, 300],
  [204, 236],
  [208, 206],
];
const ARM_R: Pt[] = [
  [206, 210],
  [228, 240],
  [220, 345],
  [204, 474],
  [180, 470],
  [186, 345],
  [190, 240],
];
const LEG_R: Pt[] = [
  [214, 470],
  [302, 470],
  [296, 560],
  [286, 625],
  [284, 700],
  [284, 805],
  [262, 805],
  [254, 700],
  [250, 625],
  [232, 540],
];
const FOOT_R: Pt[] = [
  [262, 800],
  [288, 800],
  [288, 836],
  [272, 841],
  [250, 841],
  [252, 828],
];
const NECK: Pt[] = [
  [284, 158],
  [316, 158],
  [318, 196],
  [282, 196],
];
const HEAD = { cx: 300, cy: 113.5, rx: 43, ry: 53.5 };
const HAIR: Pt[] = [
  [254, 112],
  [258, 74],
  [282, 56],
  [318, 56],
  [342, 74],
  [346, 112],
  [336, 92],
  [300, 80],
  [264, 92],
];

const POLYS = {
  torso: TORSO,
  armR: ARM_R,
  armL: mirror(ARM_R),
  legR: LEG_R,
  legL: mirror(LEG_R),
  footR: FOOT_R,
  footL: mirror(FOOT_R),
  neck: NECK,
  hair: HAIR,
};

const ptsAttr = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

export interface DemoPalette {
  bg: string;
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
}

export const DEMO_PALETTE: DemoPalette = { bg: '#EDEAE4', skin: '#E3BBA6', hair: '#2B2426', top: '#39455E', bottom: '#4A4650', shoes: '#1E1C20' };

/** 랜드마크와 같은 좌표계의 도식 SVG (600×900) */
export function demoFigureSvg(p: DemoPalette = DEMO_PALETTE): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DEMO_W} ${DEMO_H}" width="${DEMO_W}" height="${DEMO_H}">
<rect width="${DEMO_W}" height="${DEMO_H}" fill="${p.bg}"/>
<ellipse cx="300" cy="846" rx="110" ry="10" fill="#000" opacity="0.07"/>
<polygon points="${ptsAttr(POLYS.armR)}" fill="${p.skin}"/>
<polygon points="${ptsAttr(POLYS.armL)}" fill="${p.skin}"/>
<polygon points="${ptsAttr(POLYS.neck)}" fill="${p.skin}"/>
<polygon points="${ptsAttr(POLYS.legR)}" fill="${p.bottom}"/>
<polygon points="${ptsAttr(POLYS.legL)}" fill="${p.bottom}"/>
<polygon points="${ptsAttr(POLYS.footR)}" fill="${p.shoes}"/>
<polygon points="${ptsAttr(POLYS.footL)}" fill="${p.shoes}"/>
<polygon points="${ptsAttr(POLYS.torso)}" fill="${p.top}"/>
<path d="M206 210 L228 240 L222 330 L190 330 L190 240 Z M394 210 L372 240 L378 330 L410 330 L410 240 Z" fill="${p.top}"/>
<ellipse cx="${HEAD.cx}" cy="${HEAD.cy}" rx="${HEAD.rx}" ry="${HEAD.ry}" fill="${p.skin}"/>
<polygon points="${ptsAttr(POLYS.hair)}" fill="${p.hair}"/>
<text x="300" y="884" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#625C6A">데모 도식 · 실제 인물 아님</text>
</svg>`;
}

function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 도식 그림과 같은 사람 마스크 (scale=0.5면 300×450) */
export function demoMask(scale = 0.5): PersonMask {
  const w = Math.round(DEMO_W * scale);
  const h = Math.round(DEMO_H * scale);
  const data = new Uint8Array(w * h);
  const polys = Object.values(POLYS);
  for (let yy = 0; yy < h; yy++) {
    const y = (yy + 0.5) / scale;
    for (let xx = 0; xx < w; xx++) {
      const x = (xx + 0.5) / scale;
      const inHead = ((x - HEAD.cx) / HEAD.rx) ** 2 + ((y - HEAD.cy) / HEAD.ry) ** 2 <= 1;
      if (inHead || polys.some((p) => inPoly(x, y, p))) data[yy * w + xx] = 255;
    }
  }
  return { data, width: w, height: h, threshold: 128 };
}
