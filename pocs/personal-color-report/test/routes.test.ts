/**
 * 통합: 얼굴 세션(+전신 세션) → POST /api/report/generate → 목록/상세/변형 변경/삭제/전체 삭제.
 * 임시 데이터 디렉터리 + CELEBER_FORCE_MOCK=1 (서술은 규칙 템플릿, isMock=true).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BodyAnalysis, FaceAnalysisSchema, PersonalColorReportSchema } from '@celeber/core/contracts';
import fixture from './fixtures/face-analysis.json';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-pcr-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

type Routes = typeof import('../src/routes');
type Db = typeof import('@celeber/core/server/db');
let R: Routes;
let D: Db;

beforeAll(async () => {
  R = await import('../src/routes');
  D = await import('@celeber/core/server/db');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const json = (method: string, body?: unknown) => new Request('http://x/api', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function seedFace(presentation: 'male' | 'female' | 'unspecified' = 'male') {
  const a = FaceAnalysisSchema.parse(fixture);
  const analysis = { ...a, ai: { ...a.ai!, presentation } };
  const id = D.newId('face');
  const now = D.nowIso();
  D.faceSessions.upsert({ id, data: { id, createdAt: now, updatedAt: now, status: 'complete', label: '테스트', analysis }, cols: { status: 'complete', is_mock: true, front_upload_id: a.front.image.uploadId, label: '테스트' } });
  return id;
}

function seedBody(): string {
  const analysis: BodyAnalysis = {
    version: 1,
    createdAt: D.nowIso(),
    status: 'complete',
    failureReasons: [],
    ratios: { headsTall: 7.2, headToHeight: 0.139, upperToLower: 0.92, legToHeight: 0.47, shoulderToHip: 1.25, shoulderToHeight: 0.25 },
    frame: { type: 'inverted-triangle', label: '역삼각형', scores: { 'inverted-triangle': 0.6, rectangle: 0.2, triangle: 0.05, hourglass: 0.1, oval: 0.05 }, evidence: [] },
    insights: [],
    stylingHints: [],
    source: 'rules',
    isMock: false,
  };
  const id = D.newId('body');
  const now = D.nowIso();
  D.bodySessions.upsert({ id, data: { id, createdAt: now, updatedAt: now, analysis }, cols: { status: 'complete', is_mock: false } });
  return id;
}

describe('personal-color-report 라우트', () => {
  it('생성 → 저장 → 목록/상세 → 변형 변경 → 삭제', async () => {
    const faceId = seedFace('male');
    const bodyId = seedBody();

    const inputs = await (await R.inputsGET()).json();
    expect(inputs.face.map((f: { id: string }) => f.id)).toContain(faceId);
    expect(inputs.face[0].presentation).toBe('male');
    expect(inputs.body.map((b: { id: string }) => b.id)).toContain(bodyId);

    const res = await R.generatePOST(json('POST', { faceSessionId: faceId, bodySessionId: bodyId }));
    expect(res.status).toBe(200);
    const g = await res.json();
    expect(g.aiSource).toBe('mock');
    const report = PersonalColorReportSchema.parse(g.report);
    expect(report.isMock).toBe(true);
    expect(report.variant).toMatchObject({ gender: 'male', userSelected: false });
    expect(report.bodySessionId).toBe(bodyId);
    expect(report.bodyStyling?.frameLabel).toBe('역삼각형');
    expect(report.header.basis).toContain('전신 사진');
    expect(D.personalColorReports.getRow(report.id)?.cols).toMatchObject({ face_session_id: faceId, tone: report.type.tone });

    const list = await (await R.reportsGET(new Request('http://x/api/report/reports'))).json();
    expect(list.reports[0]).toMatchObject({ id: report.id, nameKo: report.type.nameKo, isMock: true });

    const one = await R.reportGET(json('GET'), ctx(report.id));
    expect(one.status).toBe(200);

    const patched = await (await R.reportPATCH(json('PATCH', { gender: 'female' }), ctx(report.id))).json();
    expect(patched.variant).toMatchObject({ gender: 'female', userSelected: true });
    expect(patched.tops.title).toBe('추천 상의·블라우스 색상');
    expect((await R.reportGET(json('GET'), ctx(report.id)).then((r) => r.json())).grooming.items[0].key).toBe('base');

    const latest = await (await R.latestGET()).json();
    expect(latest.id).toBe(report.id);

    expect((await R.reportDELETE(json('DELETE'), ctx(report.id))).status).toBe(200);
    expect((await R.reportGET(json('GET'), ctx(report.id))).status).toBe(404);
  });

  it('사용자 선택 성별, 전신 없음 → bodyStyling null', async () => {
    const faceId = seedFace('unspecified');
    const g = await (await R.generatePOST(json('POST', { faceSessionId: faceId, gender: 'female' }))).json();
    expect(g.report.variant).toMatchObject({ gender: 'female', userSelected: true });
    expect(g.report.bodyStyling).toBeNull();
    expect(g.report.bodySessionId).toBeNull();
  });

  it('skipAi → isMock=false, aiSource skipped', async () => {
    const faceId = seedFace();
    const g = await (await R.generatePOST(json('POST', { faceSessionId: faceId, skipAi: true }))).json();
    expect(g.aiSource).toBe('skipped');
    expect(g.report.isMock).toBe(false);
  });

  it('오류 경로: 검증 400, 세션 없음 404, 전체 삭제 확인 400', async () => {
    expect((await R.generatePOST(json('POST', { faceSessionId: '../x' }))).status).toBe(400);
    expect((await R.generatePOST(json('POST', { faceSessionId: 'face_nope' }))).status).toBe(404);
    expect((await R.generatePOST(json('POST', { faceSessionId: seedFace(), bodySessionId: 'body_nope' }))).status).toBe(404);
    expect((await R.reportPATCH(json('PATCH', { gender: 'x' }), ctx('pcr_nope'))).status).toBe(400);
    expect((await R.reportPATCH(json('PATCH', { gender: 'male' }), ctx('pcr_nope'))).status).toBe(404);
    expect((await R.reportsDELETE(new Request('http://x/api/report/reports', { method: 'DELETE' }))).status).toBe(400);
    const del = await (await R.reportsDELETE(new Request('http://x/api/report/reports?confirm=1', { method: 'DELETE' }))).json();
    expect(del.deleted).toBeGreaterThanOrEqual(2);
    expect(D.faceSessions.count()).toBeGreaterThan(0); // 얼굴 세션은 남는다
  });
});

describe('POST /api/uploads 오류 문구', () => {
  it('본문이 잘려 FormData를 못 읽으면 영문 대신 한국어 400', async () => {
    const body = '--XYZ\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n\xff\xd8\xff';
    const res = await R.uploadPOST(new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=XYZ' }, body }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe('upload_failed');
    expect(j.error.message).toMatch(/25MB/);
    expect(j.error.message).not.toMatch(/FormData/);
  });
  it('한국어 오류·성공 응답은 그대로 둔다', async () => {
    const ko = Response.json({ error: { code: 'bad_request', message: "'file' 필드가 필요합니다." } }, { status: 400 });
    expect(await (await R.koreanUploadError(ko)).json()).toEqual({ error: { code: 'bad_request', message: "'file' 필드가 필요합니다." } });
    const big = Response.json({ error: { code: 'too_large', message: '이미지가 너무 큽니다 (최대 25MB).' } }, { status: 413 });
    expect((await R.koreanUploadError(big)).status).toBe(413);
  });
});
