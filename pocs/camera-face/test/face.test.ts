import { describe, expect, it } from 'vitest';
import { deltaE2000, hexToLab, rgbToHex } from '@celeber/core/color';
import { FaceAnalysisSchema, FaceAiDescriptionSchema } from '@celeber/core/contracts';
import { FACE_OVAL } from '@celeber/core/face';
import {
  AnalyzeRequestSchema,
  analyzeProfile,
  buildFaceGeometry,
  classifyFaceShape,
  computeFaceRatios,
  convexityOf,
  decodeMask,
  downsampleMask,
  drapeAnchorFromAnalysis,
  encodeMask,
  evaluateCaptureQuality,
  eLineLabel,
  measureFaceColors,
  poseFromMatrix,
  ruleBasedDescription,
  runFaceAnalysis,
  sessionLabel,
  sharpnessOf,
  summarizeSession,
  withAiDescription,
} from '../src/lib';
import { SideCaptureInputSchema } from '../src/lib/api';
import { FIXTURES, cast, illuminantGains, paintFace, solid } from './helpers';

const card = FIXTURES['front-card'];
const doji = FIXTURES['front-doji'];
const side = FIXTURES['side-doji'];

describe('머리 자세', () => {
  it('정면 픽스처: |yaw|<5, 측면 픽스처: |yaw|>35 (행렬)', () => {
    expect(Math.abs(poseFromMatrix(card.matrix, card.landmarks, card.width, card.height).yawDeg)).toBeLessThan(5);
    const s = poseFromMatrix(side.matrix, side.landmarks, side.width, side.height);
    expect(s.method).toBe('matrix');
    expect(Math.abs(s.yawDeg)).toBeGreaterThan(35);
  });
  it('합성 회전 행렬: yaw 30° 복원 (행/열 우선과 무관)', () => {
    const t = (30 * Math.PI) / 180;
    const R = [Math.cos(t), 0, -Math.sin(t), 0, 0, 1, 0, 0, Math.sin(t), 0, Math.cos(t), 0, 0, 0, -30, 1];
    expect(Math.abs(poseFromMatrix(R, card.landmarks).yawDeg)).toBeCloseTo(30, 3);
  });
  it('행렬이 없으면 랜드마크 근사', () => {
    expect(poseFromMatrix(null, card.landmarks).method).toBe('landmarks');
  });
});

describe('촬영 품질', () => {
  it('정면 픽스처는 정면 단계 통과', () => {
    const p = poseFromMatrix(card.matrix, card.landmarks, card.width, card.height);
    const q = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, ...p, faceLuma: 150, sharpness: 80 });
    expect(q.ready).toBe(true);
    expect(q.quality.faceDetected).toBe(true);
    expect(q.quality.faceSizeRatio).toBeGreaterThan(0.3);
  });
  it('정면 사진을 측면 단계에서 쓰면 yaw 오류', () => {
    const q = evaluateCaptureQuality({ pose: 'side', landmarks: card.landmarks, yawDeg: 2, faceLuma: 150 });
    expect(q.ready).toBe(false);
    expect(q.quality.issues.some((i) => i.code === 'yaw' && i.severity === 'error')).toBe(true);
  });
  it('측면 픽스처는 측면 단계 통과(경고 포함 가능)', () => {
    const p = poseFromMatrix(side.matrix, side.landmarks, side.width, side.height);
    expect(evaluateCaptureQuality({ pose: 'side', landmarks: side.landmarks, ...p, faceLuma: 140 }).ready).toBe(true);
  });
  it('미검출·어두움·고개 돌림·흐림 처리', () => {
    expect(evaluateCaptureQuality({ pose: 'front', landmarks: null, faceLuma: null }).quality.issues[0].code).toBe('no-face');
    const dark = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 40 });
    expect(dark.ready).toBe(false);
    expect(dark.message).toContain('어둡');
    expect(evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, yawDeg: 20, faceLuma: 150 }).ready).toBe(false);
    const blur = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 150, sharpness: 3 });
    expect(blur.ready).toBe(true);
    expect(blur.quality.issues.map((i) => i.code)).toContain('blur');
  });
  it('선명도: 체커보드 > 단색', () => {
    const checker = solid(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 });
    const flat = solid(64, 64, () => ({ r: 128, g: 128, b: 128 }));
    expect(sharpnessOf(checker)).toBeGreaterThan(1000);
    expect(sharpnessOf(flat)).toBe(0);
  });
});

