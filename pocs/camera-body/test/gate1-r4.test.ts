/**
 * Gate 1 독립 재검증(cb-recheck-r1) 이슈 회귀 테스트.
 * g-* 픽스처는 검증자가 만든 합성 전신 사진(앉은 자세 2, 모자·올림머리 7, 모자 없음 1)을, rot*-b·rotm*-b는 look-b를 돌린 사본을
 * 수정 전 파이프라인으로 브라우저에서 잰 값이다(측정 입력은 분석 규칙과 무관하다).
 */
import { describe, expect, it } from 'vitest';
import {
  bodyIssues,
  buildInsights,
  buildStylingGuide,
  cameraTiltDeg,
  computeBodyAnalysis,
  formatRatio,
  isCameraTilt,
  rangeVerdict,
  ratioOutOfBounds,
  ratioReference,
  POSE,
  type BodyMeasureInput,
} from '../src/lib';
import { assertPlausibleRatios } from '../src/server';
import { loadFixture } from './fixture';

const codes = (a: { failureReasons: { code: string }[] }) => a.failureReasons.map((r) => r.code);
const STANDING = ['look-a', 'look-a-pad', 'look-b', 'look-b-png', 'look-b-webp', 'look-b-pad', 'look-b-2', 'big13-b', 'gray-b', 'desat-b', 'two-b', 'g-nohat', 'g-cap', 'g-beanie', 'g-beanie2', 'g-pompom2', 'g-bun', 'g-fedora', 'g-bucket'];

describe('앉은 정면 사진 (major)', () => {
  it('허벅지가 짧아진 앉은 사진은 무릎 각도가 펴져 보여도 not-standing으로 실패', () => {
    for (const n of ['g-sit', 'g-sit2', 'g-sit-rot10']) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('failed');
      expect(codes(a), n).toContain('not-standing');
      expect(a.ratios, n).toBeUndefined();
      expect(bodyIssues(a).map((i) => i.message).join(' '), n).toContain('선 자세로');
    }
  });

  it('선 사진은 그대로 완료', () => {
    for (const n of STANDING) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('complete');
      expect(codes(a), n).not.toContain('not-standing');
      expect(a.ratios!.thighToShin!, n).toBeGreaterThan(0.9);
    }
  });

  it('완료 결과는 서버 비율 범위를 넘지 않는다 (이 결과 사용 → 400 방지)', () => {
    for (const n of STANDING) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(ratioOutOfBounds(a.ratios), n).toBeNull();
      expect(() => assertPlausibleRatios(a), n).not.toThrow();
    }
  });

  it('서버가 거부할 비율이 나오면 측정 단계에서 실패로 돌린다', () => {
    // 고관절 점을 거의 겹치게 해 어깨/골반 폭 비가 3을 넘게 만든다(마스크 없음 → 관절점 폭)
    const input = loadFixture('look-b');
    const L = input.landmarks.map((l) => ({ ...l }));
    const cx = (L[POSE.leftHip].x + L[POSE.rightHip].x) / 2;
    const y = (L[POSE.leftHip].y + L[POSE.rightHip].y) / 2;
    L[POSE.leftHip] = { ...L[POSE.leftHip], x: cx + 0.004, y };
    L[POSE.rightHip] = { ...L[POSE.rightHip], x: cx - 0.004, y };
    const a = computeBodyAnalysis({ ...input, mask: null, landmarks: L } as BodyMeasureInput);
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('implausible-ratio');
    expect(a.ratios).toBeUndefined();
    expect(ratioOutOfBounds({ shoulderToHip: 3.5 })).toBe('shoulderToHip');
    expect(ratioOutOfBounds({ thighToShin: 0.17 })).toBe('thighToShin');
    expect(ratioOutOfBounds({ headsTall: 7.5, thighToShin: 1 })).toBeNull();
  });
});

