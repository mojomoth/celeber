/**
 * 서버·라우트 통합 (임시 DB + CELEBER_FORCE_MOCK): 리포트 × 연예인 분석 → 가이드 생성·저장·목록·수정·다시 만들기·삭제·초기화.
 * 연예인 분석은 celeb-vibe의 analyzeVibe(서버 함수)를 그대로 호출해 만든다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { VibeGuideSchema } from '@celeber/core/contracts';
import { buildReport } from './helpers';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeb-vibe-report-test-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;

const { saveUpload } = await import('@celeber/core/server/uploads');
const db = await import('@celeber/core/server/db');
const { analyzeVibe } = await import('@celeber/celeb-vibe/server');
const server = await import('../src/server');
const routes = await import('../src/routes');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** 세로 사진: 배경 + 피부(상단) + 머스타드 상의 + 블랙 하의 */
async function outfitJpeg(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <rect width="600" height="900" fill="#E7E4DF"/>
  <ellipse cx="300" cy="120" rx="70" ry="90" fill="#E2BEAC"/>
  <rect x="180" y="250" width="240" height="250" fill="#D4A017"/>
  <rect x="200" y="510" width="200" height="330" fill="#1A1A1C"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

const json = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup(opts: { withBody?: boolean } = {}) {
  let bodySessionId: string | null = null;
  if (opts.withBody) {
    bodySessionId = db.newId('body');
    db.bodySessions.insert({
      id: bodySessionId,
      data: {
        id: bodySessionId,
        createdAt: db.nowIso(),
        updatedAt: db.nowIso(),
        analysis: {
          version: 1,
          createdAt: db.nowIso(),
          status: 'complete',
          failureReasons: [],
          ratios: { headsTall: 7.1, headToHeight: 0.14, upperToLower: 0.9, legToHeight: 0.46, shoulderToHip: 1.2, shoulderToHeight: 0.25 },
          frame: { type: 'rectangle', label: '직사각형', scores: { 'inverted-triangle': 0.1, rectangle: 0.6, triangle: 0.1, hourglass: 0.1, oval: 0.1 }, evidence: [] },
          insights: [],
          stylingHints: [],
          source: 'rules',
          isMock: false,
        },
      },
      cols: { status: 'complete', is_mock: false },
    });
  }
  const report = buildReport({ id: db.newId('pcr'), bodySessionId });
  db.personalColorReports.insert({ id: report.id, data: report, cols: { face_session_id: report.faceSessionId, body_session_id: bodySessionId, tone: report.type.tone, season: report.type.season, is_mock: report.isMock } });
  const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
  const { analysis } = await analyzeVibe({ uploadId: rec.id, celebName: '윤하람' });
  return { report, analysis };
}

describe('generateVibeGuide (Mock)', () => {
  it('규칙 계산 + 데모 서술로 저장하고 계약을 통과한다', async () => {
    const { report, analysis } = await setup();
    const r = await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id });
    expect(r.aiSource).toBe('mock');
    expect(r.warning).toBeTruthy();
    const g = r.guide;
    expect(() => VibeGuideSchema.parse(g)).not.toThrow();
    expect(g.isMock).toBe(true);
    expect(g.source).toBe('mock');
    expect(g.saved).toBe(true);
    expect(g.celebName).toBe('윤하람');
    expect(g.thumbnail?.uploadId).toBe(analysis.image.uploadId);
    // 머스타드 상의는 여름 팔레트로 치환
    const top = g.outfit.substitutions.find((s) => s.category === 'top' || s.category === 'outer');
    expect(top?.keepOriginal).toBe(false);
    // 저장 + 컬럼
    const row = db.vibeGuides.getRow(g.id)!;
    expect(row.cols.report_id).toBe(report.id);
    expect(row.cols.vibe_analysis_id).toBe(analysis.id);
    expect(row.cols.thumbnail_upload_id).toBe(analysis.image.uploadId);
    // 전신 없음 → 체형 갭 비교 불가
    expect(g.gaps.find((x) => x.axis === 'body-ratio')?.unavailable).toBe(true);
  });

  it('리포트에 전신 세션이 있으면 내 체형 비율을 쓴다', async () => {
    const { report, analysis } = await setup({ withBody: true });
    expect(server.myBodyRatios(report)?.headsTall).toBe(7.1);
    const { guide } = await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id, skipAi: true });
    expect(guide.source).toBe('rules');
    expect(guide.isMock).toBe(false);
    const body = guide.gaps.find((x) => x.axis === 'body-ratio')!;
    // 연예인 사진에서 비율을 못 쟀으면 그 사유, 쟀으면 등신 비교
    if (body.unavailable) expect(body.comment).toContain('연예인');
    else expect(body.comment).toContain('7.1');
  });

  it('목록·수정·다시 만들기(같은 id, 룩 이름 유지)·삭제', async () => {
    const { report, analysis } = await setup();
    const { guide } = await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id, saved: false });
    expect(server.listGuides({ saved: false }).map((x) => x.id)).toContain(guide.id);
    expect(server.listGuides({ saved: true }).map((x) => x.id)).not.toContain(guide.id);

    let res = await routes.guidePATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saved: true, lookName: '내 버전 룩' }) }), ctx(guide.id));
    expect(res.status).toBe(200);
    const patched = (await res.json()) as { saved: boolean; lookName: string };
    expect(patched.saved).toBe(true);
    expect(patched.lookName).toBe('내 버전 룩');
    expect(db.vibeGuides.getRow(guide.id)!.cols.saved).toBe(1);

    res = await routes.regeneratePOST(json({}), ctx(guide.id));
    expect(res.status).toBe(200);
    const re = (await res.json()) as { guide: { id: string; lookName: string; createdAt: string; saved: boolean } };
    expect(re.guide.id).toBe(guide.id);
    expect(re.guide.lookName).toBe('내 버전 룩');
    expect(re.guide.createdAt).toBe(guide.createdAt);
    expect(re.guide.saved).toBe(true);

    res = await routes.guideGET(new Request('http://x'), ctx(guide.id));
    expect(res.status).toBe(200);
    res = await routes.guideDELETE(new Request('http://x', { method: 'DELETE' }), ctx(guide.id));
    expect(res.status).toBe(200);
    res = await routes.guideGET(new Request('http://x'), ctx(guide.id));
    expect(res.status).toBe(404);
    // 원본은 남는다
    expect(db.vibeAnalyses.get(analysis.id)).not.toBeNull();
    expect(db.personalColorReports.get(report.id)).not.toBeNull();
  });

  it('라우트 검증: 잘못된 id 400, 없는 리포트/분석 404, PATCH 빈 룩 이름 400', async () => {
    const { report, analysis } = await setup();
    let res = await routes.generatePOST(json({ reportId: '../x', vibeAnalysisId: analysis.id }));
    expect(res.status).toBe(400);
    res = await routes.generatePOST(json({ reportId: 'pcr_none', vibeAnalysisId: analysis.id }));
    expect(res.status).toBe(404);
    res = await routes.generatePOST(json({ reportId: report.id, vibeAnalysisId: 'vibe_none' }));
    expect(res.status).toBe(404);
    res = await routes.generatePOST(json({ reportId: report.id, vibeAnalysisId: analysis.id }));
    expect(res.status).toBe(200);
    const { guide } = (await res.json()) as { guide: { id: string } };
    res = await routes.guidePATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lookName: '   ' }) }), ctx(guide.id));
    expect(res.status).toBe(400);
    res = await routes.guidePATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saved: true }) }), ctx('guide_none'));
    expect(res.status).toBe(404);
  });

  it('PATCH: 모르는 필드(오타 save)·빈 본문은 400이고 updatedAt을 바꾸지 않는다', async () => {
    const { report, analysis } = await setup();
    const { guide } = await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id, skipAi: true });
    const patch = (body: unknown) => routes.guidePATCH(new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(guide.id));
    let res = await patch({ save: false });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('validation_error');
    res = await patch({});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('nothing_to_update');
    expect(server.getGuide(guide.id)!.updatedAt).toBe(guide.updatedAt);
    res = await patch({ saved: false });
    expect(res.status).toBe(200);
    expect(server.getGuide(guide.id)!.saved).toBe(false);
  });

  it('내 리포트 목록: 전신 포함 여부와 베스트 컬러', async () => {
    await setup({ withBody: true });
    const res = await routes.myReportsGET(new Request('http://x/api/guide/reports?limit=50'));
    const { items } = (await res.json()) as { items: { id: string; hasBody: boolean; best: unknown[] }[] };
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.hasBody)).toBe(true);
    expect(items[0].best.length).toBeGreaterThan(0);
  });

  it('초기화: 미리보기로 지워질 항목을 보여주고 confirm=1일 때만 이 테이블만 지운다', async () => {
    const { report, analysis } = await setup();
    await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id });
    let res = await routes.guidesGET(new Request('http://x/api/guide/guides?preview=reset'));
    const pv = (await res.json()) as { count: number; items: string[] };
    expect(pv.count).toBeGreaterThan(0);
    expect(pv.items[0]).toContain('윤하람');
    res = await routes.guidesDELETE(new Request('http://x/api/guide/guides', { method: 'DELETE' }));
    expect(res.status).toBe(400);
    const before = db.vibeAnalyses.count();
    res = await routes.guidesDELETE(new Request('http://x/api/guide/guides?confirm=1', { method: 'DELETE' }));
    expect(((await res.json()) as { deleted: number }).deleted).toBe(pv.count);
    expect(db.vibeGuides.count()).toBe(0);
    expect(db.vibeAnalyses.count()).toBe(before);
    expect(db.personalColorReports.get(report.id)).not.toBeNull();
  });
});

