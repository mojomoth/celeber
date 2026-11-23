/**
 * Gate 1 독립 검증 라운드 3 이슈 회귀 테스트. 실측 픽스처 설명은 fixture.ts.
 * nohead200-b·rot12-b·gray-b·desat-b·two-b는 수정 후 파이프라인(정사각형 여백 재검출 포함)으로 브라우저에서 잰 값이다.
 */
import type { BodyAnalysis } from '@celeber/core/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodyOverlay, labelWidth, placeWidthLabelX } from '../src/components/BodyOverlay';
import { RatioBar } from '../src/components/RatioViz';
import { bodyIssues, buildInsights, computeBodyAnalysis, computeBodyAnalysisDetailed, countExtraPeople, displayedValue, HEAD_CUT_COVER, isCameraTilt, rangeVerdict, type BodyMeasureInput } from '../src/lib';
import { loadFixture, loadPoses } from './fixture';

const codes = (a: { failureReasons: { code: string }[] }) => a.failureReasons.map((r) => r.code);
const LOOK_B_FAMILY = ['look-b', 'look-b-png', 'look-b-webp', 'look-b-pad', 'look-b-2', 'big13-b'];

describe('선바이저 사진의 정수리 (major)', () => {
  it('look-b: 정수리를 헤어 윤곽 근처로 잡아 7.4~8.1등신, 정수리 불확실 경고', () => {
    const input = loadFixture('look-b');
    const d = computeBodyAnalysisDetailed(input);
    const a = d.analysis;
    expect(a.status).toBe('complete');
    expect(a.ratios!.headsTall).toBeGreaterThan(7.4);
    expect(a.ratios!.headsTall).toBeLessThan(8.1);
    expect(codes(a)).toContain('head-top-uncertain');
    // 정수리는 헤어 윤곽(마스크 머리끝)과 선바이저 띠 위 경계(원본 30px ≈ 분석 해상도 24px) 사이
    const topPx = a.keypoints!.headTop.y * input.imageHeight;
    expect(topPx).toBeGreaterThan(d.silhouette!.topY!);
    expect(topPx).toBeLessThan(24);
    expect(a.frame!.evidence.join(' ')).toContain('헤어 윤곽');
  });

  it('look-b 변형 6종도 같은 범위, 차이 0.2 안쪽', () => {
    const v = LOOK_B_FAMILY.map((n) => computeBodyAnalysis(loadFixture(n)).ratios!.headsTall);
    for (const x of v) {
      expect(x).toBeGreaterThan(7.4);
      expect(x).toBeLessThan(8.1);
    }
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.2);
  });

  it('모자 없는 look-a는 경고 없이 측정하고, 아래 여백 사본과 0.1 안쪽', () => {
    const [a, b] = ['look-a', 'look-a-pad'].map((n) => computeBodyAnalysis(loadFixture(n)));
    for (const x of [a, b]) {
      expect(x.status).toBe('complete');
      expect(codes(x)).not.toContain('head-top-uncertain');
      expect(x.ratios!.headsTall).toBeGreaterThan(7);
      expect(x.ratios!.headsTall).toBeLessThan(8);
    }
    expect(Math.abs(a.ratios!.headsTall - b.ratios!.headsTall)).toBeLessThan(0.1);
  });

  it('높은 모자처럼 마스크가 머리 위로 길게 이어져도 머리 길이는 눈~턱 × 2 × 1.15를 넘지 않는다', () => {
    const input = loadFixture('look-b');
    const mask = input.mask!;
    const data = Uint8Array.from(mask.data as Uint8Array);
    // 머리 위 0~25행을 머리 폭으로 칠한 것처럼 마스크 머리끝을 사진 맨 위 바로 아래로 올린다
    const cx = Math.round(input.landmarks[0].x * mask.width);
    const hat = new Uint8Array(data);
    for (let y = 2; y < 26; y++) hat.fill(1, y * mask.width + cx - 20, y * mask.width + cx + 20);
    const eyeY = input.face!.eyeMid!.y * input.imageHeight;
    const chinY = input.face!.chin.y * input.imageHeight;
    const a = computeBodyAnalysis({ ...input, mask: { ...mask, data: hat } });
    const headPx = (a.keypoints!.chin.y - a.keypoints!.headTop.y) * input.imageHeight;
    expect(headPx).toBeLessThanOrEqual((chinY - eyeY) * 2 * 1.15 + 1);
  });

  it('위 30·45px 제거본: 머리카락이 머리 폭으로 잘려 있으면 정수리가 사진 밖 → head-cropped', () => {
    for (const n of ['topcut30-b', 'topcut45-b']) {
      const d = computeBodyAnalysisDetailed(loadFixture(n));
      // 고개를 돌려 머리가 코 기준 띠의 한쪽으로 치우쳐도(45px 제거본) 띠 밖으로 이어진 구간까지 잰다
      expect(d.silhouette!.topEdgeCover, n).toBeGreaterThan(1);
      expect(d.analysis.status, n).toBe('failed');
      expect(codes(d.analysis), n).toContain('head-cropped');
      expect(d.analysis.ratios, n).toBeUndefined();
    }
    // 머리끝만 경계에 닿은 사진은 잘림이 아니다
    for (const n of ['look-a', 'look-b-pad']) {
      const x = computeBodyAnalysisDetailed(loadFixture(n));
      expect(x.silhouette!.topTouchesEdge, n).toBe(true);
      expect(x.silhouette!.topEdgeCover, n).toBeLessThan(HEAD_CUT_COVER);
      expect(x.analysis.status, n).toBe('complete');
    }
  });
});

