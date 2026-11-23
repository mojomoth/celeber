/**
 * Gate 1 독립 검증 라운드 1 이슈 회귀 테스트. 실측 픽스처 설명은 fixture.ts.
 */
import { BodyAnalysisSchema, type Landmark3 } from '@celeber/core/contracts';
import { describe, expect, it } from 'vitest';
import { BodyOverlay, labelWidth, placeWidthLabelY } from '../src/components/BodyOverlay';
import { analyzingNote, bodyUploadErrorMessage, precheckBodyUpload, UPLOAD_FAILED_MESSAGE, UPLOAD_HEIC_MESSAGE, UPLOAD_TOO_LARGE_MESSAGE, UPLOAD_TYPE_MESSAGE } from '../src/flow/uploadMessages';
import {
  computeBodyAnalysis,
  DEMO_H,
  DEMO_W,
  demoFace,
  demoLandmarks,
  demoMask,
  detectFeetCropped,
  meanLuminanceOf,
  noPersonIssue,
} from '../src/lib';
import { assertPlausibleRatios, BodyInputError } from '../src/server';
import { loadFixture } from './fixture';

const codes = (a: { failureReasons: { code: string }[] }) => a.failureReasons.map((r) => r.code);
const base = { imageWidth: DEMO_W, imageHeight: DEMO_H };

describe('real photos (MediaPipe 실측)', () => {
  it('look-b: 기준 사진은 complete', () => {
    const a = computeBodyAnalysis(loadFixture('look-b'));
    expect(a.status).toBe('complete');
    // 라운드 3: 선바이저 위 헤어 윤곽으로 정수리를 잡는다(이전 8.5). 범위 근거는 gate1-r3.test.tsx
    expect(a.ratios!.headsTall).toBeGreaterThan(7.4);
    expect(a.ratios!.headsTall).toBeLessThan(8.1);
    expect(codes(a)).not.toContain('low-light');
  });

  it('look-a: 밑창이 하단 경계에 붙어도 잘림 실패가 아니라 경고와 함께 측정한다', () => {
    const input = loadFixture('look-a');
    const a = computeBodyAnalysis(input);
    expect(a.status).toBe('complete');
    expect(codes(a)).not.toContain('feet-cropped');
    expect(codes(a)).toContain('feet-near-edge');
    expect(a.ratios!.headsTall).toBeGreaterThan(7);
    expect(a.ratios!.headsTall).toBeLessThan(8.6);
    // 발바닥은 마스크 발끝(사진 마지막 행) 기준
    expect(a.keypoints!.sole.y).toBeGreaterThan(0.99);
    expect(() => BodyAnalysisSchema.parse(a)).not.toThrow();
  });

  it('nohead-b: 목 아래만 남은 사진은 가짜 머리로 측정하지 않는다', () => {
    const input = loadFixture('nohead-b');
    expect(input.face).toBeNull();
    const a = computeBodyAnalysis(input);
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('head-cropped');
    expect(a.ratios).toBeUndefined();
    // 마스크 없이 관절점만으로도 (눈~어깨가 몸통 대비 짧음) 잡는다
    expect(codes(computeBodyAnalysis({ ...input, mask: null }))).toContain('head-cropped');
  });

  it('dark0.3: 어두워 발이 흐리면 "잘림"이 아니라 "발을 찾지 못함" + 저조도 경고와 밝기 안내', () => {
    const a = computeBodyAnalysis(loadFixture('dark0.3'));
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('low-light');
    expect(codes(a).some((c) => c === 'feet-unclear' || c === 'feet-uncertain')).toBe(true);
    expect(codes(a)).not.toContain('feet-cropped');
    expect(a.failureReasons.find((r) => r.code === 'feet-uncertain')?.message ?? '밝은 곳').toContain('밝은 곳');
  });
});

