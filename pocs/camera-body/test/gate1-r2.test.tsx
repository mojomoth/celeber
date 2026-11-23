/**
 * Gate 1 독립 검증 라운드 2 이슈 회귀 테스트. 실측 픽스처 설명은 fixture.ts.
 */
import type { BodyAnalysis, Landmark3 } from '@celeber/core/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { labelWidth, placeWidthLabelY, type Box } from '../src/components/BodyOverlay';
import { BodyResultView } from '../src/components/BodyResultView';
import { bodyIssues, computeBodyAnalysis, demoLandmarks, detectSideCropped, POSTURE_ISSUE_CODES } from '../src/lib';
import { loadFixture } from './fixture';

const codes = (a: { failureReasons: { code: string }[] }) => a.failureReasons.map((r) => r.code);
const postureCodes = new Set<string>(POSTURE_ISSUE_CODES);

describe('정수리 잘림 (major)', () => {
  it('look-b 위 60px·look-a 위 70px 제거: 등신을 내지 않고 head-cropped로 실패', () => {
    for (const name of ['topcut-b', 'topcut-a']) {
      const a = computeBodyAnalysis(loadFixture(name));
      expect(a.status, name).toBe('failed');
      expect(codes(a), name).toContain('head-cropped');
      expect(a.ratios, name).toBeUndefined();
      expect(a.frame, name).toBeUndefined();
    }
  });
  it('바이저 위 머리카락이 잘린 사진(위 30px 제거)은 라운드 3부터 head-cropped (gate1-r3.test.tsx)', () => {
    const a = computeBodyAnalysis(loadFixture('topcut30-b'));
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('head-cropped');
  });
  it('머리 위 여백이 있는 원본에는 경고가 없다', () => {
    for (const name of ['look-b', 'look-a', 'look-b-pad', 'look-a-pad']) expect(codes(computeBodyAnalysis(loadFixture(name))), name).not.toContain('head-near-edge');
  });
});

describe('몸 옆 잘림 (major)', () => {
  it('look-b 왼쪽 150px 제거: body-cropped-side로 실패, 폭·체형을 내지 않는다', () => {
    const a = computeBodyAnalysis(loadFixture('sidecut-b'));
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('body-cropped-side');
    expect(a.ratios).toBeUndefined();
    expect(a.frame).toBeUndefined();
    expect(a.insights).toEqual([]);
  });
  it('관절점 x가 사진 밖(발끝 -0.05)이거나 마스크 몸통이 좌우 끝 열에 닿으면 잘림', () => {
    const L: Landmark3[] = demoLandmarks();
    expect(detectSideCropped(L)).toBe(false);
    expect(detectSideCropped(L, true)).toBe(true);
    L[31] = { ...L[31], x: -0.05 };
    expect(detectSideCropped(L)).toBe(true);
    const R = demoLandmarks();
    R[12] = { ...R[12], x: 1.04 };
    expect(detectSideCropped(R)).toBe(true);
    expect(computeBodyAnalysis({ imageWidth: 600, imageHeight: 900, landmarks: L }).status).toBe('failed');
  });
});