describe('정수리 불확실 경고는 측정 완료에만', () => {
  it('발이 흐려 실패한 선바이저 사진(dark0.6)에는 붙이지 않는다', () => {
    const a = computeBodyAnalysis(loadFixture('dark0.6'));
    expect(a.status).toBe('failed');
    expect(codes(a)).not.toContain('head-top-uncertain');
  });
});

describe('한 사람 사진의 "여러 사람" 경고 (minor)', () => {
  it('머리를 잘라 낸 한 사람 사진: 포즈 2개지만 같은 사람이라 0명, 실패 화면에 "여러 사람" 없음', () => {
    const { poses, mainIdx } = loadPoses('nohead200-b');
    expect(poses.length).toBe(2);
    expect(countExtraPeople(poses, mainIdx)).toBe(0);
    const input = loadFixture('nohead200-b');
    const a = computeBodyAnalysis(input);
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('head-cropped');
    expect(codes(a)).not.toContain('multiple-people');
    // 포즈 수를 그대로 넘겨도(이전 동작) 잘림 실패에서는 '여러 사람'을 붙이지 않는다
    expect(codes(computeBodyAnalysis({ ...input, extraPeople: 1 }))).not.toContain('multiple-people');
  });

  it('실제 두 사람 사진은 1명으로 세고 경고를 유지한다', () => {
    const { poses, mainIdx } = loadPoses('two-b');
    expect(countExtraPeople(poses, mainIdx)).toBe(1);
    const a = computeBodyAnalysis(loadFixture('two-b'));
    expect(a.status).toBe('complete');
    expect(codes(a)).toContain('multiple-people');
  });

  it('작은 포즈와 크게 겹치는 포즈는 세지 않는다', () => {
    const { poses } = loadPoses('two-b');
    const main = poses[0];
    const shrink = main.map((l) => ({ ...l, x: 0.05 + l.x * 0.1, y: 0.05 + l.y * 0.1 }));
    const dup = main.map((l) => ({ ...l, x: l.x + 0.01 }));
    expect(countExtraPeople([main, shrink], 0)).toBe(0);
    expect(countExtraPeople([main, dup], 0)).toBe(0);
    expect(countExtraPeople([main], 0)).toBe(0);
  });

  it('저장된 예전 실패 기록도 잘림 실패면 "여러 사람"을 보여 주지 않는다', () => {
    const old = { failureReasons: [{ code: 'head-cropped', message: 'x', severity: 'error' }, { code: 'multiple-people', message: 'y' }] } as unknown as BodyAnalysis;
    expect(bodyIssues(old).map((i) => i.code)).toEqual(['head-cropped']);
  });
});

describe('흑백·저채도 사진 (minor)', () => {
  it('정사각형 여백 재검출로 잡은 흑백·저채도 사본은 원본과 같은 범위로 측정된다', () => {
    const ref = computeBodyAnalysis(loadFixture('look-b')).ratios!.headsTall;
    for (const n of ['gray-b', 'desat-b']) {
      const a = computeBodyAnalysis(loadFixture(n));
      expect(a.status, n).toBe('complete');
      expect(Math.abs(a.ratios!.headsTall - ref), n).toBeLessThan(0.2);
    }
  });
});

describe('표시 값과 범위 판정 (minor)', () => {
  it('팔/키 0.307은 "31%"로 보이고 "키의 31~36%" 범위 안으로 판정한다', () => {
    expect(displayedValue('armToHeight', 0.307)).toBe(0.31);
    const ins = buildInsights({ headsTall: 7.6, headToHeight: 0.13, upperToLower: 0.95, legToHeight: 0.51, shoulderToHip: 1.1, shoulderToHeight: 0.25, armToHeight: 0.307 }, 'silhouette');
    const arm = ins.find((i) => i.key === 'armToHeight')!;
    expect(arm.display).toBe('31%');
    expect(rangeVerdict(arm.key, arm.value, arm.reference!)).toBe('in');
    expect(arm.comment).toContain('평균 범위');
    const html = renderToStaticMarkup(<RatioBar insight={arm} />);
    expect(html).toContain('범위 안');
    expect(html).not.toContain('범위보다 낮음');
    // 표시도 범위 밖이면 그대로 밖이다
    expect(rangeVerdict('armToHeight', 0.304, { min: 0.31, max: 0.36 })).toBe('low');
    expect(rangeVerdict('headsTall', 8.04, { min: 6.5, max: 8 })).toBe('in');
    expect(rangeVerdict('headsTall', 8.06, { min: 6.5, max: 8 })).toBe('high');
  });
});

