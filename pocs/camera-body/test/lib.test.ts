import { BodyAnalysisSchema, PersonalColorReportSchema, type Landmark3 } from '@celeber/core/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEMO_H,
  DEMO_W,
  bodyOneLiner,
  buildStylingGuide,
  classifyFrame,
  classifySkeleton,
  computeBodyAnalysis,
  computeBodyAnalysisDetailed,
  createSkippedBodyAnalysis,
  demoFace,
  demoLandmarks,
  demoMask,
  detectFeetCropped,
  reconcileSilhouetteWidths,
  formatRatio,
  HEAD_EYE_FLOOR,
  jointAngleDeg,
  leanFromVerticalDeg,
  measureSilhouette,
  outfitSummaryFromColors,
  rowSegment,
  sampleOutfitColors,
  tiltDeg,
  toBodyStyling,
  type PersonMask,
} from '../src/lib';

const base = { imageWidth: DEMO_W, imageHeight: DEMO_H };

describe('geometry', () => {
  it('tilt / lean / joint angle', () => {
    expect(tiltDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(tiltDeg({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45);
    expect(leanFromVerticalDeg({ x: 0, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(0);
    expect(leanFromVerticalDeg({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45);
    expect(jointAngleDeg({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })).toBeCloseTo(180);
    expect(jointAngleDeg({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeCloseTo(90);
  });
});

describe('silhouette', () => {
  const rect = (w: number, h: number, on: (x: number, y: number) => boolean): PersonMask => {
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = on(x, y) ? 255 : 0;
    return { data, width: w, height: h };
  };
  it('rowSegment finds the run containing center and bridges 1px gaps', () => {
    const m = rect(100, 3, (x) => (x >= 20 && x <= 40) || (x >= 42 && x <= 50) || (x >= 70 && x <= 80));
    expect(rowSegment(m, 1, 30)).toEqual({ x0: 20, x1: 50 });
    expect(rowSegment(m, 1, 75)).toEqual({ x0: 70, x1: 80 });
    expect(rowSegment(m, 1, 60, { maxDist: 3 })).toBeNull();
  });
  it('measures widths, head top and feet bottom on demo mask', () => {
    const mask = demoMask(1);
    const s = measureSilhouette(mask, {
      shoulderMid: { x: 300, y: 200 },
      hipMid: { x: 300, y: 434 },
      kneeMid: { x: 300, y: 625 },
      armSegments: [
        [
          { x: 225, y: 200 },
          { x: 203, y: 345 },
        ],
        [
          { x: 203, y: 345 },
          { x: 192, y: 470 },
        ],
      ],
      armHalfWidth: 20,
      headCenterX: 300,
      headHalfBand: 40,
      headSearchBottomY: 113,
      feetX0: 240,
      feetX1: 360,
      feetSearchTopY: 805,
    });
    expect(s.shoulder!.width).toBeGreaterThan(180);
    expect(s.hip!.width).toBeGreaterThan(160);
    expect(s.waist!.width).toBeLessThan(s.hip!.width);
    expect(s.topY!).toBeGreaterThanOrEqual(54);
    expect(s.topY!).toBeLessThanOrEqual(62);
    expect(s.bottomY!).toBeGreaterThan(835);
    expect(s.armsOverlap).toBe(false);
  });
});

describe('arm overlap correction', () => {
  it('removes arms touching the torso from hip width', () => {
    // 몸통 x 40..60, 팔이 붙어 30..70 전체가 한 덩어리
    const w = 100;
    const h = 100;
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 30; x <= 70; x++) data[y * w + x] = 255;
    const s = measureSilhouette(
      { data, width: w, height: h },
      {
        shoulderMid: { x: 50, y: 10 },
        hipMid: { x: 50, y: 50 },
        kneeMid: { x: 50, y: 80 },
        armSegments: [
          [
            { x: 35, y: 10 },
            { x: 35, y: 70 },
          ],
          [
            { x: 65, y: 10 },
            { x: 65, y: 70 },
          ],
        ],
        armHalfWidth: 5,
        headCenterX: 50,
        headHalfBand: 5,
        headSearchBottomY: 5,
        feetX0: 40,
        feetX1: 60,
        feetSearchTopY: 90,
      },
    );
    expect(s.hip!.x0).toBe(40);
    expect(s.hip!.x1).toBe(60);
    expect(s.armsOverlap).toBe(true);
    // 어깨 띠는 보정하지 않음
    expect(s.shoulder!.width).toBe(41);
  });
});

describe('computeBodyAnalysis (demo figure)', () => {
  const a = computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), face: demoFace(), mask: demoMask() });
  it('is a valid contract and complete', () => {
    expect(() => BodyAnalysisSchema.parse(a)).not.toThrow();
    expect(a.status).toBe('complete');
  });
  it('measures expected ratios', () => {
    const r = a.ratios!;
    // 정수리 60, 턱 167, 발바닥 ~840 → 780/107 ≈ 7.3
    expect(r.headsTall).toBeGreaterThan(7.0);
    expect(r.headsTall).toBeLessThan(7.6);
    expect(r.legToHeight).toBeGreaterThan(0.5);
    expect(r.legToHeight).toBeLessThan(0.54);
    expect(r.upperToLower).toBeGreaterThan(0.85);
    expect(r.upperToLower).toBeLessThan(1.0);
    expect(r.shoulderToHip).toBeGreaterThan(1.0);
    expect(r.shoulderToHip).toBeLessThan(1.25);
    expect(r.waistToHip).toBeGreaterThan(0.75);
    expect(r.thighToShin).toBeGreaterThan(1.0);
    expect(r.armToHeight).toBeGreaterThan(0.31);
    expect(r.armToHeight).toBeLessThan(0.37);
  });
  it('produces insights with comments, frame, skeleton, posture', () => {
    expect(a.insights.map((i) => i.key)).toContain('headsTall');
    for (const i of a.insights) expect(i.comment.length).toBeGreaterThan(5);
    expect(a.frame?.type).toBe('inverted-triangle');
    expect(Object.values(a.frame!.scores).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 1);
    expect(a.skeleton!.confidence).toBeLessThanOrEqual(0.45);
    expect(a.posture!.warnings).toHaveLength(0);
    expect(a.stylingHints.length).toBeGreaterThan(0);
    expect(a.keypoints?.silWaistL).toBeDefined();
  });
  it('works without mask/face (landmark fallback)', () => {
    const d = computeBodyAnalysisDetailed({ ...base, landmarks: demoLandmarks() });
    expect(d.analysis.status).toBe('complete');
    expect(d.widthMethod).toBe('landmarks');
    expect(d.headMethod).toBe('pose');
    expect(d.analysis.ratios!.headsTall).toBeGreaterThan(6.3);
    expect(d.analysis.ratios!.headsTall).toBeLessThan(8.3);
    expect(d.analysis.insights.find((i) => i.key === 'shoulderToHip')!.label).toContain('관절점');
  });
  it('is deterministic', () => {
    const b = computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), face: demoFace(), mask: demoMask(), createdAt: a.createdAt });
    expect(b).toEqual(a);
  });
});

describe('head length when the forehead is hidden (hat, bangs)', () => {
  // 실측(Gate 1, 선바이저 사진): 얼굴 10번 점이 챙 아래로 내려와 머리가 짧게 잡혀 9.2등신이 나왔다.
  const lm = demoLandmarks();
  const eyeY = ((lm[2].y + lm[5].y) / 2) * DEMO_H;
  const chinY = demoFace().chin.y * DEMO_H;
  const hatFace = { ...demoFace(), foreheadTop: { x: demoFace().foreheadTop.x, y: (chinY - (chinY - eyeY) * 1.15) / DEMO_H } };

  it('raises the head top to the eye-based floor so heads-tall stays plausible', () => {
    const normal = computeBodyAnalysis({ ...base, landmarks: lm, face: demoFace() });
    const hat = computeBodyAnalysis({ ...base, landmarks: lm, face: hatFace });
    expect(normal.ratios!.headsTall).toBeLessThan(7.6); // 정상 얼굴에는 보정이 걸리지 않는다
    const headPx = chinY - hat.keypoints!.headTop.y * DEMO_H;
    expect(headPx).toBeCloseTo((chinY - eyeY) * 2 * HEAD_EYE_FLOOR, 0);
    expect(hat.ratios!.headsTall).toBeLessThan(8.3);
    expect(Math.abs(hat.ratios!.headsTall - normal.ratios!.headsTall)).toBeLessThan(0.8);
    expect(hat.frame!.evidence.join(' ')).toContain('눈 위치로 보정');
    expect(normal.frame!.evidence.join(' ')).not.toContain('눈 위치로 보정');
  });

  it('never turns the correction into a head-cropped failure', () => {
    // 눈~턱이 길어 보정 정수리가 사진 위로 나가는 경우(얼굴 기준 정수리는 사진 안): 0에서 멈춘다
    const highFace = { foreheadTop: { x: 0.5, y: (eyeY - 4) / DEMO_H }, chin: { x: 0.5, y: (eyeY + 200) / DEMO_H } };
    expect(eyeY + 200 - 204 * 1.25).toBeGreaterThan(0);
    const a = computeBodyAnalysis({ ...base, landmarks: lm, face: highFace });
    expect(a.failureReasons.map((i) => i.code)).not.toContain('head-cropped');
    expect(a.keypoints!.headTop.y).toBe(0);
  });
});

describe('failure reasons', () => {
  const lms = (): Landmark3[] => demoLandmarks();
  it('feet hidden inside the frame → failed as unclear (not "cropped")', () => {
    const L = lms();
    for (const i of [27, 28, 29, 30, 31, 32]) L[i] = { ...L[i], visibility: 0.1 };
    const a = computeBodyAnalysis({ ...base, landmarks: L });
    expect(a.status).toBe('failed');
    expect(a.failureReasons.map((r) => r.code)).toContain('feet-unclear');
    expect(a.failureReasons.map((r) => r.code)).not.toContain('feet-cropped');
    expect(a.ratios).toBeUndefined();
    expect(a.frame).toBeDefined();
  });
  it('feet cut at mid-shin (real MediaPipe output: ankles on the edge, feet extrapolated below) → failed', () => {
    // 검증자가 실제 사진(정강이 중간에서 잘림)에서 얻은 값: 발목 y 0.9918/0.9859 (vis 0.73/0.62), 뒤꿈치·발끝 y 1.047~1.108
    const L = lms();
    L[27] = { ...L[27], y: 0.9918, visibility: 0.73 };
    L[28] = { ...L[28], y: 0.9859, visibility: 0.62 };
    L[29] = { ...L[29], y: 1.047, visibility: 0.2 };
    L[30] = { ...L[30], y: 1.052, visibility: 0.18 };
    L[31] = { ...L[31], y: 1.096, visibility: 0.15 };
    L[32] = { ...L[32], y: 1.108, visibility: 0.12 };
    for (const opts of [{}, { face: demoFace() }, { face: demoFace(), mask: demoMask() }]) {
      const a = computeBodyAnalysis({ ...base, landmarks: L, ...opts });
      expect(a.status).toBe('failed');
      expect(a.failureReasons.map((r) => r.code)).toContain('feet-cropped');
      expect(a.failureReasons.map((r) => r.code)).not.toContain('feet-estimated');
      expect(a.ratios).toBeUndefined();
      expect(toBodyStyling(a)).toBeNull();
    }
    expect(detectFeetCropped(L).reasons).toEqual(expect.arrayContaining(['foot-outside', 'no-foot-near-edge']));
  });
  it('any foot point outside the frame → cropped regardless of visibility', () => {
    const L = lms();
    L[31] = { ...L[31], y: 0.995, visibility: 0.9 };
    expect(detectFeetCropped(L).cropped).toBe(true);
    expect(computeBodyAnalysis({ ...base, landmarks: L }).status).toBe('failed');
  });
  it('ankle near the edge with no foot visible in frame → cropped', () => {
    const L = lms();
    L[27] = { ...L[27], y: 0.975 };
    L[28] = { ...L[28], y: 0.975 };
    for (const i of [29, 30, 31, 32]) L[i] = { ...L[i], y: 0.985, visibility: 0.1 };
    expect(detectFeetCropped(L).reasons).toContain('no-foot-near-edge');
  });
  it('estimated sole below the image → cropped (no invented height)', () => {
    const L = lms();
    // 발목은 0.96(경계 안), 발 점은 흐림 → 발목 + 머리×0.3 추정이 사진 밖
    L[27] = { ...L[27], y: 0.96 };
    L[28] = { ...L[28], y: 0.96 };
    for (const i of [29, 30, 31, 32]) L[i] = { ...L[i], y: 0.98, visibility: 0.1 };
    const a = computeBodyAnalysis({ ...base, landmarks: L, face: demoFace() });
    expect(a.status).toBe('failed');
    expect(a.failureReasons.map((r) => r.code)).toContain('feet-cropped');
  });
  it('person mask touching the bottom row near the feet → cropped', () => {
    const L = lms();
    for (const i of [27, 28]) L[i] = { ...L[i], y: 0.96 };
    for (const i of [29, 30, 31, 32]) L[i] = { ...L[i], y: 0.98 };
    expect(detectFeetCropped(L, false).cropped).toBe(false);
    expect(detectFeetCropped(L, true).reasons).toContain('mask-at-edge');
    // 마스크 하단이 닿아도 관절점상 발이 위쪽이면(그림자·다른 물체) 잘림으로 보지 않음
    expect(detectFeetCropped(lms(), true).cropped).toBe(false);
    // 발 점이 하단 2.5% 밖이면(밑창이 경계에 붙은 look-a, 발끝 0.96) 잘림이 아니다
    const A = lms();
    for (const i of [29, 30, 31, 32]) A[i] = { ...A[i], y: 0.96 };
    expect(detectFeetCropped(A, true).cropped).toBe(false);
  });
  it('demo figure feet are not cropped', () => {
    expect(detectFeetCropped(lms()).cropped).toBe(false);
  });
  it('head cropped → failed', () => {
    const L = lms().map((l) => ({ ...l, y: l.y - 0.12 }));
    const a = computeBodyAnalysis({ ...base, landmarks: L });
    expect(a.failureReasons.map((r) => r.code)).toContain('head-cropped');
    expect(a.status).toBe('failed');
  });
  it('no landmarks → no-person', () => {
    const a = computeBodyAnalysis({ ...base, landmarks: [] });
    expect(a.status).toBe('failed');
    expect(a.failureReasons[0].code).toBe('no-person');
  });
  it('tilted shoulders and sitting are reported', () => {
    const L = lms();
    L[11] = { ...L[11], y: L[11].y + 0.03 };
    const a = computeBodyAnalysis({ ...base, landmarks: L });
    expect(a.posture!.warnings.map((w) => w.code)).toContain('shoulder-tilt');
    const S = lms();
    S[27] = { ...S[27], x: S[25].x + 0.25, y: S[25].y };
    S[28] = { ...S[28], x: S[26].x - 0.25, y: S[26].y };
    const s = computeBodyAnalysis({ ...base, landmarks: S });
    expect(s.failureReasons.map((r) => r.code)).toContain('not-standing');
  });
  it('multiple people warning', () => {
    const a = computeBodyAnalysis({ ...base, landmarks: lms(), extraPeople: 1 });
    expect(a.failureReasons.map((r) => r.code)).toContain('multiple-people');
  });
});

describe('classifiers', () => {
  it('frame types by widths', () => {
    expect(classifyFrame({ shoulderToHip: 1.3, waistToHip: 0.85, method: 'silhouette' }).type).toBe('inverted-triangle');
    expect(classifyFrame({ shoulderToHip: 0.88, waistToHip: 0.8, method: 'silhouette' }).type).toBe('triangle');
    expect(classifyFrame({ shoulderToHip: 1.02, waistToHip: 0.68, method: 'silhouette' }).type).toBe('hourglass');
    expect(classifyFrame({ shoulderToHip: 1.05, waistToHip: 1.0, method: 'silhouette' }).type).toBe('oval');
    expect(classifyFrame({ shoulderToHip: 1.05, waistToHip: 0.84, method: 'silhouette' }).type).toBe('rectangle');
    // 어깨가 훨씬 넓으면 허리가 골반만큼 넓어도 타원형이 아님
    expect(classifyFrame({ shoulderToHip: 1.6, waistToHip: 1.02, method: 'silhouette' }).scores.oval).toBeLessThan(0.05);
    // 관절점 비 1.7 → 실루엣 환산 1.31 → 역삼각
    expect(classifyFrame({ shoulderToHip: 1.7, method: 'landmarks' }).type).toBe('inverted-triangle');
  });
  it('scores are tempered: never 100%, lower with uncertainty', () => {
    const sure = classifyFrame({ shoulderToHip: 1.6, waistToHip: 0.85, method: 'silhouette' });
    expect(sure.type).toBe('inverted-triangle');
    expect(sure.scores['inverted-triangle']).toBeLessThanOrEqual(0.92);
    const unsure = classifyFrame({ shoulderToHip: 1.6, waistToHip: 0.85, method: 'silhouette', uncertainty: 1 });
    expect(unsure.type).toBe('inverted-triangle');
    expect(unsure.scores['inverted-triangle']).toBeLessThan(sure.scores['inverted-triangle']);
    expect(unsure.scores['inverted-triangle']).toBeLessThanOrEqual(0.72);
    expect(unsure.evidence.join(' ')).toContain('보수적');
  });
  it('reconciles sleeve-inflated shoulders and arm-trimmed hips', () => {
    // 관절 폭 어깨 100, 골반 75 (관절 비 1.33 → 실루엣 환산 1.03)
    // 실루엣: 어깨 170(소매 포함), 골반 95(팔 빼며 과하게 깎임) → 1.79
    const r = reconcileSilhouetteWidths({ shoulder: 170, hip: 95, shoulderJointW: 100, hipJointW: 75, armsOverlap: true });
    expect(r.shoulderCapped).toBe(true);
    expect(r.shoulder).toBeCloseTo(150, 5);
    expect(r.hipBlended).toBe(true);
    const ratio = r.shoulder / r.hip;
    expect(ratio).toBeLessThan(1.45);
    expect(ratio).toBeGreaterThan(1.03);
    expect(r.uncertainty).toBeGreaterThanOrEqual(0.6);
    expect(r.notes.length).toBe(2);
    // 정상 범위면 손대지 않음
    const ok = reconcileSilhouetteWidths({ shoulder: 130, hip: 110, shoulderJointW: 100, hipJointW: 75, armsOverlap: false });
    expect(ok).toMatchObject({ shoulder: 130, hip: 110, shoulderCapped: false, hipBlended: false, uncertainty: 0 });
  });
  it('skeleton is a low-confidence reference', () => {
    const s = classifySkeleton({ shoulderToHip: 0.95, waistToHip: 0.7, method: 'silhouette' });
    expect(s.type).toBe('wave');
    expect(s.confidence).toBeLessThanOrEqual(0.45);
  });
});

describe('summary helpers', () => {
  it('formats ratios', () => {
    expect(formatRatio('headsTall', 7.34)).toBe('7.3등신');
    expect(formatRatio('upperToLower', 1)).toBe('50 : 50');
    expect(formatRatio('legToHeight', 0.523)).toBe('52%');
  });
  it('styling guide reacts to long torso and short heads', () => {
    const g = buildStylingGuide({ upperToLower: 1.08, headsTall: 6.6 }, 'triangle');
    expect(g.suggestions.map((s) => s.title)).toEqual(expect.arrayContaining(['허리선 올리기', '세로선 연결', '어깨에 구조감']));
    expect(g.avoid.length).toBeGreaterThan(0);
  });
  it('toBodyStyling fits PersonalColorReport.bodyStyling', () => {
    const a = computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), face: demoFace(), mask: demoMask() });
    const bs = toBodyStyling(a);
    expect(bs).not.toBeNull();
    expect(() => PersonalColorReportSchema.shape.bodyStyling.parse(bs)).not.toThrow();
    expect(toBodyStyling(createSkippedBodyAnalysis())).toBeNull();
    expect(bodyOneLiner(createSkippedBodyAnalysis())).toBe('전신 사진 추가');
    expect(bodyOneLiner(a)).toMatch(/등신/);
  });
  it('samples outfit colors from pixels', () => {
    const w = 60;
    const h = 90;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [r, g, b] = y < 43 ? [0x39, 0x45, 0x5e] : [0x4a, 0x46, 0x50];
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    const c = sampleOutfitColors({ data, width: w, height: h }, demoLandmarks());
    expect(c.top?.hex).toBe('#39455E');
    expect(c.bottom?.hex).toBe('#4A4650');
    expect(outfitSummaryFromColors(c)).toContain('상의');
  });
});

import { framingFeedback } from '../src/lib';
describe('framingFeedback', () => {
  it('ok for demo figure, warns when feet cut or nobody', () => {
    expect(framingFeedback(demoLandmarks()).state).toBe('ok');
    expect(framingFeedback(null).state).toBe('warn');
    const L = demoLandmarks().map((l) => ({ ...l, y: l.y + 0.1 }));
    expect(framingFeedback(L).message).toContain('발끝');
  });
});
