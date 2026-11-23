/**
 * 통합: 업로드 → POST /api/face/environment → POST /api/face/analyze → 목록/상세/삭제.
 * 임시 데이터 디렉터리 + CELEBER_FORCE_MOCK=1 (AI 서술은 규칙 기반 Mock).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FaceAnalysisSchema } from '@celeber/core/contracts';
import { FIXTURES, illuminantGains, paintFace, solid, cast } from './helpers';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-face-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

type Routes = typeof import('../src/routes');
type Uploads = typeof import('@celeber/core/server/uploads');
let R: Routes;
let U: Uploads;

beforeAll(async () => {
  R = await import('../src/routes');
  U = await import('@celeber/core/server/uploads');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const png = (img: { data: Uint8ClampedArray; width: number; height: number }) => sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
const post = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('camera-face 라우트', () => {
  it('환경 → 정면/측면 분석 → 저장 → 조회 → 삭제', async () => {
    const card = FIXTURES['front-card'];
    const side = FIXTURES['side-doji'];
    const k = illuminantGains(4200);
    const envRec = await U.saveUpload(await png(solid(320, 240, (x, y) => cast({ r: 140 + ((x + y) % 30), g: 140 + ((x + y) % 30), b: 140 + ((x + y) % 30) }, k))), { kind: 'environment' });
    const er = await R.environmentPOST(post({ uploadId: envRec.id }));
    expect(er.status).toBe(200);
    const env = await er.json();
    expect(env.sessionId).toMatch(/^face_/);
    expect(env.environment.cctK).toBeLessThan(5000);
    expect(env.environment.image.uploadId).toBe(envRec.id);
    expect(env.aiSource).toBe('mock');

    // 기준 백색 재지정 (같은 세션 갱신)
    const er2 = await R.environmentPOST(post({ uploadId: envRec.id, sessionId: env.sessionId, whitePoint: { x: 0.5, y: 0.5 }, skipAi: true }));
    const env2 = await er2.json();
    expect(env2.sessionId).toBe(env.sessionId);
    expect(env2.whiteReference.ok).toBe(true);
    expect(env2.environment.referenceWhite).toBeDefined();

    const frontRec = await U.saveUpload(await png(paintFace(card, { r: 226, g: 184, b: 160 }, { r: 140, g: 140, b: 140 }, k)), { kind: 'face-front' });
    const sideRec = await U.saveUpload(await png(paintFace(side, { r: 226, g: 184, b: 160 }, { r: 140, g: 140, b: 140 }, k)), { kind: 'face-side' });
    const quality = { faceDetected: true, faceSizeRatio: 0.5, faceBrightness: 170, detectionScore: 0.95, passed: true, issues: [] };
    const ar = await R.analyzePOST(
      post({
        sessionId: env.sessionId,
        front: { uploadId: frontRec.id, landmarks: card.landmarks, yawDeg: 1, pitchDeg: -2, rollDeg: 0, quality, fromUpload: true },
        side: { uploadId: sideRec.id, landmarks: side.landmarks, yawDeg: -43, pitchDeg: 0, rollDeg: 4, quality, fromUpload: true },
      }),
    );
    expect(ar.status).toBe(200);
    const res = await ar.json();
    expect(res.sessionId).toBe(env.sessionId);
    const a = FaceAnalysisSchema.parse(res.analysis);
    expect(a.skin.whiteBalance.method).toBe('reference-white');
    expect(a.isMock).toBe(true);
    expect(a.ai?.presentation).toBe('unspecified');
    expect(a.geometry.profile).toBeDefined();
    expect(res.session.status).toBe('complete');

    const list = await (await R.sessionsGET(new Request('http://x/api/face/sessions?status=complete'))).json();
    expect(list.sessions[0].id).toBe(env.sessionId);
    expect(list.sessions[0].skinHex).toBe(a.skin.corrected.hex);
    const one = await R.sessionGET(new Request('http://x'), { params: Promise.resolve({ id: env.sessionId }) });
    expect((await one.json()).analysis.skin.corrected.hex).toBe(a.skin.corrected.hex);
    const latest = await (await R.latestGET()).json();
    expect(latest.sessionId).toBe(env.sessionId);

    expect((await R.sessionsDELETE(new Request('http://x/api/face/sessions'))).status).toBe(400);
    expect((await R.sessionDELETE(new Request('http://x'), { params: Promise.resolve({ id: env.sessionId }) })).status).toBe(200);
    expect((await R.sessionGET(new Request('http://x'), { params: Promise.resolve({ id: env.sessionId }) })).status).toBe(404);
  });

  it('환경 없이 정면만: 배경으로 환경 추정, 측면 생략', async () => {
    const card = FIXTURES['front-card'];
    const rec = await U.saveUpload(await png(paintFace(card, { r: 200, g: 150, b: 120 }, { r: 128, g: 128, b: 128 })), { kind: 'face-front' });
    const quality = { faceDetected: true, faceSizeRatio: 0.5, faceBrightness: 160, detectionScore: 0.95, passed: true, issues: [] };
    const r = await R.analyzePOST(post({ front: { uploadId: rec.id, landmarks: card.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality, fromUpload: true }, skipAi: true }));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.analysis.environment.warnings[0].code).toBe('env-from-face');
    expect(j.analysis.side).toBeUndefined();
    expect(j.aiSource).toBe('skipped');
    expect(j.analysis.isMock).toBe(false);
  });

  it('잘못된 요청: 검증 오류 400, 없는 업로드 404', async () => {
    expect((await R.analyzePOST(post({ front: {} }))).status).toBe(400);
    expect((await R.environmentPOST(post({ uploadId: 'up_doesnotexist' }))).status).toBe(404);
  });
});
