/**
 * 실제 서버 입출력 검증 (평소에는 건너뜀).
 * dev 서버(키 있는 실제 모드)를 띄운 뒤 실행한다. 실제 AI를 호출하므로 비용이 든다.
 *   CELEBER_LIVE_URL=http://localhost:3103 pnpm --filter @celeber/search-celeb exec vitest run test/live-http.test.ts
 * CELEBER_LIVE_OUT=<파일>을 주면 응답 요지를 JSON으로 남긴다. 이 테스트가 새로 만든 인물만 끝에 지운다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { CelebCandidateSchema, CelebImageSchema, CelebProfileSchema, ImageRefSchema, UploadRecordSchema } from '@celeber/core/contracts';
import type { CelebDetailResponse, CollectImagesResponse, IdentifyResponse, SearchResponse } from '../src/lib/types';

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
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function upload(buf: Buffer, name: string) {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), name);
  form.set('kind', 'celeb');
  const r = await call('/api/uploads', { method: 'POST', body: form });
  expect(r.status).toBe(200);
  return UploadRecordSchema.parse(r.body);
}

/** 데모 사진 아래쪽에 자막 두 줄을 얹는다 (사진 속 글자 → 후보 경로 확인용, 가상 인물) */
async function captioned(): Promise<Buffer> {
  const src = sharp(path.join(DEMO, 'look-a.jpg'));
  const { width = 700, height = 1940 } = await src.metadata();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="0" y="${height - 150}" width="${width}" height="150" fill="#141414"/>
    <text x="30" y="${height - 90}" font-family="Helvetica, Arial, sans-serif" font-size="42" fill="#fff">Actor Yoon Haram, airport</text>
    <text x="30" y="${height - 35}" font-family="Helvetica, Arial, sans-serif" font-size="42" fill="#ddd">@haram.yoon_official</text></svg>`;
  return src.composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toBuffer();
}

const checkCandidates = (list: unknown[]) => list.forEach((c) => CelebCandidateSchema.parse(c));

describe.skipIf(!BASE)('실제 서버 입출력 (CELEBER_LIVE_URL)', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await call(`/api/celeb/celebs/${id}`, { method: 'DELETE' });
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  });

  it('health: 실제 모드, AI 사용 가능', async () => {
    const r = await call<{ capabilities: Record<string, unknown> }>('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.capabilities.forceMock).toBe(false);
    expect(r.body.capabilities.ai).toBe(true);
    log.healthBefore = r.body.capabilities;
  });

  it('이름 검색: AI 후보, 계약 통과', async () => {
    const r = await call<SearchResponse>(`/api/celeb/search?q=${encodeURIComponent('아이유')}`);
    expect(r.status).toBe(200);
    expect(r.body.origin).toBe('ai');
    checkCandidates(r.body.candidates);
    expect(r.body.candidates[0]).toMatchObject({ name: '아이유', source: 'name-search' });
    log.searchIu = { ms: r.ms, origin: r.body.origin, isMock: r.body.isMock, candidates: r.body.candidates.map((c) => [c.name, c.nameEn, c.description, c.score]) };
  }, 240_000);

  it('이름 검색: 영문 입력은 AI 후보의 영문명과 합쳐진다', async () => {
    const r = await call<SearchResponse>('/api/celeb/search?q=Jennie');
    expect(r.body.origin).toBe('ai');
    checkCandidates(r.body.candidates);
    const top = r.body.candidates[0];
    expect(top.nameEn?.toLowerCase()).toBe('jennie');
    expect(r.body.candidates.filter((c) => c.name.toLowerCase() === 'jennie' && c.name !== top.name)).toEqual([]);
    log.searchJennie = r.body.candidates.map((c) => [c.name, c.nameEn, c.description, c.score]);
  }, 240_000);

  it('이름 검색: 없는 이름은 입력 이름만 (인물을 지어내지 않음)', async () => {
    const r = await call<SearchResponse>(`/api/celeb/search?q=${encodeURIComponent('쀍뷁뚥')}`);
    expect(r.body.origin).toBe('ai');
    expect(r.body.candidates.map((c) => c.name)).toEqual(['쀍뷁뚥']);
  }, 240_000);

  it('사진으로 찾기 (글자 없음): 구도·인원·글자만 읽고 얼굴로 이름을 대지 않는다', async () => {
    const up = await upload(fs.readFileSync(path.join(DEMO, 'look-b.jpg')), 'look-b.jpg');
    const r = await call<IdentifyResponse>('/api/celeb/identify', json('POST', { uploadId: up.id }));
    expect(r.status).toBe(200);
    ImageRefSchema.parse(r.body.upload);
    checkCandidates(r.body.candidates);
    expect(r.body.photoText.origin).toBe('ai');
    expect(r.body.photoCheck).toMatchObject({ origin: 'ai', framing: 'full-body', personCount: 1 });
    expect(r.body.photoText.texts.join(' ')).toMatch(/Y-?3/i);
    // 역이미지 검색 키가 없으므로 실제 후보는 없어야 한다 (데모 후보만)
    expect(r.body.candidates.every((c) => c.source === 'mock')).toBe(true);
    expect(r.body.needsNameSearch).toBe(true);
    log.identifyPlain = { ms: r.ms, reverse: r.body.reverse, photoText: r.body.photoText, photoCheck: r.body.photoCheck };
  }, 240_000);

  it('사진으로 찾기 (자막 있음): 사진 속 글자에서 후보', async () => {
    const up = await upload(await captioned(), 'captioned.jpg');
    const r = await call<IdentifyResponse>('/api/celeb/identify', json('POST', { uploadId: up.id }));
    expect(r.status).toBe(200);
    checkCandidates(r.body.candidates);
    const fromText = r.body.candidates.filter((c) => c.source === 'photo-text');
    expect(fromText.map((c) => c.name).join(' ')).toMatch(/haram/i);
    expect(r.body.needsNameSearch).toBe(false);
    expect(r.body.isMock).toBe(false);
    log.identifyCaption = { ms: r.ms, texts: r.body.photoText.texts, photoCheck: r.body.photoCheck, candidates: r.body.candidates.map((c) => [c.name, c.source, c.evidence[0]]) };
  }, 240_000);

  it('확정 → 대표 사진 수집 → 선택 → 상세: 계약 통과', async () => {
    const s = await call<SearchResponse>(`/api/celeb/search?q=${encodeURIComponent('차은우')}`);
    const { celebId, saved, ...candidate } = s.body.candidates[0];
    void saved;
    const c = await call<{ celeb: unknown }>('/api/celeb/celebs', json('POST', { candidate }));
    expect(c.status).toBe(200);
    const celeb = CelebProfileSchema.parse(c.body.celeb);
    if (!celebId) created.push(celeb.id);
    expect(celeb.name).toBe('차은우');

    const col = await call<CollectImagesResponse>(`/api/celeb/celebs/${celeb.id}/images`, json('POST', { category: 'signature' }));
    expect(col.status).toBe(200);
    col.body.images.forEach((im) => CelebImageSchema.parse(im));
    expect(col.body.images.length).toBeGreaterThan(0);
    expect(col.body.queries[0]).toContain('차은우');

    const first = col.body.images[0];
    const sel = await call<{ image: unknown }>(`/api/celeb/images/${first.id}`, json('PATCH', { selected: true }));
    expect(CelebImageSchema.parse(sel.body.image).selected).toBe(true);

    const d = await call<CelebDetailResponse>(`/api/celeb/celebs/${celeb.id}`);
    CelebProfileSchema.parse(d.body.celeb);
    for (const cat of ['signature', 'recent', 'daily'] as const) d.body.images[cat].forEach((im) => CelebImageSchema.parse(im));
    expect(d.body.images.signature.find((im) => im.id === first.id)?.selected).toBe(true);
    log.collect = { provider: col.body.provider, judge: col.body.judge, added: col.body.added, queries: col.body.queries, isMock: col.body.isMock };
  }, 240_000);

  it('health: 호출 뒤 공급자 상태', async () => {
    const r = await call<{ capabilities: Record<string, unknown> }>('/api/health');
    expect(r.body.capabilities.ai).toBe(true);
    log.healthAfter = r.body.capabilities;
  });
});
