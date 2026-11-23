/**
 * ColorValue 생성기: hex/Rgb/Lab → 계약의 ColorValue (hex, rgb, lab, lch, ITA, 이름).
 */
import type { ColorValue } from '../contracts/common';
import { type Lab, type Rgb, hexToRgb, labToLch, labToRgb, rgbToHex, rgbToLab, roundLab, roundRgb } from './convert';
import { ita, itaCategory } from './metrics';
import { colorNameKo, skinNameKo } from './names';

export type ColorInput = string | Rgb | { lab: Lab };

function toRgb(input: ColorInput): Rgb {
  if (typeof input === 'string') return hexToRgb(input);
  if ('lab' in input) return labToRgb(input.lab);
  return input;
}

/**
 * 색 하나를 완전히 기술한다. kind='skin'이면 피부 라벨 이름을 쓴다.
 * Lab은 반올림 전 실제 RGB에서 계산한다(측정 정확도 유지).
 */
export function describeColor(input: ColorInput, kind: 'skin' | 'general' = 'general'): ColorValue {
  const rgb = toRgb(input);
  const lab = typeof input !== 'string' && 'lab' in input ? input.lab : rgbToLab(rgb);
  const lch = labToLch(lab);
  const itaDeg = ita(lab);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    hex: rgbToHex(rgb),
    rgb: roundRgb(rgb),
    lab: roundLab(lab, 1),
    lch: { l: r1(lch.l), c: r1(lch.c), h: r1(lch.h) },
    ita: r1(itaDeg),
    itaCategory: itaCategory(itaDeg),
    nameKo: kind === 'skin' ? skinNameKo(lab) : colorNameKo(lab),
  };
}