describe('내 정보 전체 초기화', () => {
  it('미리보기에 지울 항목·사진 수를 보이고, 실행하면 내 기록과 참조 없는 내 사진만 지운다', async () => {
    await setup({ withBody: true });
    const face = await saveUpload(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#E2BEAC' } }).jpeg().toBuffer(), { kind: 'face-front' });
    const p = (await (await routes.myDataGET()).json()) as { items: string[]; photos: number };
    expect(p.items.some((x) => x.startsWith('퍼스널컬러 리포트'))).toBe(true);
    expect(p.photos).toBeGreaterThanOrEqual(1);
    expect((await routes.myDataDELETE(new Request('http://x/api/guide/my-data', { method: 'DELETE' }))).status).toBe(400);
    const vibeBefore = db.vibeAnalyses.count();
    const r = (await (await routes.myDataDELETE(new Request('http://x/api/guide/my-data?confirm=1', { method: 'DELETE' }))).json()) as { photos: number };
    expect(r.photos).toBeGreaterThanOrEqual(1);
    expect(db.personalColorReports.count()).toBe(0);
    expect(db.bodySessions.count()).toBe(0);
    expect(db.vibeGuides.count()).toBe(0);
    // 연예인 사진 분석과 그 사진은 남는다
    expect(db.vibeAnalyses.count()).toBe(vibeBefore);
    const { getUpload } = await import('@celeber/core/server/uploads');
    expect(getUpload(face.id)).toBeNull();
    const anyVibe = db.vibeAnalyses.list({ limit: 1 })[0];
    expect(getUpload(anyVibe.data.image.uploadId)).not.toBeNull();
  });
});