describe('head missing (face not found)', () => {
  // 포즈 모델이 티셔츠 안에 만든 코·눈: 어깨 바로 위
  const fakeHead = (): Landmark3[] => {
    const L = demoLandmarks();
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) L[i] = { ...L[i], y: L[i].y + 70 / DEMO_H };
    return L;
  };
  it('eyes too close to the shoulders → head-cropped', () => {
    const a = computeBodyAnalysis({ ...base, landmarks: fakeHead() });
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('head-cropped');
  });
  it('person mask reaching the top row above the head → head-cropped', () => {
    const m = demoMask();
    const data = Uint8Array.from(m.data as ArrayLike<number>);
    // demoMask는 0.5배 해상도: 사진 x 280~320, y 0~60 (머리 위로 이어진 사람 픽셀)
    for (let y = 0; y < 30; y++) for (let x = 140; x < 160; x++) data[y * m.width + x] = 255;
    const a = computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), mask: { ...m, data } });
    expect(codes(a)).toContain('head-cropped');
  });
  it('normal demo figure without face/mask is still complete', () => {
    expect(computeBodyAnalysis({ ...base, landmarks: demoLandmarks() }).status).toBe('complete');
    expect(computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), mask: demoMask() }).status).toBe('complete');
  });
});

describe('feet landmarks on the shin (dark photo)', () => {
  it('ankle/foot points well above the mask bottom → feet-uncertain, not complete', () => {
    // 검증자 실측: 발바닥 점 0.868, 실제 발끝 0.987. 정강이 비는 정상(1.2)이라 마스크 교차 확인만 걸린다
    const L = demoLandmarks();
    for (const i of [27, 28]) L[i] = { ...L[i], y: 780 / DEMO_H, visibility: 0.6 };
    for (const i of [29, 30, 31, 32]) L[i] = { ...L[i], y: 790 / DEMO_H, visibility: 0.45 };
    const a = computeBodyAnalysis({ ...base, landmarks: L, face: demoFace(), mask: demoMask() });
    expect(a.status).toBe('failed');
    expect(codes(a)).toContain('feet-uncertain');
    expect(a.ratios).toBeUndefined();
  });
  it('shin much shorter than thigh → feet-uncertain even without a mask', () => {
    const L = demoLandmarks();
    for (const i of [27, 28]) L[i] = { ...L[i], y: 730 / DEMO_H };
    for (const i of [29, 30, 31, 32]) L[i] = { ...L[i], y: 750 / DEMO_H };
    const a = computeBodyAnalysis({ ...base, landmarks: L, face: demoFace() });
    expect(codes(a)).toContain('feet-uncertain');
    expect(a.status).toBe('failed');
  });
  it('ankles in frame but low visibility → unclear, not cropped', () => {
    const L = demoLandmarks();
    for (const i of [27, 28]) L[i] = { ...L[i], visibility: 0.45 };
    const c = detectFeetCropped(L);
    expect(c).toMatchObject({ cropped: false, unclear: true });
  });
});

describe('posture and ratio sanity', () => {
  it('tilt over 15° fails instead of a complete result', () => {
    const L = demoLandmarks();
    L[11] = { ...L[11], y: L[11].y + 50 / DEMO_H };
    const a = computeBodyAnalysis({ ...base, landmarks: L, face: demoFace() });
    expect(codes(a)).toContain('posture-extreme');
    expect(a.status).toBe('failed');
  });
  it('server rejects 10.5등신 and shoulder/height 0.07', () => {
    const ratios = { headsTall: 7.4, headToHeight: 0.135, upperToLower: 0.9, legToHeight: 0.52, shoulderToHip: 1.3, shoulderToHeight: 0.25 };
    const mk = (r: object) => ({ status: 'complete', ratios: { ...ratios, ...r } }) as never;
    expect(() => assertPlausibleRatios(mk({}))).not.toThrow();
    expect(() => assertPlausibleRatios(mk({ headsTall: 10.455 }))).toThrow(BodyInputError);
    expect(() => assertPlausibleRatios(mk({ shoulderToHeight: 0.071 }))).toThrow(BodyInputError);
  });
});

