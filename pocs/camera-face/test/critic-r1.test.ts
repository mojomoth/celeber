/**
 * Gate 1 독립 검증 라운드 1 이슈 회귀 테스트.
 * 시나리오 이름(S, D/E, F, C, N)은 docs/dev-v1/logs/critic/camera-face-r1.md를 따른다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CAPTURE_ERROR_FACTOR,
  canForceShutter,
  castNameKo,
  colorCastMessage,
  evaluateCaptureQuality,
  isProfileUsable,
  lowConfidenceReasons,
  measureFaceColors,
  reviewAction,
  runFaceAnalysis,
} from '../src/lib';
import { isMediapipeInfoLog, quietMediapipeInfoLogs } from '../src/flow/mediapipe-log';
import { FIXTURES, paintFace } from './helpers';

const card = FIXTURES['front-card'];
const side = FIXTURES['side-doji'];
const now = '2026-11-24T12:00:00.000Z';
const SKIN = { r: 226, g: 184, b: 160 };
const BG = { r: 120, g: 124, b: 128 };

const frontImg = paintFace(card, SKIN, BG);
const frontQ = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 170 }).quality;
const front = { image: { uploadId: 'up_front', url: '/api/uploads/up_front', width: card.width, height: card.height }, capturedAt: now, landmarks: card.landmarks, yawDeg: 1, pitchDeg: 0, rollDeg: 0, quality: frontQ, fromUpload: true, pixels: frontImg };

describe('S: 측면 단계에 정면 사진', () => {
  // 정면 사진을 측면으로 올린 경우: 품질 검사는 yaw error
  const frontAsSideQ = evaluateCaptureQuality({ pose: 'side', landmarks: card.landmarks, yawDeg: 2, faceLuma: 150 });
  const frontAsSide = { image: { uploadId: 'up_side', url: '/api/uploads/up_side', width: card.width, height: card.height }, capturedAt: now, landmarks: card.landmarks, yawDeg: 2, pitchDeg: 0, rollDeg: 0, quality: frontAsSideQ.quality, fromUpload: true, pixels: frontImg };

  it('옆선(profile)을 만들지 않고 side:not-profile 경고를 남긴다', () => {
    const a = runFaceAnalysis({ front, side: frontAsSide, now });
    expect(a.geometry.profile).toBeUndefined();
    const codes = a.warnings.map((w) => w.code);
    expect(codes).toContain('side:not-profile');
    expect(codes).not.toContain('side:yaw');
    expect(a.warnings.find((w) => w.code === 'side:not-profile')!.message).toContain('2°');
    expect(a.side?.image.uploadId).toBe('up_side'); // 사진 자체는 남긴다
  });
  it('품질에 yaw 오류가 없어도 |yaw| < 35°면 옆선 없음 (요청 값만 믿지 않음)', () => {
    const a = runFaceAnalysis({ front, side: { ...frontAsSide, yawDeg: 20, quality: { ...frontAsSideQ.quality, issues: [] } }, now });
    expect(a.geometry.profile).toBeUndefined();
    expect(isProfileUsable({ landmarks: side.landmarks, yawDeg: -43 })).toBe(true);
    expect(isProfileUsable({ landmarks: side.landmarks, yawDeg: -34.9 })).toBe(false);
    expect(isProfileUsable({ landmarks: null, yawDeg: 70 })).toBe(false);
  });
  it('진짜 측면은 그대로 옆선을 만든다', () => {
    const sq = evaluateCaptureQuality({ pose: 'side', landmarks: side.landmarks, yawDeg: 43, faceLuma: 150 }).quality;
    const a = runFaceAnalysis({ front, side: { image: { uploadId: 'up_s', url: '/x', width: side.width, height: side.height }, capturedAt: now, landmarks: side.landmarks, yawDeg: -43, pitchDeg: 0, rollDeg: 0, quality: sq, fromUpload: true, pixels: paintFace(side, SKIN, BG) }, now });
    expect(a.geometry.profile).toBeDefined();
    expect(a.warnings.map((w) => w.code)).not.toContain('side:not-profile');
  });
  it('확인 화면: 사용하기 대신 그래도 사용 + 옆선 미분석 안내', () => {
    const r = reviewAction('side', { landmarks: card.landmarks, yawDeg: 2, quality: frontAsSideQ });
    expect(r.disabled).toBe(false);
    expect(r.label).toBe('그래도 사용');
    expect(r.note).toContain('옆선은 분석하지 않습니다');
    const ok = reviewAction('side', { landmarks: side.landmarks, yawDeg: 60, quality: evaluateCaptureQuality({ pose: 'side', landmarks: side.landmarks, yawDeg: 60, faceLuma: 150 }) });
    expect(ok).toEqual({ disabled: false, label: '사용하기', note: null });
  });
});

describe('D/E/F: 정면 품질 오류', () => {
  it('확인 화면: 오류가 있으면 그래도 사용, 얼굴이 없으면 비활성', () => {
    const dark = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 42.8 });
    const r = reviewAction('front', { landmarks: card.landmarks, yawDeg: 0, quality: dark });
    expect(r.label).toBe('그래도 사용');
    expect(r.disabled).toBe(false);
    expect(r.note).toContain('신뢰도');
    expect(reviewAction('front', { landmarks: null, yawDeg: 0, quality: evaluateCaptureQuality({ pose: 'front', landmarks: null, faceLuma: null }) }).disabled).toBe(true);
    expect(reviewAction('front', { landmarks: card.landmarks, yawDeg: 0, quality: evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 150 }) }).label).toBe('사용하기');
  });
  it('피부 신뢰도는 오류마다 감점한다 (1건 > 2건, 2건이면 0.5 미만)', () => {
    const base = measureFaceColors(frontImg, card.landmarks).skin.confidence;
    const err = (code: string) => ({ code, severity: 'error' as const, message: code });
    const one = measureFaceColors(frontImg, card.landmarks, { captureIssues: [err('face-dark')] }).skin.confidence;
    const two = measureFaceColors(frontImg, card.landmarks, { captureIssues: [err('face-cut'), err('pitch')] });
    expect(one).toBeCloseTo(base * CAPTURE_ERROR_FACTOR, 1);
    expect(two.skin.confidence).toBeLessThan(one);
    expect(two.skin.confidence).toBeLessThan(0.5);
    expect(two.skin.confidenceReasons.join(' ')).toContain('얼굴 잘림, 고개 위아래 각도');
    // 경고(warn)만 있으면 오류 감점 없음
    expect(measureFaceColors(frontImg, card.landmarks, { captureIssues: [{ code: 'blur', severity: 'warn', message: '' }] }).skin.confidence).toBe(base);
  });
  it('F: face-cut + pitch 오류 정면은 결과 저신뢰(0.5 미만) + 상단 표시 이유', () => {
    const fq = { ...frontQ, passed: false, detectionScore: 0.57, issues: [{ code: 'pitch', severity: 'error' as const, message: '턱을 조금 내려 주세요' }, { code: 'face-cut', severity: 'error' as const, message: '얼굴 전체가 화면 안에 들어오게 해 주세요' }] };
    const a = runFaceAnalysis({ front: { ...front, quality: fq }, now });
    expect(a.skin.confidence).toBeLessThan(0.5);
    expect(a.warnings.map((w) => w.code)).toContain('skin:low-confidence');
    const reasons = lowConfidenceReasons(a);
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain('정면 — 턱을');
    expect(lowConfidenceReasons(runFaceAnalysis({ front, now }))).toEqual([]);
  });
});

describe('C: 얼굴 없는 카메라의 강제 셔터', () => {
  it('정면에서 얼굴이 없으면 8초가 지나도 셔터를 열지 않는다', () => {
    expect(canForceShutter('front', 9000, false)).toBe(false);
    expect(canForceShutter('front', 9000, true)).toBe(true);
    expect(canForceShutter('front', 3000, true)).toBe(false);
    // 측면은 얼굴 미검출이어도 '그래도 사용'이 가능하므로 허용
    expect(canForceShutter('side', 9000, false)).toBe(true);
  });
});

describe('색 치우침 문구', () => {
  it("'자주'(often)로 읽히지 않게 '자줏빛'", () => {
    const purple = { r: 0.8, g: 1, b: 0.8 }; // 게인의 역 = 장면이 R·B 쪽으로 치우침
    expect(castNameKo(purple)).toBe('자줏빛');
    expect(colorCastMessage(purple)).toBe('화면 전체가 자줏빛으로 치우쳐 있습니다. 보정량이 커서 정확도가 낮아질 수 있습니다.');
    expect(colorCastMessage({ r: 0.7, g: 1, b: 1.4 })).toContain('노란·주황빛으로');
    expect(colorCastMessage({ r: 1, g: 1, b: 1 })).toContain('화면 전체 색이 한쪽으로 치우쳐');
  });
});

describe('N: MediaPipe INFO 로그', () => {
  it('INFO/W 줄은 console.info로 돌리고, 나머지 오류는 그대로 console.error', () => {
    expect(isMediapipeInfoLog(['INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'])).toBe(true);
    expect(isMediapipeInfoLog(['W0000 00:00:1732400000.000000 1 face_landmarker_graph.cc:174] Sets FaceBlendshapesGraph acceleration'])).toBe(true);
    expect(isMediapipeInfoLog(['E0000 00:00:1732400000.000000 1 graph.cc:1] failed'])).toBe(false);
    expect(isMediapipeInfoLog([new Error('x')])).toBe(false);
    const errors: unknown[][] = [];
    const infos: unknown[][] = [];
    const fake = { error: (...a: unknown[]) => void errors.push(a), info: (...a: unknown[]) => void infos.push(a) };
    quietMediapipeInfoLogs(fake);
    quietMediapipeInfoLogs(fake); // 두 번 감싸지 않음
    fake.error('INFO: Created TensorFlow Lite XNNPACK delegate for CPU.');
    fake.error('진짜 오류');
    expect(infos).toHaveLength(1);
    expect(errors).toEqual([['진짜 오류']]);
  });
});

/* ------------------------------------------------------------------ 라우트: 없는 측면 업로드 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-face-r1-'));
type Routes = typeof import('../src/routes');
type Uploads = typeof import('@celeber/core/server/uploads');
let R: Routes;
let U: Uploads;
let prevDir: string | undefined;
let prevMock: string | undefined;
beforeAll(async () => {
  prevDir = process.env.CELEBER_DATA_DIR;
  prevMock = process.env.CELEBER_FORCE_MOCK;
  process.env.CELEBER_DATA_DIR = tmp;
  process.env.CELEBER_FORCE_MOCK = '1';
  R = await import('../src/routes');
  U = await import('@celeber/core/server/uploads');
});
afterAll(() => {
  if (prevDir === undefined) delete process.env.CELEBER_DATA_DIR;
  else process.env.CELEBER_DATA_DIR = prevDir;
  if (prevMock === undefined) delete process.env.CELEBER_FORCE_MOCK;
  else process.env.CELEBER_FORCE_MOCK = prevMock;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('analyze: 측면 업로드 검증', () => {
  it('side.uploadId가 없으면 건너뜀이 아니라 404 upload_not_found', async () => {
    const png = await sharp(Buffer.from(frontImg.data), { raw: { width: frontImg.width, height: frontImg.height, channels: 4 } }).png().toBuffer();
    const rec = await U.saveUpload(png, { kind: 'face-front' });
    const quality = { faceDetected: true, faceSizeRatio: 0.5, faceBrightness: 160, detectionScore: 0.95, passed: true, issues: [] };
    const body = {
      front: { uploadId: rec.id, landmarks: card.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality, fromUpload: true },
      side: { uploadId: 'up_doesnotexist1', landmarks: side.landmarks, yawDeg: -43, pitchDeg: 0, rollDeg: 0, quality, fromUpload: true },
      skipAi: true,
    };
    const r = await R.analyzePOST(new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(r.status).toBe(404);
    const j = await r.json();
    expect(JSON.stringify(j)).toContain('upload_not_found');
    // 측면 생략(null)은 그대로 200
    const ok = await R.analyzePOST(new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, side: null }) }));
    expect(ok.status).toBe(200);
  });
});
