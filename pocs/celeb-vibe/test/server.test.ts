import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { deltaE2000, hexToLab } from '@celeber/core/color';
import { measurement } from './fixtures';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeb-vibe-test-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;

const { saveUpload } = await import('@celeber/core/server/uploads');
const db = await import('@celeber/core/server/db');
const server = await import('../src/server');
const routes = await import('../src/routes');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** 세로 사진: 배경 + 피부(상단) + 네이비 상의 + 그레이 하의 */
async function outfitJpeg(): Promise<Buffer> {
  const W = 600;
  const H = 900;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#E7E4DF"/>
  <ellipse cx="300" cy="120" rx="70" ry="90" fill="#E2BEAC"/>
  <rect x="180" y="250" width="240" height="250" fill="#1F2A44"/>
  <rect x="200" y="510" width="200" height="330" fill="#787880"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

describe('analyzeVibe (Mock, SQLite)', () => {
  it('측정 없이 서버 통계만으로 분석 → 저장 → 목록/상세', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const pre = await server.precheckVibe({ uploadId: rec.id });
    expect(pre.measured).toBe(false);
    expect(pre.analyzability.personCount).toBe(1);

    const { analysis, warning } = await server.analyzeVibe({ uploadId: rec.id, celebName: '데모 인물' });
    expect(analysis.isMock).toBe(true);
    expect(warning).toContain('데모');
    expect(analysis.image.uploadId).toBe(rec.id);
    expect(analysis.outfit.items.map((i) => i.category)).toContain('top');
    const top = analysis.outfit.items.find((i) => i.category === 'top')!;
    expect(deltaE2000(hexToLab(top.color.hex), hexToLab('#1F2A44'))).toBeLessThan(2);
    expect(db.vibeAnalyses.get(analysis.id)?.lookName).toBe(analysis.lookName);
    const list = server.listVibeAnalyses();
    expect(list[0].id).toBe(analysis.id);
    expect(list[0].celebName).toBe('데모 인물');
  });

  it('브라우저 측정값과 함께 분석 → 측정 저장 → 다시 분석은 같은 id 유지', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const m = measurement({ width: 600, height: 900 });
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id, measurement: m });
    expect(analysis.personalColor.measured).toBe(true);
    expect(analysis.outfit.items[0].category).toBe('outer');
    expect(analysis.body?.headsTall).toBe(7.4);
    const again = await server.reanalyzeVibe(analysis.id);
    expect(again.analysis.id).toBe(analysis.id);
    expect(again.analysis.createdAt).toBe(analysis.createdAt);
    expect(again.analysis.personalColor.measured).toBe(true); // 저장된 측정값 재사용
    expect(again.analysis.outfit).toEqual(analysis.outfit);
  });

  it('없는 업로드는 404', async () => {
    await expect(server.analyzeVibe({ uploadId: 'up_none' })).rejects.toMatchObject({ status: 404 });
  });

  it('celebImageId가 있으면 celeb_images에 분석 가능 여부를 기록', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'celeb-search-cache' });
    const celebId = db.celebs.insert({
      data: { id: 'celeb_t', createdAt: 't', updatedAt: 't', name: '데모', aliases: [], saved: true, source: 'mock', isMock: true },
      id: 'celeb_t',
      cols: { name: '데모', name_key: '데모', saved: true, is_mock: true },
    });
    db.celebImages.insert({
      id: 'cimg_t',
      data: { id: 'cimg_t', celebId, createdAt: 't', category: 'daily', query: 'q', provider: 'mock', sourceUrl: 'data:x', cached: { uploadId: rec.id, url: `/api/uploads/${rec.id}` }, isFullBody: true, analyzable: null, reasons: [], selected: false, isMock: true },
      cols: { celeb_id: celebId, category: 'daily', provider: 'mock', source_url: 'data:x', upload_id: rec.id },
    });
    const opts = server.listCelebImageOptions();
    expect(opts[0]).toMatchObject({ id: 'cimg_t', celebName: '데모', categoryLabel: expect.any(String) });
    const m = measurement({ faceCount: 2, poseCount: 2 });
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id, celebId, celebImageId: 'cimg_t', measurement: m });
    expect(analysis.celebName).toBe('데모');
    expect(analysis.analyzability.analyzable).toBe(false);
    expect(db.celebImages.get('cimg_t')?.analyzable).toBe(false);
    const forced = await server.analyzeVibe({ uploadId: rec.id, celebImageId: 'cimg_t', measurement: m, force: true });
    expect(forced.analysis.analyzability.analyzable).toBe(true);
  });

  it('Route Handler: 검증 오류 400, 수정 PATCH, 초기화는 confirm 필요', async () => {
    const bad = await routes.analyzePOST(new Request('http://x/api/vibe/analyze', { method: 'POST', body: JSON.stringify({}) }));
    expect(bad.status).toBe(400);
    const id = server.listVibeAnalyses()[0].id;
    const ctx = { params: Promise.resolve({ id }) };
    const patched = await routes.analysisPATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ lookName: '수정한 룩' }) }), ctx);
    expect(((await patched.json()) as { lookName: string }).lookName).toBe('수정한 룩');
    const notConfirmed = await routes.analysesDELETE(new Request('http://x', { method: 'DELETE', body: JSON.stringify({}) }));
    expect(notConfirmed.status).toBe(400);
    const prev = (await (await routes.analysesGET(new Request('http://x/api/vibe/analyses?preview=reset'))).json()) as { analyses: number };
    expect(prev.analyses).toBeGreaterThan(0);
    const del = await routes.analysesDELETE(new Request('http://x', { method: 'DELETE', body: JSON.stringify({ confirm: true }) }));
    expect(((await del.json()) as { deleted: number }).deleted).toBe(prev.analyses);
    expect(server.listVibeAnalyses()).toEqual([]);
    const missing = await routes.analysisGET(new Request('http://x'), ctx);
    expect(missing.status).toBe(404);
  });

  it('검출기 실패 측정값: 사전 판정은 통계 기준(measured=false), 분석은 진행되고 원래 측정값은 저장', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const failed = measurement({
      width: 600,
      height: 900,
      faceCount: 0,
      poseCount: 0,
      faceBoxes: [],
      face: undefined,
      pose: undefined,
      regions: [],
      body: undefined,
      detectors: { face: 'failed', pose: 'failed', segmentation: 'failed' },
    });
    const pre = await server.precheckVibe({ uploadId: rec.id, measurement: failed });
    expect(pre.measured).toBe(false);
    expect(pre.measurementDropped).toBe(true);
    expect(pre.analyzability.analyzable).toBe(true);
    expect(pre.analyzability.reasons.map((r) => r.code)).not.toContain('no-person');
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id, measurement: failed });
    expect(analysis.analyzability.analyzable).toBe(true);
    expect(analysis.outfit.items.map((i) => i.category)).toContain('top');
    expect(db.kvGet(`vibe:measurement:${analysis.id}`)).toBeTruthy();
  });

  it('잘못된 측정값(hex)은 500이 아니라 400', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const bad = measurement();
    bad.regions[0].clusters[0].hex = 'zzz';
    const r = await routes.analyzePOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ uploadId: rec.id, measurement: bad }) }));
    expect(r.status).toBe(400);
    // 서버 함수를 직접 부르는 다른 앱도 400 VibeError를 받는다
    await expect(server.analyzeVibe({ uploadId: rec.id, measurement: bad })).rejects.toMatchObject({ status: 400, code: 'invalid_measurement' });
  });

  it('사용자가 고친 룩 이름은 다시 분석해도 유지, 삭제 시 함께 정리', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id, measurement: measurement({ width: 600, height: 900 }) });
    server.updateVibeAnalysis(analysis.id, { lookName: '수정 룩' });
    const again = await server.reanalyzeVibe(analysis.id);
    expect(again.analysis.lookName).toBe('수정 룩');
    expect(db.vibeAnalyses.getRow(analysis.id)?.cols.look_name).toBe('수정 룩');
    // 고친 적 없는 분석은 생성된 이름을 그대로 쓴다
    const other = await server.analyzeVibe({ uploadId: rec.id });
    expect((await server.reanalyzeVibe(other.analysis.id)).analysis.lookName).toBe(other.analysis.lookName);
    server.deleteVibeAnalysis(analysis.id);
    expect(db.kvGet(`vibe:edit:${analysis.id}`)).toBeNull();
  });

  it('다시 분석 중에 기록이 삭제되면 404로 끝내고 새 id로 되살리지 않는다', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id });
    const before = db.vibeAnalyses.count();
    const pending = server.reanalyzeVibe(analysis.id);
    // reanalyze가 이미지 통계·AI 응답을 기다리는 동안 삭제
    expect(server.deleteVibeAnalysis(analysis.id)).toBe(true);
    await expect(pending).rejects.toMatchObject({ status: 404 });
    expect(db.vibeAnalyses.count()).toBe(before - 1);
    // 없는 replaceId를 직접 넘겨도 새로 만들지 않는다
    await expect(server.analyzeVibe({ uploadId: rec.id, replaceId: 'vibe_missing' })).rejects.toMatchObject({ status: 404 });
    expect(db.vibeAnalyses.count()).toBe(before - 1);
  });

  it('측정 없이 강행(force)한 기록은 다시 분석해도 강행을 유지한다', async () => {
    const rec = await saveUpload(await outfitJpeg(), { kind: 'vibe' });
    const { analysis } = await server.analyzeVibe({ uploadId: rec.id, force: true });
    expect(db.kvGet<{ force?: boolean }>(`vibe:measurement:${analysis.id}`)?.force).toBe(true);
    const again = await server.reanalyzeVibe(analysis.id);
    expect(again.analysis.id).toBe(analysis.id);
    expect(again.analysis.analyzability).toEqual(analysis.analyzability);
    expect(db.kvGet<{ force?: boolean }>(`vibe:measurement:${analysis.id}`)?.force).toBe(true);
    // 강행하지 않은 측정 없는 기록은 저장할 것이 없다
    const plain = await server.analyzeVibe({ uploadId: rec.id });
    expect(db.kvGet(`vibe:measurement:${plain.analysis.id}`)).toBeNull();
  });

  it('투명 여백이 있는 PNG: 사전 판정에서 매우 어둡다고 하지 않는다', async () => {
    const opaque = await outfitJpeg();
    const png = await sharp(opaque)
      .ensureAlpha()
      .extend({ top: 300, bottom: 300, left: 300, right: 300, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const rec = await saveUpload(png, { kind: 'vibe' });
    const pre = await server.precheckVibe({ uploadId: rec.id });
    expect(pre.analyzability.reasons.map((r) => r.code)).not.toContain('extreme-lighting');
  });

  it('URL 가져오기: 사설 주소는 거부', async () => {
    const r = await routes.importUrlPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1/a.jpg' }) }));
    expect(r.status).toBe(400);
  });
});
