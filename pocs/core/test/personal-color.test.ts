import { describe, expect, it } from 'vitest';
import { HexSchema, ToneSchema } from '../src/contracts';
import { hexToLab } from '../src/color';
import {
  TONES,
  TONE_PROFILES,
  axisLevelLabel,
  classifyPersonalColor,
  computeAxes,
  computeReportConfidence,
  isColorInTone,
  nearestInPalette,
  reportVariantLabels,
} from '../src/personal-color';

const lab = (l: number, a: number, b: number) => ({ l, a, b });

describe('classifyPersonalColor — 계절 판정 대표 케이스', () => {
  it('밝고 노란 피부 + 밝은 갈색 헤어 → 봄', () => {
    const r = classifyPersonalColor({ skin: lab(80, 8, 23), hair: lab(42, 8, 20), eyes: lab(38, 6, 14) });
    expect(r.season).toBe('spring');
    expect(r.undertone).toBe('warm');
    expect(r.warmPercent).toBeGreaterThan(50);
  });
  it('밝고 핑크 기 피부 + 낮은 채도 → 여름', () => {
    const r = classifyPersonalColor({ skin: lab(76, 11, 11), hair: lab(30, 3, 4), eyes: lab(30, 3, 5) });
    expect(r.season).toBe('summer');
    expect(r.undertone).toBe('cool');
    expect(r.coolPercent).toBeGreaterThan(50);
  });
  it('어둡고 노란 피부 + 짙은 헤어 → 가을', () => {
    const r = classifyPersonalColor({ skin: lab(58, 12, 24), hair: lab(20, 4, 8), eyes: lab(25, 5, 9) });
    expect(r.season).toBe('autumn');
  });
  it('핑크 기 피부 + 매우 어두운 헤어(고대비) + 선명함 → 겨울', () => {
    const r = classifyPersonalColor({ skin: lab(68, 13, 12), hair: lab(9, 1, 0), eyes: lab(12, 1, 1) });
    expect(r.season).toBe('winter');
  });
});