describe('얼굴 윤곽/비율', () => {
  it('실제 정면 랜드마크: 비율이 그럴듯한 범위, 계란형 판정', () => {
    for (const f of [card, doji]) {
      const r = computeFaceRatios(f.landmarks, f.width, f.height);
      expect(r.lengthToWidth).toBeGreaterThan(1);
      expect(r.lengthToWidth).toBeLessThan(1.5);
      expect(r.jawToCheekbone).toBeGreaterThan(0.6);
      expect(r.jawToCheekbone).toBeLessThan(1);
      expect(r.thirds.upper + r.thirds.middle + r.thirds.lower).toBeCloseTo(1, 2);
      expect(r.symmetry!).toBeGreaterThan(0.85);
      expect(classifyFaceShape(r).shape).toBe('oval');
    }
  });
  it('기울기(roll)·크기에 불변', () => {
    const r0 = computeFaceRatios(card.landmarks, card.width, card.height);
    const a = (12 * Math.PI) / 180;
    const rot = card.landmarks.map((p) => ({ x: 0.5 + ((p.x - 0.5) * Math.cos(a) - (p.y - 0.5) * Math.sin(a)) * 0.7, y: 0.5 + ((p.x - 0.5) * Math.sin(a) + (p.y - 0.5) * Math.cos(a)) * 0.7, z: p.z }));
    const r1 = computeFaceRatios(rot, card.width, card.height);
    expect(r1.lengthToWidth).toBeCloseTo(r0.lengthToWidth, 2);
    expect(r1.jawToCheekbone).toBeCloseTo(r0.jawToCheekbone, 2);
    expect(r1.thirds.middle).toBeCloseTo(r0.thirds.middle, 2);
  });
  it('형태 점수: 합 1, 극단 비율은 해당 형으로', () => {
    const base = computeFaceRatios(card.landmarks, card.width, card.height);
    const long = classifyFaceShape({ ...base, lengthToWidth: 1.42 });
    expect(long.shape).toBe('oblong');
    expect(Object.values(long.scores).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 2);
    expect(classifyFaceShape({ ...base, lengthToWidth: 1.05, jawToCheekbone: 0.83, chinAngleDeg: 134 }).shape).toBe('round');
    expect(classifyFaceShape({ ...base, lengthToWidth: 1.12, foreheadToCheekbone: 0.9, jawToCheekbone: 0.88, chinAngleDeg: 138 }).shape).toBe('square');
    expect(classifyFaceShape({ ...base, foreheadToCheekbone: 0.93, jawToCheekbone: 0.72, chinAngleDeg: 112 }).shape).toBe('heart');
  });
  it('FaceGeometry: 윤곽선 36점, 이목구비 윤곽, 해석', () => {
    const g = buildFaceGeometry(card.landmarks, card.width, card.height);
    expect(g.contour).toHaveLength(FACE_OVAL.length);
    expect(Object.keys(g.featureOutlines!)).toEqual(expect.arrayContaining(['leftEye', 'rightEye', 'lips', 'nose']));
    expect(g.interpretations.length).toBeGreaterThanOrEqual(6);
    expect(g.shapeEvidence.length).toBeGreaterThanOrEqual(4);
  });
});

