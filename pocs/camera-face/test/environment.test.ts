import { describe, expect, it } from 'vitest';
import { analyzeEnvironmentPixels, classifyBrightness, classifyLightSource, measureWhiteReference, quickBrightness } from '../src/lib';
import { cast, illuminantGains, solid } from './helpers';

const W = 160;
const H = 120;
/** 무채색 계열 질감 장면 */
const neutralScene = (k = { r: 1, g: 1, b: 1 }, base = 130) => solid(W, H, (x, y) => cast({ r: base + ((x * 7 + y * 3) % 40) - 20, g: base + ((x * 7 + y * 3) % 40) - 20, b: base + ((x * 7 + y * 3) % 40) - 20 }, k));

describe('환경 분석', () => {
  it('중립 조명: 적정 밝기, 게인≈1, 주광 근처 색온도, 경고 없음', () => {
    const r = analyzeEnvironmentPixels(neutralScene());
    expect(r.environment.brightness.level).toBe('normal');
    expect(r.environment.grayWorldGains.r).toBeCloseTo(1, 2);
    expect(r.environment.grayWorldGains.b).toBeCloseTo(1, 2);
    expect(r.environment.cctK).toBeGreaterThan(6000);
    expect(r.environment.cctK).toBeLessThan(7000);
    expect(r.environment.retakeRecommended).toBe(false);
    expect(r.environment.warnings.filter((w) => w.severity !== 'info')).toHaveLength(0);
    expect(Math.abs(r.metrics.tint)).toBeLessThan(0.004);
  });

  it('전구색 캐스트: 색온도 낮음 → 전구색/온백색 + 경고, 형광등 아님', () => {
    const r = analyzeEnvironmentPixels(neutralScene(illuminantGains(3000)));
    expect(r.environment.cctK).toBeLessThan(4000);
    expect(['incandescent', 'warm-led']).toContain(r.environment.lightSource);
    expect(r.environment.warnings.map((w) => w.code)).toContain('warm-light');
    expect(r.environment.grayWorldGains.b).toBeGreaterThan(1.3);
    expect(r.environment.lightSource).not.toBe('fluorescent');
  });

  it('녹색 편향(형광등): Duv 양수 → 형광등', () => {
    const r = analyzeEnvironmentPixels(neutralScene({ r: 0.85, g: 1.05, b: 0.9 }));
    expect(r.metrics.tint).toBeGreaterThan(0.006);
    expect(r.environment.lightSource).toBe('fluorescent');
    expect(r.environment.setting).not.toBe('outdoor');
  });

  it('어두운 장면: 너무 어두움 → 재촬영 권장', () => {
    const r = analyzeEnvironmentPixels(neutralScene(undefined, 25));
    expect(r.environment.brightness.level).toBe('too-dark');
    expect(r.environment.retakeRecommended).toBe(true);
    expect(r.environment.lightingQuality).toBeLessThan(0.6);
  });

  it('역광: 가장자리 매우 밝고 중앙 어두움', () => {
    const img = solid(W, H, (x, y) => (x > W * 0.3 && x < W * 0.7 && y > H * 0.25 ? { r: 50, g: 45, b: 42 } : { r: 252, g: 252, b: 250 }));
    const r = analyzeEnvironmentPixels(img);
    expect(r.environment.warnings.map((w) => w.code)).toContain('backlight');
    expect(r.environment.retakeRecommended).toBe(true);
  });

  it('얼굴 사진 기반 역광: 피사체가 배경보다 훨씬 어두움', () => {
    const r = analyzeEnvironmentPixels(neutralScene(undefined, 200), { subjectLuma: 80 });
    expect(r.environment.warnings.map((w) => w.code)).toContain('backlight');
  });

  it('혼합광: 왼쪽 전구색 + 오른쪽 주광', () => {
    const img = solid(W, H, (x, y) => {
      const v = 140 + ((x * 5 + y * 3) % 30) - 15;
      return cast({ r: v, g: v, b: v }, x < W / 2 ? illuminantGains(2900) : illuminantGains(6500));
    });
    const r = analyzeEnvironmentPixels(img);
    expect(r.environment.lightSource).toBe('mixed');
    expect(r.environment.warnings.map((w) => w.code)).toContain('mixed-light');
    expect(r.metrics.mixedMiredStd).toBeGreaterThan(35);
  });

  it('실외: 상단 파란 하늘 + 하단 식물', () => {
    const img = solid(W, H, (x, y) => (y < H / 3 ? { r: 110, g: 160, b: 225 } : y < (2 * H) / 3 ? { r: 70, g: 140 + (x % 10), b: 60 } : { r: 150, g: 145, b: 140 }));
    const r = analyzeEnvironmentPixels(img);
    expect(r.metrics.skyFraction).toBeGreaterThan(0.8);
    expect(r.environment.setting).toBe('outdoor');
    expect(r.environment.settingLabel).toBe('실외');
  });

  it('제외 영역/마스크: 얼굴 영역을 빼고 배경만 사용', () => {
    const img = solid(W, H, (x, y) => (x > 40 && x < 120 && y > 20 && y < 100 ? { r: 230, g: 160, b: 120 } : { r: 128, g: 128, b: 128 }));
    const all = analyzeEnvironmentPixels(img);
    const ex = analyzeEnvironmentPixels(img, { exclude: { x: 0.2, y: 0.12, w: 0.6, h: 0.75 } });
    expect(Math.abs(ex.environment.grayWorldGains.b - 1)).toBeLessThan(Math.abs(all.environment.grayWorldGains.b - 1));
    const mask = { width: W / 4, height: H / 4, data: new Uint8Array((W / 4) * (H / 4)).map((_, i) => { const x = (i % (W / 4)) * 4; const y = Math.floor(i / (W / 4)) * 4; return x > 36 && x < 124 && y > 16 && y < 104 ? 3 : 0; }) };
    const m = analyzeEnvironmentPixels(img, { mask });
    expect(m.environment.grayWorldGains.b).toBeCloseTo(1, 1);
  });

  it('기준 백색: 흰 종이 지점 → 게인/색온도, 유색 지점은 거부', () => {
    const k = { r: 1.2, g: 1, b: 0.7 };
    const img = solid(W, H, (x, y) => (Math.hypot(x - 40, y - 60) < 12 ? cast({ r: 215, g: 215, b: 215 }, k) : Math.hypot(x - 120, y - 60) < 12 ? { r: 200, g: 60, b: 60 } : cast({ r: 120, g: 120, b: 120 }, k)));
    const ok = measureWhiteReference(img, { x: 40 / W, y: 60 / H });
    expect(ok.ok).toBe(true);
    expect(ok.gains!.r).toBeCloseTo(1 / 1.2, 1);
    expect(ok.gains!.b).toBeCloseTo(1 / 0.7, 1);
    expect(ok.cctK!).toBeLessThan(5000);
    const bad = measureWhiteReference(img, { x: 120 / W, y: 60 / H });
    expect(bad.ok).toBe(false);
    const r = analyzeEnvironmentPixels(img, { whitePoint: { x: 40 / W, y: 60 / H } });
    expect(r.environment.referenceWhite).toBeDefined();
    expect(r.environment.cctConfidence).toBe(0.9);
  });

  it('결정적 + 분류 헬퍼', () => {
    const a = analyzeEnvironmentPixels(neutralScene({ r: 1.1, g: 1, b: 0.9 }));
    const b = analyzeEnvironmentPixels(neutralScene({ r: 1.1, g: 1, b: 0.9 }));
    expect(a).toEqual(b);
    expect(classifyBrightness(30, 0)).toBe('too-dark');
    expect(classifyBrightness(120, 0.4)).toBe('too-bright');
    // 밝은 회색 배경(중앙값 236, 포화 0.1%)은 재촬영 대상이 아니다
    expect(classifyBrightness(236, 0.001)).toBe('bright');
    expect(classifyBrightness(236, 0.08)).toBe('too-bright');
    expect(classifyLightSource({ cctK: 2800, tint: 0, setting: 'indoor', mixed: false, meanLuma: 120 })).toBe('incandescent');
    expect(classifyLightSource({ cctK: 6000, tint: 0, setting: 'outdoor', mixed: false, meanLuma: 160 })).toBe('daylight');
    expect(classifyLightSource({ cctK: 7500, tint: 0, setting: 'outdoor', mixed: false, meanLuma: 100 })).toBe('shade');
    expect(quickBrightness(neutralScene()).level).toBe('normal');
  });
});