describe('classifyPersonalColor — 성질', () => {
  it('결정적: 같은 입력 → 같은 출력', () => {
    const input = { skin: lab(72, 10, 16), hair: lab(25, 3, 6) };
    expect(classifyPersonalColor(input)).toEqual(classifyPersonalColor(input));
  });
  it('톤 점수 합 ≈ 1, warm+cool = 100, 1위≠2위', () => {
    const r = classifyPersonalColor({ skin: lab(70, 10, 18) });
    const sum = Object.values(r.toneScores).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(r.warmPercent + r.coolPercent).toBe(100);
    expect(r.tone).not.toBe(r.secondaryTone);
    expect(ToneSchema.safeParse(r.tone).success).toBe(true);
  });
  it('b*가 커질수록 웜 가능성이 단조 증가', () => {
    let prev = -1;
    for (const b of [6, 10, 14, 18, 22, 26]) {
      const w = classifyPersonalColor({ skin: lab(72, 10, b) }).warmPercent;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
  it('헤어/눈 없으면 대비 기본값 + 근거에 명시', () => {
    const r = classifyPersonalColor({ skin: lab(72, 10, 16) });
    expect(r.inputs.contrastEstimated).toBe(true);
    expect(r.axes.contrast).toBe(50);
    expect(r.evidence.join(' ')).toContain('가정');
  });
  it('경계 케이스: 축 값이 0..100 범위를 벗어나지 않음 (극단 입력)', () => {
    for (const s of [lab(100, 0, 0), lab(20, 30, 40), lab(90, -5, -5), lab(50, 40, 2)]) {
      const r = classifyPersonalColor({ skin: s, hair: lab(5, 0, 0) });
      for (const v of Object.values(r.axes)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('뉴트럴 경계: warmth 0.42~0.58 → neutral', () => {
    // hue/b*를 중간값으로 맞춘 입력
    const a = computeAxes({ skin: lab(72, 12, 15.5) }).axes01.warmth;
    const r = classifyPersonalColor({ skin: lab(72, 12, 15.5) });
    if (a > 0.42 && a < 0.58) expect(r.undertone).toBe('neutral');
  });
  it('axisLevelLabel 구간', () => {
    expect(axisLevelLabel('chroma', 5)).toBe('낮음(뮤트)');
    expect(axisLevelLabel('chroma', 100)).toBe('높음(비비드)');
  });
});

describe('12톤 팔레트 데이터 무결성', () => {
  it('모든 톤에 프로필이 있고 색은 유효한 hex', () => {
    expect(Object.keys(TONE_PROFILES).sort()).toEqual([...TONES].sort());
    for (const t of TONES) {
      const p = TONE_PROFILES[t];
      expect(p.drapeBest).toHaveLength(4);
      expect(p.drapeWorst).toHaveLength(4);
      expect(p.tops.length).toBeGreaterThanOrEqual(5);
      expect(p.outer.length).toBeGreaterThanOrEqual(5);
      expect(p.hair).toHaveLength(4);
      expect(p.avoidStyles).toHaveLength(4);
      expect(p.firstImpression.length).toBeGreaterThanOrEqual(3);
      const all = [...p.best, ...p.worst, ...p.drapeBest, ...p.drapeWorst, ...p.tops, ...p.outer, ...p.point, ...p.hair.map((h) => h.color), ...p.hairAvoid];
      for (const c of all) {
        expect(HexSchema.safeParse(c.hex).success, `${t} ${c.name} ${c.hex}`).toBe(true);
        expect(c.name.length).toBeGreaterThan(0);
      }
    }
  });
  it('드레이핑 베스트 색은 자기 톤 팔레트에 속하고 워스트는 아님', () => {
    for (const t of TONES) {
      for (const c of TONE_PROFILES[t].drapeWorst) expect(isColorInTone(c.hex, t, 3), `${t} worst ${c.name}`).toBe(false);
    }
  });
  it('nearestInPalette가 동일 색에 ΔE 0', () => {
    const p = TONE_PROFILES['summer-mute'].best;
    expect(nearestInPalette(p[0].hex, p).deltaE).toBe(0);
    expect(hexToLab(p[0].hex).l).toBeGreaterThan(0);
  });
});

describe('리포트 보조', () => {
  it('성별 변형 라벨', () => {
    expect(reportVariantLabels('male').tops).toBe('추천 셔츠 색상');
    expect(reportVariantLabels('female').accessories).toContain('스카프');
  });
  it('신뢰도는 입력 품질에 따라 달라진다 (고정값 아님)', () => {
    const good = computeReportConfidence({
      lightingQuality: 0.95,
      whiteBalanceDeltaE: 1,
      faceDetectionScore: 0.95,
      skinSpreadDeltaE: 1.5,
      classifierMargin: 0.4,
      ruleAiAgreement: true,
      hasHair: true,
      hasEyes: true,
    });
    const bad = computeReportConfidence({
      lightingQuality: 0.3,
      whiteBalanceDeltaE: 10,
      faceDetectionScore: 0.5,
      skinSpreadDeltaE: 8,
      classifierMargin: 0.02,
      ruleAiAgreement: false,
      hasHair: false,
      hasEyes: false,
    });
    expect(good.score).toBeGreaterThan(85);
    expect(good.grade).toBe('high');
    expect(bad.score).toBeLessThan(40);
    expect(bad.grade).toBe('low');
    const wsum = good.factors.reduce((s, f) => s + f.weight, 0);
    expect(wsum).toBeCloseTo(1, 2);
  });
});

describe('classifier options (앱 단 보정)', () => {
  it('기본 옵션은 인자 없는 호출과 같다', () => {
    const input = { skin: { l: 72, a: 11, b: 16 }, hair: { l: 20, a: 2, b: 3 } };
    expect(classifyPersonalColor(input, {})).toEqual(classifyPersonalColor(input));
  });
  it('calibration/prototypes 덮어쓰기가 결과에 반영된다', () => {
    const input = { skin: { l: 72, a: 11, b: 16 }, hair: { l: 20, a: 2, b: 3 } };
    const base = classifyPersonalColor(input);
    const shifted = classifyPersonalColor(input, { calibration: { skinB: { min: 0, max: 12 } } });
    expect(shifted.axes.warmth).toBeGreaterThan(base.axes.warmth);
    const forced = classifyPersonalColor(input, { prototypes: { 'summer-light': [base.axes.warmth / 100, base.axes.value / 100, base.axes.chroma / 100, base.axes.contrast / 100, base.axes.clarity / 100] } });
    expect(forced.tone).toBe('summer-light');
  });
});

describe('웜/쿨 축 색상각 회귀 (b*=0 경계, 저채도)', () => {
  it('b*가 0 아래로 내려가도 웜으로 뒤집히지 않는다', () => {
    const at = (b: number) => classifyPersonalColor({ skin: { l: 65, a: 12, b } });
    const above = at(0.5);
    const below = at(-0.5);
    const further = at(-2);
    expect(above.undertone).toBe('cool');
    expect(below.undertone).toBe('cool');
    expect(further.undertone).toBe('cool');
    expect(below.warmPercent).toBeLessThanOrEqual(above.warmPercent);
    expect(below.axes.warmth).toBeLessThanOrEqual(above.axes.warmth + 1);
    expect(Math.abs(below.axes.warmth - above.axes.warmth)).toBeLessThan(5);
  });
  it('거의 회색(C*<6)이면 색상각이 웜 판정을 좌우하지 않는다', () => {
    // 흰·베이지 배경 같은 저채도 색: h≈90°지만 b* 4.4
    const r = classifyPersonalColor({ skin: { l: 90.8, a: 0, b: 4.4 } });
    expect(r.undertone).not.toBe('warm');
    expect(r.axes.warmth).toBeLessThan(42);
  });
  it('일반 피부 채도(C*≥12)에서는 기존 판정과 같다', () => {
    const warm = classifyPersonalColor({ skin: { l: 66, a: 13, b: 24 } });
    expect(warm.undertone).toBe('warm');
  });
  it('헤어 색상각도 360° 근처에서 웜으로 튀지 않는다', () => {
    const skin = { l: 68, a: 13, b: 14 };
    const plus = classifyPersonalColor({ skin, hair: { l: 25, a: 8, b: 0.5 } });
    const minus = classifyPersonalColor({ skin, hair: { l: 25, a: 8, b: -0.5 } });
    expect(Math.abs(plus.axes.warmth - minus.axes.warmth)).toBeLessThan(5);
  });
});

describe('신뢰도: 화이트밸런스 방법과 피부 측정 품질', () => {
  const base = {
    lightingQuality: 0.8,
    whiteBalanceDeltaE: 0,
    faceDetectionScore: 0.9,
    skinSpreadDeltaE: 3,
    classifierMargin: 0.3,
    ruleAiAgreement: null,
    hasHair: true,
    hasEyes: true,
  } as const;
  it("보정 없음('none', ΔE 0)은 최고 화이트밸런스 점수가 아니다", () => {
    const none = computeReportConfidence({ ...base, whiteBalanceMethod: 'none' });
    const gw = computeReportConfidence({ ...base, whiteBalanceMethod: 'gray-world' });
    expect(none.factors.find((f) => f.key === 'white-balance')!.score).toBeLessThan(0.5);
    expect(none.score).toBeLessThan(gw.score);
  });
  it('피부 측정 신뢰도가 낮으면 전체 점수가 내려간다', () => {
    const hi = computeReportConfidence({ ...base, skinConfidence: 0.9 });
    const lo = computeReportConfidence({ ...base, skinConfidence: 0.3 });
    expect(lo.score).toBeLessThan(hi.score);
    expect(lo.factors.some((f) => f.key === 'skin-measurement')).toBe(true);
  });
});
