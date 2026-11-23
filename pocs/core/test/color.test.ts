import { describe, expect, it } from 'vitest';
import {
  D50,
  D65,
  adaptXyz,
  applyGains,
  cctToXy,
  colorNameKo,
  deltaE2000,
  describeColor,
  grayWorldGains,
  hexToLab,
  hexToRgb,
  ita,
  itaCategory,
  labToHex,
  labToLch,
  nearestColorName,
  rgbToCct,
  rgbToHex,
  rgbToLab,
  robustMeanColor,
  xyToCctMcCamy,
  xyToXyz,
} from '../src/color';

describe('sRGB ↔ Lab', () => {
  it('white → L=100, a≈0, b≈0', () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(lab.l).toBeCloseTo(100, 1);
    expect(Math.abs(lab.a)).toBeLessThan(0.05);
    expect(Math.abs(lab.b)).toBeLessThan(0.05);
  });
  it('pure red matches reference (53.24, 80.09, 67.20)', () => {
    const lab = rgbToLab({ r: 255, g: 0, b: 0 });
    expect(lab.l).toBeCloseTo(53.24, 1);
    expect(lab.a).toBeCloseTo(80.09, 1);
    expect(lab.b).toBeCloseTo(67.2, 1);
  });
  it('mid gray #808080 → L≈53.59', () => {
    expect(rgbToLab(hexToRgb('#808080')).l).toBeCloseTo(53.59, 1);
  });
  it('round-trips hex → Lab → hex', () => {
    for (const hex of ['#91A6BE', '#A7A0B9', '#39455E', '#9B748A', '#E8C4A8', '#1D1B23']) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });
  it('hex parsing supports #RGB and lowercase', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex(hexToRgb('#a1b2c3'))).toBe('#A1B2C3');
    expect(() => hexToRgb('nope')).toThrow();
  });
  it('LCh hue of yellowish skin is in 40..80°', () => {
    const lch = labToLch(hexToLab('#E8C4A8'));
    expect(lch.h).toBeGreaterThan(40);
    expect(lch.h).toBeLessThan(80);
    expect(lch.c).toBeGreaterThan(10);
  });
});

describe('CIEDE2000 (Sharma 2005 test data)', () => {
  const cases: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  it.each(cases)('%j vs %j = %d', (a, b, expected) => {
    const d = deltaE2000({ l: a[0], a: a[1], b: a[2] }, { l: b[0], a: b[1], b: b[2] });
    expect(d).toBeCloseTo(expected, 3);
  });
  it('is symmetric and zero for identical colors', () => {
    const p = { l: 60, a: 10, b: 20 };
    const q = { l: 55, a: 12, b: 15 };
    expect(deltaE2000(p, p)).toBe(0);
    expect(deltaE2000(p, q)).toBeCloseTo(deltaE2000(q, p), 10);
  });
});

describe('ITA°', () => {
  it('computes arctan((L-50)/b)', () => {
    expect(ita({ l: 70, a: 5, b: 15 })).toBeCloseTo(53.13, 2);
  });
  it('categorizes by Del Bino thresholds', () => {
    expect(itaCategory(60)).toBe('very-light');
    expect(itaCategory(45)).toBe('light');
    expect(itaCategory(30)).toBe('intermediate');
    expect(itaCategory(15)).toBe('tan');
    expect(itaCategory(0)).toBe('brown');
    expect(itaCategory(-40)).toBe('dark');
  });
});

describe('CCT / 백색점 / 색순응', () => {
  it('McCamy: D65 xy → ~6504K', () => {
    expect(xyToCctMcCamy({ x: 0.3127, y: 0.329 })).toBeGreaterThan(6450);
    expect(xyToCctMcCamy({ x: 0.3127, y: 0.329 })).toBeLessThan(6560);
  });
  it('McCamy: illuminant A → ~2856K', () => {
    expect(Math.abs(xyToCctMcCamy({ x: 0.44757, y: 0.40745 }) - 2856)).toBeLessThan(20);
  });
  it('sRGB white → ~6500K', () => {
    expect(Math.abs(rgbToCct({ r: 255, g: 255, b: 255 }) - 6504)).toBeLessThan(60);
  });
  it('cctToXy(6504) ≈ D65 and round-trips through McCamy', () => {
    const xy = cctToXy(6504);
    expect(xy.x).toBeCloseTo(0.3127, 3);
    expect(xy.y).toBeCloseTo(0.329, 2);
    for (const t of [2700, 3200, 4000, 5000, 6500, 8000]) {
      expect(Math.abs(xyToCctMcCamy(cctToXy(t)) - t) / t).toBeLessThan(0.03);
    }
  });
  it('Bradford maps source white exactly onto destination white', () => {
    const w = adaptXyz(D65, D65, D50, 'bradford');
    expect(w.x).toBeCloseTo(D50.x, 4);
    expect(w.y).toBeCloseTo(D50.y, 4);
    expect(w.z).toBeCloseTo(D50.z, 4);
    const a = xyToXyz(cctToXy(2856), 1);
    const v = adaptXyz(a, a, D65, 'von-kries');
    expect(v.x).toBeCloseTo(D65.x, 4);
    expect(v.z).toBeCloseTo(D65.z, 4);
  });
});

describe('화이트밸런스', () => {
  it('gray-world removes a warm cast from a neutral scene', () => {
    // 따뜻한 캐스트가 낀 회색 장면
    const cast = { r: 150, g: 128, b: 100 };
    const px = new Uint8ClampedArray(4 * 100);
    for (let i = 0; i < 100; i++) px.set([cast.r, cast.g, cast.b, 255], i * 4);
    const gains = grayWorldGains(px);
    expect(gains.r).toBeLessThan(1);
    expect(gains.b).toBeGreaterThan(1);
    const fixed = applyGains(cast, gains);
    expect(Math.abs(fixed.r - fixed.g)).toBeLessThan(1.5);
    expect(Math.abs(fixed.b - fixed.g)).toBeLessThan(1.5);
  });
});

describe('robustMeanColor', () => {
  it('ignores highlight/shadow outliers', () => {
    const base = Array.from({ length: 90 }, () => ({ r: 200, g: 160, b: 140 }));
    const outliers = [...Array.from({ length: 5 }, () => ({ r: 255, g: 255, b: 255 })), ...Array.from({ length: 5 }, () => ({ r: 10, g: 5, b: 5 }))];
    const r = robustMeanColor([...base, ...outliers], 0.1, 0.1);
    expect(r.rgb.r).toBeCloseTo(200, 0);
    expect(r.rgb.g).toBeCloseTo(160, 0);
  });
});

describe('색 이름', () => {
  it('maps exact table colors to their Korean name', () => {
    expect(colorNameKo('#91A6BE')).toBe('더스티 블루');
    expect(nearestColorName('#1F2A44').entry.ko).toBe('네이비');
  });
  it('describeColor produces a full ColorValue with skin label', () => {
    const v = describeColor('#E3BBA6', 'skin');
    expect(v.hex).toBe('#E3BBA6');
    expect(v.nameKo).toContain('피부');
    expect(v.lch.c).toBeGreaterThan(0);
    expect(['very-light', 'light', 'intermediate']).toContain(v.itaCategory);
  });
});