describe('측면 프로필', () => {
  const p = poseFromMatrix(side.matrix, side.landmarks, side.width, side.height);
  it('실제 측면 랜드마크: 코끝이 가장 앞, E-라인/볼록도 계산', () => {
    const pr = analyzeProfile({ landmarks: side.landmarks, width: side.width, height: side.height, yawDeg: p.yawDeg })!;
    expect(pr).not.toBeNull();
    // 오른쪽을 향한 옆얼굴: 코끝 x가 이마/코밑보다 크다
    expect(pr.points.noseTip.x).toBeGreaterThan(pr.points.nasion!.x);
    expect(pr.points.noseTip.x).toBeGreaterThan(pr.points.subnasale!.x);
    expect(pr.outline.length).toBeGreaterThan(20);
    expect(pr.eLine).toBeDefined();
    expect(['convex', 'straight', 'concave']).toContain(pr.convexity);
    expect(pr.noseProjection!).toBeGreaterThan(0.05);
  });
  it('마스크 실루엣으로 점 보정', () => {
    // 코끝보다 조금 앞까지 전경(1)인 마스크
    const W = 100;
    const H = 90;
    const edge = side.landmarks[1].x + 0.02;
    const mask = { width: W, height: H, data: new Uint8Array(W * H).map((_, i) => ((i % W) / W < edge ? 1 : 0)) };
    const plain = analyzeProfile({ landmarks: side.landmarks, width: side.width, height: side.height, yawDeg: p.yawDeg })!;
    const snapped = analyzeProfile({ landmarks: side.landmarks, width: side.width, height: side.height, yawDeg: p.yawDeg, mask })!;
    expect(snapped.points.noseTip.x).toBeGreaterThan(plain.points.noseTip.x);
    expect(snapped.notes.join(' ')).toContain('실루엣');
  });
  it('비정상 좌표(무한대·거대값)는 멈추지 않고 null', () => {
    const mask = { width: 1, height: 1, data: new Uint8Array([1]) };
    for (const x of [1e308, 1e9, Number.NaN]) {
      const lms = side.landmarks.map((l, i) => (i === 152 ? { ...l, x } : l));
      const t0 = Date.now();
      expect(analyzeProfile({ landmarks: lms, width: side.width, height: side.height, yawDeg: 60, mask })).toBeNull();
      expect(Date.now() - t0).toBeLessThan(500);
    }
  });
  it('요청 스키마가 정규화 범위를 벗어난 랜드마크·각도를 거부', () => {
    const base = { uploadId: 'up_abc', landmarks: side.landmarks, yawDeg: 60, pitchDeg: 0, rollDeg: 0, quality: { faceDetected: true, faceSizeRatio: 0.4, faceBrightness: 120, detectionScore: 0.9, passed: true, issues: [] }, fromUpload: true };
    expect(SideCaptureInputSchema.safeParse(base).success).toBe(true);
    expect(SideCaptureInputSchema.safeParse({ ...base, landmarks: side.landmarks.map((l, i) => (i === 152 ? { ...l, x: 1e308 } : l)) }).success).toBe(false);
    expect(SideCaptureInputSchema.safeParse({ ...base, yawDeg: 1e9 }).success).toBe(false);
  });
  it('랜드마크 없으면 null, 라벨 헬퍼', () => {
    expect(analyzeProfile({ landmarks: null, width: 10, height: 10 })).toBeNull();
    expect(convexityOf(25).convexity).toBe('convex');
    expect(convexityOf(10).convexity).toBe('straight');
    expect(convexityOf(-3).convexity).toBe('concave');
    expect(eLineLabel(-0.03, -0.02)).toContain('안쪽');
    expect(eLineLabel(0.0, 0.03)).toContain('앞');
  });
});

describe('피부색 측정 + 화이트밸런스', () => {
  const SKIN = { r: 226, g: 184, b: 160 };
  const BG = { r: 128, g: 128, b: 128 };
  it('캐스트 없는 합성 얼굴: 피부색 ΔE<1, 신뢰도 > 0.5', () => {
    const img = paintFace(card, SKIN, BG);
    const r = measureFaceColors(img, card.landmarks);
    expect(deltaE2000(r.skin.raw.lab, hexToLab(rgbToHex(SKIN)))).toBeLessThan(1);
    expect(r.whiteBalance.method).toBe('gray-world');
    expect(r.skin.whiteBalance.deltaE).toBeLessThan(1);
    expect(r.skin.regions.length).toBeGreaterThanOrEqual(3);
    expect(r.skin.confidence).toBeGreaterThan(0.5);
    expect(r.featureColors.lips).toBeDefined();
  });
  it('전구색 캐스트: 배경 gray-world 보정이 원래 피부색에 가까워진다', () => {
    const k = illuminantGains(3500);
    const img = paintFace(card, SKIN, BG, k);
    const r = measureFaceColors(img, card.landmarks);
    const truth = hexToLab(rgbToHex(SKIN));
    const before = deltaE2000(r.skin.raw.lab, truth);
    const after = deltaE2000(r.skin.corrected.lab, truth);
    expect(after).toBeLessThan(before * 0.8); // 강도 0.6 부분 보정 (과보정 방지)
    expect(r.skin.corrected.lab.b).toBeLessThan(r.skin.raw.lab.b);
  });
  it('기준 백색이 있으면 강도 1로 거의 완전 복원', () => {
    const k = illuminantGains(3500);
    const img = paintFace(card, SKIN, BG, k);
    const white = cast({ r: 230, g: 230, b: 230 }, k);
    const env = { referenceWhite: { hex: rgbToHex(white), rgb: { r: Math.round(white.r), g: Math.round(white.g), b: Math.round(white.b) }, lab: { l: 0, a: 0, b: 0 }, lch: { l: 0, c: 0, h: 0 }, ita: 0, itaCategory: 'light' as const, nameKo: '' }, cctK: 3500, cctConfidence: 0.9, grayWorldGains: { r: 1, g: 1, b: 1 }, lightingQuality: 0.9 } as never;
    const r = measureFaceColors(img, card.landmarks, { environment: env });
    expect(r.whiteBalance.method).toBe('reference-white');
    expect(deltaE2000(r.skin.corrected.lab, hexToLab(rgbToHex(SKIN)))).toBeLessThan(2.5);
  });
});