describe('카메라 기울기 (minor)', () => {
  it('12° 돌린 사진: 자세 탓이 아니라 "카메라를 수평으로" 안내로 실패', () => {
    const a = computeBodyAnalysis(loadFixture('rot12-b'));
    expect(a.status).toBe('failed');
    expect(codes(a)).toEqual(expect.arrayContaining(['camera-tilted']));
    expect(codes(a)).not.toContain('posture-extreme');
    expect(a.posture!.warnings).toEqual([]);
    expect(a.failureReasons.find((r) => r.code === 'camera-tilted')!.message).toContain('카메라를 수평으로');
    expect(bodyIssues(a).map((i) => i.message).join(' ')).not.toContain('어깨 높이를 맞춰');
    expect(a.frame).toBeUndefined();
  });

  it('어깨·골반·몸통이 같은 방향일 때만 카메라 기울기로 본다', () => {
    expect(isCameraTilt(17, 14, 9)).toBe(true);
    expect(isCameraTilt(-6, -5, -4)).toBe(true);
    // 짝다리(어깨와 골반이 반대로)·몸통만 기울어짐·정상 사진
    expect(isCameraTilt(8, -6, 3)).toBe(false);
    expect(isCameraTilt(1, 0.5, 7)).toBe(false);
    for (const n of [...LOOK_B_FAMILY, 'look-a', 'look-a-pad']) expect(codes(computeBodyAnalysis(loadFixture(n))), n).not.toContain('camera-tilt');
  });

  it('조금 기운 사진(공통 기울기 10° 이하)은 실패 대신 카메라 기울기 경고 하나', () => {
    const input = loadFixture('look-b');
    // 사진 중심 기준 6° 회전
    const th = (6 * Math.PI) / 180;
    const W = input.imageWidth;
    const H = input.imageHeight;
    const rot = (p: { x: number; y: number }) => {
      const x = p.x * W - W / 2;
      const y = p.y * H - H / 2;
      return { x: (x * Math.cos(th) - y * Math.sin(th) + W / 2) / W, y: (x * Math.sin(th) + y * Math.cos(th) + H / 2) / H };
    };
    const tilted: BodyMeasureInput = { ...input, mask: null, face: null, landmarks: input.landmarks.map((l) => ({ ...l, ...rot(l) })) };
    const a = computeBodyAnalysis(tilted);
    expect(codes(a)).toContain('camera-tilt');
    expect(a.posture!.warnings.map((w) => w.code)).not.toContain('shoulder-tilt');
    expect(codes(a)).not.toContain('posture-extreme');
  });
});

describe('폭선 라벨이 사진 오른쪽 경계에서 잘림 (minor)', () => {
  const inBounds = (x: number, text: string) => x >= 0 && x + labelWidth(text, 30) <= 1000;

  it('선이 오른쪽 경계까지 가면 라벨을 선 왼쪽 바깥에 둔다', () => {
    const a = computeBodyAnalysis(loadFixture('two-b'));
    const k = a.keypoints!;
    const xa = k.silShoulderL.x * 1000;
    const xb = k.silShoulderR.x * 1000;
    expect(xb + 14 + labelWidth('어깨', 30)).toBeGreaterThan(1000); // 이전 자리(오른쪽 끝 + 14)는 경계를 넘는다
    const x = placeWidthLabelX(xa, xb, '어깨', 30);
    expect(inBounds(x, '어깨')).toBe(true);
    expect(x + labelWidth('어깨', 30)).toBeLessThanOrEqual(xa);
  });

  it('양쪽 모두 자리가 없으면 선 안쪽에, 여유가 있으면 원래 자리', () => {
    expect(placeWidthLabelX(400, 600, '골반', 30)).toBe(614);
    const x = placeWidthLabelX(10, 990, '어깨', 30);
    expect(inBounds(x, '어깨')).toBe(true);
    expect(x).toBeLessThan(990);
  });

  it('렌더링 결과의 라벨 상자가 모두 viewBox 안에 있다', () => {
    const input = loadFixture('two-b');
    const a = computeBodyAnalysis(input);
    const html = renderToStaticMarkup(<BodyOverlay analysis={a} aspect={input.imageHeight / input.imageWidth} />);
    const rects = [...html.matchAll(/<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(rects.length).toBeGreaterThan(0);
    for (const [x, w] of rects) expect(x + w).toBeLessThanOrEqual(1000);
  });
});