describe('low light', () => {
  it('mean luminance and messages', () => {
    const px = (v: number) => ({ data: new Uint8ClampedArray(Array.from({ length: 64 }, (_, i) => (i % 4 === 3 ? 255 : v))) });
    expect(meanLuminanceOf(px(255))).toBeCloseTo(1, 2);
    expect(meanLuminanceOf(px(51))).toBeCloseTo(0.2, 2);
    expect(noPersonIssue(0.2).message).toContain('어두워');
    expect(noPersonIssue(0.7).message).not.toContain('어두워');
    expect(noPersonIssue().message).not.toContain('어두워');
    const a = computeBodyAnalysis({ ...base, landmarks: demoLandmarks(), face: demoFace(), mask: demoMask(), meanLuminance: 0.2 });
    expect(a.status).toBe('complete');
    expect(codes(a)).toContain('low-light');
  });
});

describe('upload messages', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size });
  it('prechecks type, HEIC and size', () => {
    expect(precheckBodyUpload(file('a.jpg', 'image/jpeg', 20 * 1024 * 1024))).toBeNull();
    expect(precheckBodyUpload(file('doc.pdf', 'application/pdf'))).toBe(UPLOAD_TYPE_MESSAGE);
    expect(precheckBodyUpload(file('IMG_1.HEIC', 'image/heic'))).toBe(UPLOAD_HEIC_MESSAGE);
    expect(precheckBodyUpload(file('IMG_1.heic', ''))).toBe(UPLOAD_HEIC_MESSAGE);
    expect(precheckBodyUpload(file('big.jpg', 'image/jpeg', 26 * 1024 * 1024))).toBe(UPLOAD_TOO_LARGE_MESSAGE);
  });
  it('maps server errors without a wrong HEIC hint or English text', () => {
    const core = '지원하지 않는 이미지 형식입니다 (JPEG/PNG/WebP/HEIC/AVIF/GIF/SVG).';
    expect(bodyUploadErrorMessage(400, core, file('fake.jpg', 'image/jpeg'))).toBe(UPLOAD_TYPE_MESSAGE);
    expect(UPLOAD_TYPE_MESSAGE).not.toContain('HEIC');
    expect(bodyUploadErrorMessage(400, core, file('x.heic', 'image/heic'))).toBe(UPLOAD_HEIC_MESSAGE);
    expect(bodyUploadErrorMessage(400, 'Failed to parse body as FormData.', file('a.jpg', 'image/jpeg'))).toBe(UPLOAD_FAILED_MESSAGE);
    expect(bodyUploadErrorMessage(413, '이미지가 너무 큽니다.', file('a.jpg', 'image/jpeg'))).toBe(UPLOAD_TOO_LARGE_MESSAGE);
    expect(bodyUploadErrorMessage(400, '사진 업로드 기록을 찾을 수 없습니다.', file('a.jpg', 'image/jpeg'))).toBe('사진 업로드 기록을 찾을 수 없습니다.');
  });
  it('analyzing note says the photo goes to an AI service when outfit description is on', () => {
    expect(analyzingNote(true, true)).toContain('AI 서비스로 보냅니다');
    expect(analyzingNote(false, true)).not.toContain('AI');
    expect(analyzingNote(true, false)).not.toContain('AI');
  });
});

describe('overlay labels', () => {
  it('moves a width label off the upper/lower chip it would overlap', () => {
    const chip = { x0: 1000 - 16 - labelWidth('상체 49%', 34), x1: 984, top: 700 - 29, bottom: 700 + 14 };
    const y = placeWidthLabelY(800, 709, '골반', 30, [chip]);
    expect(y === 709).toBe(false);
    const top = y - 30 * 0.85;
    const bottom = y + 30 * 0.4;
    expect(bottom <= chip.top || top >= chip.bottom).toBe(true);
    // 겹치지 않으면 그대로
    expect(placeWidthLabelY(300, 709, '골반', 30, [chip])).toBe(709);
  });
  it('renders without throwing for a real result', () => {
    const a = computeBodyAnalysis(loadFixture('look-b'));
    expect(BodyOverlay({ analysis: a, aspect: 1280 / 378 })).toBeTruthy();
  });
});
