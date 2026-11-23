/**
 * 색차(ΔE76/ΔE2000), ITA°(Individual Typology Angle), 피부 분류.
 */
import type { Lab } from './convert';

/** CIE76 유클리드 색차 */
export function deltaE76(p: Lab, q: Lab): number {
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

/**
 * CIEDE2000 색차 (Sharma, Wu, Dalal 2005 구현 노트 기준, kL=kC=kH=1).
 * ΔE00 ≈ 1: 거의 구분 불가, 2~3: 가까이서 구분, 5+: 명확히 다른 색.
 */
export function deltaE2000(lab1: Lab, lab2: Lab, kL = 1, kC = 1, kH = 1): number {
  const rad = Math.PI / 180;
  const { l: L1, a: a1, b: b1 } = lab1;
  const { l: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  const tL = dLp / (kL * Sl);
  const tC = dCp / (kC * Sc);
  const tH = dHp / (kH * Sh);
  return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
}

/**
 * ITA° = arctan((L* − 50) / b*) × 180/π  (Chardon et al. 1991).
 * b*가 0 이하이면 정의상 의미가 약하므로 b*를 0.01로 하한 처리.
 */
export function ita(lab: Lab): number {
  const b = lab.b <= 0 ? 0.01 : lab.b;
  return (Math.atan((lab.l - 50) / b) * 180) / Math.PI;
}

export type ItaCategory = 'very-light' | 'light' | 'intermediate' | 'tan' | 'brown' | 'dark';

/** ITA 피부 분류 경계 (Del Bino et al. 2006) */
export function itaCategory(itaDeg: number): ItaCategory {
  if (itaDeg > 55) return 'very-light';
  if (itaDeg > 41) return 'light';
  if (itaDeg > 28) return 'intermediate';
  if (itaDeg > 10) return 'tan';
  if (itaDeg > -30) return 'brown';
  return 'dark';
}

export const ITA_CATEGORY_LABEL_KO: Record<ItaCategory, string> = {
  'very-light': '매우 밝음',
  light: '밝음',
  intermediate: '중간',
  tan: '황갈',
  brown: '갈색',
  dark: '어두움',
};