describe('FaceAnalysis 조립', () => {
  const now = '2026-11-23T12:00:00.000Z';
  const img = paintFace(card, { r: 226, g: 184, b: 160 }, { r: 120, g: 124, b: 128 });
  const sideImg = paintFace(side, { r: 226, g: 184, b: 160 }, { r: 120, g: 124, b: 128 });
  const q = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 170 }).quality;
  const sq = evaluateCaptureQuality({ pose: 'side', landmarks: side.landmarks, yawDeg: 43, faceLuma: 150 }).quality;
  const front = { image: { uploadId: 'up_front', url: '/api/uploads/up_front', width: card.width, height: card.height }, capturedAt: now, landmarks: card.landmarks, yawDeg: 1, pitchDeg: -3, rollDeg: 0, quality: q, fromUpload: true, pixels: img };
  const sideCap = { image: { uploadId: 'up_side', url: '/api/uploads/up_side', width: side.width, height: side.height }, capturedAt: now, landmarks: side.landmarks, yawDeg: -43, pitchDeg: 0, rollDeg: 4, quality: sq, fromUpload: true, pixels: sideImg };

  it('환경 없이: 얼굴 배경으로 환경 추정 + 계약 스키마 통과', () => {
    const a = runFaceAnalysis({ front, side: sideCap, now });
    expect(FaceAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.environment.warnings[0].code).toBe('env-from-face');
    expect(a.environment.image).toBeUndefined();
    expect(a.side?.pose).toBe('side');
    expect(a.geometry.profile).toBeDefined();
    expect(a.front.landmarks).toHaveLength(478);
    expect(a.source).toBe('rules');
    expect(a.isMock).toBe(false);
  });
  it('측면 생략/측면 미검출 경고', () => {
    const a = runFaceAnalysis({ front, now });
    expect(a.side).toBeUndefined();
    expect(a.warnings.map((w) => w.code)).toContain('side:skipped');
    const b = runFaceAnalysis({ front, side: { ...sideCap, landmarks: null }, now });
    expect(b.geometry.profile).toBeUndefined();
    expect(b.warnings.map((w) => w.code)).toContain('side:no-landmarks');
  });
  it('규칙 기반 서술(Mock) + AI 병합 + 세션 요약 + 드레이핑 기준점', () => {
    const base = runFaceAnalysis({ front, side: sideCap, now });
    const d = ruleBasedDescription(base);
    expect(FaceAiDescriptionSchema.safeParse(d).success).toBe(true);
    expect(d.presentation).toBe('unspecified');
    const mock = withAiDescription(base, d, 'mock');
    expect(mock.isMock).toBe(true);
    expect(mock.source).toBe('rules');
    const ai = withAiDescription(base, { ...d, presentation: 'male' }, 'ai');
    expect(ai.source).toBe('hybrid');
    expect(ai.isMock).toBe(false);
    const sum = summarizeSession({ id: 'face_x', createdAt: now, updatedAt: now, status: 'complete', label: sessionLabel(now, base.environment), analysis: mock });
    expect(sum.skinHex).toBe(mock.skin.corrected.hex);
    expect(sum.isMock).toBe(true);
    expect(sum.thumbnailUrl).toBe('/api/uploads/up_front');
    expect(sessionLabel(now)).toMatch(/11\. 23\./);
    const anchor = drapeAnchorFromAnalysis(base)!;
    expect(anchor.chin.y).toBeGreaterThan(anchor.faceBox.y);
  });
});

describe('마스크/요청 계약', () => {
  it('마스크 축소·인코딩 왕복', () => {
    const big = { width: 512, height: 384, data: new Uint8Array(512 * 384).map((_, i) => (i % 512 < 256 ? 1 : 3)) };
    const m = downsampleMask(big, 256);
    expect(m.width).toBe(256);
    expect(m.height).toBe(192);
    const back = decodeMask(encodeMask(m))!;
    expect(back.data).toEqual(m.data);
    expect(decodeMask({ width: 10, height: 10, data: 'AAAA' })).toBeNull();
  });
  it('AnalyzeRequest 스키마', () => {
    const q = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 150 }).quality;
    const ok = AnalyzeRequestSchema.safeParse({ front: { uploadId: 'up_abc', landmarks: card.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality: q, fromUpload: false }, side: null });
    expect(ok.success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse({ front: { uploadId: '../etc', landmarks: [], yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality: q, fromUpload: false } }).success).toBe(false);
  });
});
