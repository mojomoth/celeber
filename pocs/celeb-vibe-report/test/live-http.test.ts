/**
 * 실제 서버 입출력 검증 (평소에는 건너뜀).
 * dev 서버(키 있는 실제 모드)를 띄운 뒤 실행한다. 실제 AI를 호출하므로 비용이 든다.
 *   CELEBER_LIVE_URL=http://localhost:3106 pnpm --filter @celeber/celeb-vibe-report exec vitest run test/live-http.test.ts
 * CELEBER_LIVE_OUT=<파일>을 주면 응답 요지를 JSON으로 남긴다. 만든 기록은 지우지 않는다(화면에서 이어서 확인).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AnalyzabilitySchema, PersonalColorReportSchema, UploadRecordSchema, VibeAnalysisSchema, VibeGuideSchema } from '@celeber/core/contracts';

const BASE = process.env.CELEBER_LIVE_URL;
const OUT = process.env.CELEBER_LIVE_OUT;
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../core/fixtures/demo-people');
const log: Record<string, unknown> = {};

async function call<T = unknown>(p: string, init: RequestInit = {}): Promise<{ status: number; body: T; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(BASE + p, { ...init, signal: AbortSignal.timeout(240_000) });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body, ms: Date.now() - t0 };
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function upload(file: string, kind = 'vibe') {
  const form = new FormData();
  form.set('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
  form.set('kind', kind);
  const r = await call('/api/uploads', { method: 'POST', body: form });
  expect(r.status).toBe(200);
  return UploadRecordSchema.parse(r.body);
}

describe.skipIf(!BASE)('실제 서버 입출력 (CELEBER_LIVE_URL)', () => {
  let reportId = '';
  let vibeId = '';

  it('health: 실제 모드', async () => {
    const r = await call<{ capabilities: Record<string, unknown> }>('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.capabilities.forceMock).toBe(false);
    log.health = r.body.capabilities;
  });

  it('내 리포트: 저장된 얼굴 세션으로 새로 생성 (AI 서술)', async () => {
    const inputs = await call<{ face: { id: string }[]; body: { id: string }[] }>('/api/report/inputs');
    expect(inputs.status).toBe(200);
    expect(inputs.body.face.length).toBeGreaterThan(0);
    const r = await call<{ report: unknown; aiSource: string; warning?: string }>(
      '/api/report/generate',
      post({ faceSessionId: inputs.body.face[0].id, bodySessionId: inputs.body.body[0]?.id, gender: 'female' }),
    );
    expect(r.status).toBe(200);
    const report = PersonalColorReportSchema.parse(r.body.report);
    reportId = report.id;
    log.report = { ms: r.ms, aiSource: r.body.aiSource, warning: r.body.warning, id: report.id, source: report.source, isMock: report.isMock, tone: report.type.nameKo };
  });

  it('추구미 분석: 데모 사진 look-a (분석 가능 → AI 서술)', async () => {
    const up = await upload(path.join(DEMO, 'look-a.jpg'));
    const pre = await call<{ analyzability: unknown; measured: boolean }>('/api/vibe/precheck', post({ uploadId: up.id }));
    expect(pre.status).toBe(200);
    const analyzability = AnalyzabilitySchema.parse(pre.body.analyzability);
    const r = await call<{ analysis: unknown; warning?: string }>('/api/vibe/analyze', post({ uploadId: up.id, celebName: '데모 모델' }));
    expect(r.status).toBe(200);
    const a = VibeAnalysisSchema.parse(r.body.analysis);
    vibeId = a.id;
    log.vibe = {
      precheck: analyzability,
      ms: r.ms,
      warning: r.body.warning,
      id: a.id,
      source: a.source,
      isMock: a.isMock,
      lookName: a.lookName,
      summary: a.outfit.summary,
      outfit: a.outfit,
      mood: a.mood,
      personalColor: a.personalColor?.tone,
    };
  });

  it('가이드 생성: 실제 공급자 응답 + VibeGuide 계약', async () => {
    expect(reportId && vibeId).toBeTruthy();
    const r = await call<{ guide: unknown; aiSource: string; warning?: string }>('/api/guide/generate', post({ reportId, vibeAnalysisId: vibeId, saved: true }));
    expect(r.status).toBe(200);
    const g = VibeGuideSchema.parse(r.body.guide);
    log.guide = { ms: r.ms, aiSource: r.body.aiSource, warning: r.body.warning, guide: g };
    expect(r.body.aiSource).toBe('ai');
    expect(g.isMock).toBe(false);
    expect(g.reportId).toBe(reportId);
    expect(g.vibeAnalysisId).toBe(vibeId);
    // 다시 읽어도 같은 계약
    const again = await call('/api/guide/guides/' + g.id);
    expect(VibeGuideSchema.parse(again.body).id).toBe(g.id);
  });

  it('분석 불가 사진 → 같은 이름 검색 사진에서 골라 분석', async () => {
    // 흑백으로 바꾼 사진: 서버 통계만으로도 분석 불가여야 한다
    const sharp = (await import('sharp')).default;
    const buf = await sharp(path.join(DEMO, 'look-b.jpg')).grayscale().jpeg().toBuffer();
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), 'gray.jpg');
    form.set('kind', 'vibe');
    const up = UploadRecordSchema.parse((await call('/api/uploads', { method: 'POST', body: form })).body);
    const pre = await call<{ analyzability: unknown }>('/api/vibe/precheck', post({ uploadId: up.id }));
    const a = AnalyzabilitySchema.parse(pre.body.analyzability);
    log.fallback = { precheck: a };
    expect(a.analyzable).toBe(false);

    // 같은 이름으로 검색 → 인물 확정 → 대표 사진 수집 → 분석 가능한 사진 하나로 분석
    const s = await call<{ candidates: { name: string }[]; isMock: boolean; imageProvider: string }>('/api/celeb/search?q=' + encodeURIComponent('데모 모델'));
    expect(s.status).toBe(200);
    expect(s.body.candidates.length).toBeGreaterThan(0);
    const c = await call<{ celeb: { id: string; name: string } }>('/api/celeb/celebs', post({ candidate: s.body.candidates[0] }));
    expect(c.status).toBe(200);
    const imgs = await call<{ images: { id: string; cached?: { uploadId?: string }; analyzable: boolean | null; provider: string }[]; isMock: boolean }>(
      `/api/celeb/celebs/${c.body.celeb.id}/images`,
      post({ category: 'signature' }),
    );
    expect(imgs.status).toBe(200);
    const pick = imgs.body.images.find((i) => i.cached?.uploadId);
    expect(pick).toBeTruthy();
    const r = await call<{ analysis: unknown }>(
      '/api/vibe/analyze',
      post({ uploadId: pick!.cached!.uploadId, celebName: c.body.celeb.name, celebId: c.body.celeb.id, celebImageId: pick!.id }),
    );
    expect(r.status).toBe(200);
    const v = VibeAnalysisSchema.parse(r.body.analysis);
    log.fallback = {
      precheck: a,
      search: { candidates: s.body.candidates.length, isMock: s.body.isMock, imageProvider: s.body.imageProvider },
      celeb: c.body.celeb.name,
      images: imgs.body.images.map((i) => ({ id: i.id, provider: i.provider, uploadId: i.cached?.uploadId })),
      picked: { analysisId: v.id, analyzable: v.analyzability.analyzable, source: v.source, isMock: v.isMock, lookName: v.lookName, summary: v.outfit.summary },
    };
  });

  it.runIf(!!OUT)('응답 요지 저장', () => {
    fs.writeFileSync(OUT!, JSON.stringify(log, null, 2));
  });
}, 600_000);