describe('높은 모자·올림머리 정수리 (major)', () => {
  it('폼폼 비니 2장·올림머리: 정수리가 폼폼·상투 속으로 올라가지 않는다 (6.9등신 이상, 경고 유지)', () => {
    for (const n of ['g-pompom2', 'g-beanie', 'g-bun']) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('complete');
      expect(a.ratios!.headsTall, n).toBeGreaterThan(6.9);
      expect(a.ratios!.headsTall, n).toBeLessThan(7.6);
      expect(codes(a), n).toContain('head-top-uncertain');
      // 표시 값 기준 '범위보다 낮음'이 아니다
      const ins = a.insights.find((i) => i.key === 'headsTall')!;
      expect(rangeVerdict('headsTall', ins.value, ins.reference!), n).toBe('in');
    }
  });

  it('선바이저(look-b 계열)는 라운드 3 이전 8.5로 돌아가지 않고, 모자 없는 사진은 그대로', () => {
    for (const n of ['look-b', 'look-b-png', 'look-b-webp', 'look-b-pad', 'look-b-2', 'big13-b']) {
      const ht = computeBodyAnalysis(loadFixture(n)).ratios!.headsTall;
      expect(ht, n).toBeGreaterThan(7.5);
      expect(ht, n).toBeLessThan(8);
    }
    const nohat = computeBodyAnalysis(loadFixture('g-nohat'));
    expect(nohat.ratios!.headsTall).toBeCloseTo(7.72, 1);
    expect(codes(nohat)).not.toContain('head-top-uncertain');
  });
});

describe('회전 판정 대칭 (minor)', () => {
  it('±12°·±16° 돌린 사진은 방향과 상관없이 camera-tilted로 실패', () => {
    for (const n of ['rot12-b', 'rotm12-b', 'rot16-b', 'rotm16-b', 'g-nohat-rotm16']) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('failed');
      expect(codes(a), n).toContain('camera-tilted');
    }
  });

  it('±5°·8° 사진은 어깨·골반 자세 안내 대신 카메라 기울기 경고', () => {
    for (const n of ['rot5-b', 'rotm5-b', 'rot8-b']) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('complete');
      expect(codes(a), n).toContain('camera-tilt');
      const text = bodyIssues(a).map((i) => i.message).join(' ');
      expect(text, n).not.toContain('어깨 높이를 맞춰');
      expect(text, n).not.toContain('곧게 서 주세요');
    }
  });

  it('공통 기울기는 돌린 방향에 따라 크게 달라지지 않는다', () => {
    const deg = (n: string) => {
      const p = computeBodyAnalysis(loadFixture(n)).posture!;
      return Math.abs(cameraTiltDeg(p.shoulderTiltDeg, p.hipTiltDeg, p.leanDeg));
    };
    expect(Math.abs(deg('rot12-b') - deg('rotm12-b'))).toBeLessThan(2);
    expect(Math.abs(deg('rot16-b') - deg('rotm16-b'))).toBeLessThan(3);
    expect(isCameraTilt(8.2, 8, 2.8)).toBe(true);
    expect(isCameraTilt(1, 0.5, 7)).toBe(false);
  });
});

describe('팔/키 참조 범위·표시 반올림 (minor)', () => {
  it('팔을 내린 선 사진의 팔/키(28~32%)는 범위 안', () => {
    for (const n of STANDING) {
      const a = computeBodyAnalysis(loadFixture(n));
      const arm = a.insights.find((i) => i.key === 'armToHeight');
      if (!arm) continue;
      expect(rangeVerdict('armToHeight', arm.value, arm.reference!), `${n} ${arm.value}`).toBe('in');
      expect(arm.comment, n).not.toContain('짧게');
    }
    expect(ratioReference('armToHeight')!.label).toBe('키의 28~34%');
  });

  it('0.945는 "0.95"로 보이고 0.95~1.15 범위 안으로 판정한다', () => {
    expect(formatRatio('thighToShin', 0.945)).toBe('0.95');
    expect(rangeVerdict('thighToShin', 0.945, { min: 0.95, max: 1.15 })).toBe('in');
    expect(formatRatio('headsTall', 6.95)).toBe('7.0등신');
    const ins = buildInsights({ headsTall: 7.4, headToHeight: 0.135, upperToLower: 0.95, legToHeight: 0.51, shoulderToHip: 1.1, shoulderToHeight: 0.25, thighToShin: 0.945 }, 'silhouette');
    expect(ins.find((i) => i.key === 'thighToShin')!.display).toBe('0.95');
  });

  it('6.95등신은 7.0으로 보이므로 7 미만용 코디 제안을 붙이지 않는다', () => {
    const titles = (h: number) => buildStylingGuide({ headsTall: h }, undefined).suggestions.map((s) => s.title);
    expect(titles(6.95)).not.toContain('세로선 연결');
    expect(titles(6.9)).toContain('세로선 연결');
  });
});