describe('같은 사진의 여백·인코딩 차이 (minor)', () => {
  it('look-b 변형 6종의 등신 차이가 0.2 안쪽이고 8.0 경계를 넘나들지 않는다', () => {
    const v = ['look-b', 'look-b-png', 'look-b-webp', 'look-b-pad', 'look-b-2', 'big13-b'].map((n) => computeBodyAnalysis(loadFixture(n)).ratios!.headsTall);
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.2);
    expect(v.every((x) => x > 8) || v.every((x) => x < 8)).toBe(true);
  });
  it('look-a와 아래 여백을 붙인 사본의 차이가 0.1 안쪽', () => {
    const [a, b] = ['look-a', 'look-a-pad'].map((n) => computeBodyAnalysis(loadFixture(n)).ratios!.headsTall);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});

describe('골반 라벨과 상·하체 칩 (minor)', () => {
  it('칩 두 개가 붙어 있어도 라벨이 어느 칩과도 겹치지 않는다', () => {
    // BodyOverlay와 같은 배치: 골반선 기준 위 칩 hip-14, 아래 칩 hip+50
    const hip = 640;
    const chips: Box[] = [`상체 45%`, `하체 55%`].map((text, i) => {
      const y = i === 0 ? hip - 14 : hip + 50;
      return { x0: 1000 - 16 - labelWidth(text, 34), x1: 984, top: y - 34 * 0.85, bottom: y + 34 * 0.4 };
    });
    for (let base = hip - 120; base <= hip + 160; base += 4) {
      const y = placeWidthLabelY(800, base, '골반', 30, chips);
      const top = y - 30 * 0.85;
      const bottom = y + 30 * 0.4;
      for (const c of chips) expect(bottom <= c.top || top >= c.bottom, `base ${base} → ${y}`).toBe(true);
    }
  });
});

describe('원인과 다른 실패 사유 (minor)', () => {
  it('머리가 없는 사진: head-cropped만, 자세 실패·경고(기울기·돌아섬)를 함께 내지 않는다', () => {
    const a = computeBodyAnalysis(loadFixture('nohead-b'));
    expect(codes(a)).toContain('head-cropped');
    expect(codes(a).filter((c) => postureCodes.has(c))).toEqual([]);
    expect(a.posture!.warnings).toEqual([]);
  });
  it('90° 회전 사진: photo-rotated 하나로 실패(발·어깨 기울기 안내 없음)', () => {
    const a = computeBodyAnalysis(loadFixture('rot90-b'));
    expect(codes(a)).toEqual(['photo-rotated']);
    expect(a.failureReasons[0].message).toContain('세워서');
    expect(bodyIssues(a).map((i) => i.code)).toEqual(['photo-rotated']);
  });
  it('밝기 0.6(어둡지 않음): feet-uncertain에 "밝은 곳에서" 안내를 붙이지 않는다', () => {
    const input = loadFixture('dark0.6');
    const a = computeBodyAnalysis(input);
    expect(codes(a)).toContain('feet-uncertain');
    expect(codes(a)).not.toContain('low-light');
    expect(a.failureReasons.find((r) => r.code === 'feet-uncertain')!.message).not.toContain('밝은 곳');
    const dark = computeBodyAnalysis({ ...input, meanLuminance: 0.2 });
    expect(dark.failureReasons.find((r) => r.code === 'feet-uncertain')!.message).toContain('밝은 곳');
  });
  it('이전에 저장된 머리 잘림 기록도 자세 사유를 걸러서 보여 준다', () => {
    const old = {
      status: 'failed',
      failureReasons: [
        { code: 'head-cropped', message: '머리', severity: 'error' },
        { code: 'posture-extreme', message: '기울어', severity: 'error' },
        { code: 'turned', message: '돌아가', severity: 'warn' },
      ],
      posture: { shoulderTiltDeg: 20, hipTiltDeg: 0, leanDeg: 0, warnings: [{ code: 'shoulder-tilt', message: '어깨 20°', severity: 'warn' }] },
    } as unknown as BodyAnalysis;
    expect(bodyIssues(old).map((i) => i.code)).toEqual(['head-cropped']);
  });
});

describe('측정 실패 기록 화면 (minor)', () => {
  it('실패 기록은 사진과 사유만: 등신 눈금·체형 점수를 그리지 않는다', () => {
    const a = { ...computeBodyAnalysis(loadFixture('nohead-b')), image: { uploadId: 'up_x', url: '/api/uploads/x.jpg', width: 470, height: 1260 } } as BodyAnalysis;
    // 이전 기록처럼 체형 점수가 남아 있어도 그리지 않는다
    const withFrame = { ...a, frame: { type: 'triangle', label: '삼각형', scores: { triangle: 0.49 }, evidence: ['어깨 폭'] } } as unknown as BodyAnalysis;
    for (const x of [a, withFrame]) {
      const html = renderToStaticMarkup(<BodyResultView analysis={x} />);
      expect(html).toContain('머리가 잘렸거나');
      expect(html).not.toContain('등신 눈금'); // 오버레이 svg의 aria-label
      expect(html).not.toContain('체형');
      expect(html).not.toContain('삼각형');
    }
  });
});
