/**
 * Gate 1 독립 검증 라운드 2 minor(앱) 회귀 테스트. docs/dev-v1/logs/critic/camera-face-r2.md
 * 1) 정면 사진을 측면으로 쓴 결과의 '측면 옆선' 빈 칸 문구가 side:not-profile 경고와 맞아야 한다.
 * 2) 서버는 클라이언트가 보낸 yaw·품질 issues를 그대로 믿지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateCaptureQuality, profileEmptyMessage, runFaceAnalysis, verifyCapture } from '../src/lib';
import { FIXTURES, type Img, paintFace } from './helpers';

const card = FIXTURES['front-card'];
const sideFx = FIXTURES['side-doji'];
const now = '2026-11-24T12:00:00.000Z';
const SKIN = { r: 226, g: 184, b: 160 };
const DARK_SKIN = { r: 40, g: 32, b: 28 }; // 얼굴 luma < 55 → face-dark error
const BG = { r: 120, g: 124, b: 128 };
const frontImg = paintFace(card, SKIN, BG);
const sideImg = paintFace(sideFx, SKIN, BG);
const darkImg = paintFace(card, DARK_SKIN, BG);
const cleanQ = { faceDetected: true, faceSizeRatio: 0.5, faceBrightness: 160, detectionScore: 0.95, passed: true, issues: [] };

describe('측면 옆선 빈 칸 문구', () => {
  const frontQ = evaluateCaptureQuality({ pose: 'front', landmarks: card.landmarks, faceLuma: 170 }).quality;
  const front = { image: { uploadId: 'up_f', url: '/f', width: card.width, height: card.height }, capturedAt: now, landmarks: card.landmarks, yawDeg: 1, pitchDeg: 0, rollDeg: 0, quality: frontQ, fromUpload: true, pixels: frontImg };
  it('정면 사진을 측면으로 쓰면 "찾지 못했습니다"가 아니라 정면에 가깝다고 안내', () => {
    const sq = evaluateCaptureQuality({ pose: 'side', landmarks: card.landmarks, yawDeg: 2, faceLuma: 150 }).quality;
    const a = runFaceAnalysis({ front, side: { ...front, landmarks: card.landmarks, yawDeg: 2, quality: sq }, now });
    const msg = profileEmptyMessage(a);
    expect(msg).toContain('정면에 가까워');
    expect(msg).toContain('2°');
    expect(msg).not.toContain('찾지 못했습니다');
  });
  it('측면에서 얼굴을 못 찾은 경우와 건너뛴 경우는 기존 문구', () => {
    const noFace = evaluateCaptureQuality({ pose: 'side', landmarks: null, faceLuma: null }).quality;
    const a = runFaceAnalysis({ front, side: { ...front, landmarks: null, yawDeg: 0, quality: noFace }, now });
    expect(profileEmptyMessage(a)).toContain('찾지 못했습니다');
    expect(profileEmptyMessage(runFaceAnalysis({ front, side: null, now }))).toBe('측면 촬영을 건너뛰었습니다.');
  });
});

describe('verifyCapture: 서버 측 자세·품질 재판정', () => {
  it('정면 랜드마크에 yaw 60°를 붙여도 측면 기준(35°) 밑으로 묶인다', () => {
    const v = verifyCapture('side', { landmarks: card.landmarks, yawDeg: 60, pitchDeg: 0, rollDeg: 0, quality: cleanQ }, frontImg);
    expect(Math.abs(v.yawDeg)).toBeLessThan(35);
    expect(v.quality.issues.some((i) => i.code === 'yaw' && i.severity === 'error')).toBe(true);
  });
  it('진짜 측면(행렬 yaw -43°)은 그대로 둔다', () => {
    const v = verifyCapture('side', { landmarks: sideFx.landmarks, yawDeg: -43.3, pitchDeg: -7.8, rollDeg: 4.8, quality: cleanQ }, sideImg);
    expect(v.yawDeg).toBeCloseTo(-43.3, 5);
    expect(v.quality.issues.some((i) => i.code === 'yaw' && i.severity === 'error')).toBe(false);
  });
  it('클라이언트가 issues를 비워도 서버 픽셀로 face-dark를 다시 찾는다', () => {
    const v = verifyCapture('front', { landmarks: card.landmarks, yawDeg: 0.9, pitchDeg: -5.4, rollDeg: -0.5, quality: cleanQ }, darkImg);
    expect(v.quality.issues.find((i) => i.code === 'face-dark')?.severity).toBe('error');
    expect(v.quality.passed).toBe(false);
    expect(v.quality.faceBrightness).toBeLessThan(55);
  });
  it('클라이언트가 보고한 issues는 남긴다(더 엄격한 쪽)', () => {
    const own = { ...cleanQ, passed: false, issues: [{ code: 'yaw', severity: 'error' as const, message: '정면을 봐 주세요 (좌우 13°)' }] };
    const v = verifyCapture('front', { landmarks: card.landmarks, yawDeg: 0.9, pitchDeg: 0, rollDeg: 0, quality: own }, frontImg);
    expect(v.quality.issues.find((i) => i.code === 'yaw')?.severity).toBe('error');
    expect(v.quality.passed).toBe(false);
  });
});

/* ------------------------------------------------------------------ 라우트: 조작한 요청 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-face-r2-'));
let R: typeof import('../src/routes');
let U: typeof import('@celeber/core/server/uploads');
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

const save = async (img: Img, kind: 'face-front' | 'face-side') => (await U.saveUpload(await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer(), { kind })).id;
const post = (body: unknown) => R.analyzePOST(new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

describe('analyze: 클라이언트 값 조작', () => {
  it('정면 랜드마크 + yawDeg 60 측면은 옆선을 저장하지 않는다', async () => {
    const f = await save(frontImg, 'face-front');
    const s = await save(frontImg, 'face-side');
    const r = await post({
      front: { uploadId: f, landmarks: card.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality: cleanQ, fromUpload: true },
      side: { uploadId: s, landmarks: card.landmarks, yawDeg: 60, pitchDeg: 0, rollDeg: 0, quality: cleanQ, fromUpload: true },
      skipAi: true,
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.analysis.geometry.profile).toBeUndefined();
    expect(j.analysis.warnings.map((w: { code: string }) => w.code)).toContain('side:not-profile');
  });
  it('어두운 정면에서 issues를 비워도 face-dark 경고와 감점이 남는다', async () => {
    const f = await save(darkImg, 'face-front');
    const r = await post({ front: { uploadId: f, landmarks: card.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality: cleanQ, fromUpload: true }, side: null, skipAi: true });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.analysis.warnings.map((w: { code: string }) => w.code)).toContain('front:face-dark');
    expect(j.analysis.skin.confidenceReasons.join(' ')).toContain('얼굴 어두움');
  });
  it('정상 측면은 그대로 옆선을 만든다', async () => {
    const f = await save(frontImg, 'face-front');
    const s = await save(sideImg, 'face-side');
    const r = await post({
      front: { uploadId: f, landmarks: card.landmarks, yawDeg: 0.9, pitchDeg: -5.4, rollDeg: -0.5, quality: cleanQ, fromUpload: true },
      side: { uploadId: s, landmarks: sideFx.landmarks, yawDeg: -43.3, pitchDeg: -7.8, rollDeg: 4.8, quality: cleanQ, fromUpload: true },
      skipAi: true,
    });
    const j = await r.json();
    expect(j.analysis.geometry.profile).toBeDefined();
  });
});
