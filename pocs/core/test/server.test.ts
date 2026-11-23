import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-test-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

const db = await import('../src/server/db');
const uploads = await import('../src/server/uploads');
const fetchImage = await import('../src/server/fetch-image');
const ai = await import('../src/server/ai');
const env = await import('../src/server/env');
const search = await import('../src/server/search');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('SQLite (node:sqlite)', () => {
  beforeAll(() => db.getDb());
  it('마이그레이션으로 모든 PoC 테이블 생성', () => {
    const h = db.dbHealth();
    expect(h.ok).toBe(true);
    expect(h.roundTrip).toBe(true);
    for (const t of ['uploads', 'face_sessions', 'body_sessions', 'celebs', 'celeb_images', 'vibe_analyses', 'personal_color_reports', 'vibe_guides', 'search_cache', 'kv'])
      expect(Object.keys(h.tables)).toContain(t);
    expect(h.schemaVersion).toBe(1);
  });
  it('JSON repo: insert/get/list/update/delete + zod 검증', () => {
    const now = new Date().toISOString();
    const id = db.celebs.insert({
      data: { id: 'x', createdAt: now, updatedAt: now, name: '윤하람', aliases: [], saved: false, source: 'mock', isMock: true },
      cols: { name: '윤하람', name_key: db.normalizeNameKey('윤하람'), saved: false, is_mock: true },
    });
    expect(id).toMatch(/^celeb_/);
    expect(db.celebs.get(id)?.name).toBe('윤하람');
    expect(db.celebs.list({ where: { name_key: '윤하람' } })).toHaveLength(1);
    expect(db.celebs.update(id, { cols: { saved: true } })).toBe(true);
    expect(db.celebs.getRow(id)?.cols.saved).toBe(1);
    expect(db.celebs.count({ saved: 1 })).toBe(1);
    // 소수·NaN limit/offset은 정수로 고정 (SQLite datatype mismatch 방지)
    expect(db.celebs.list({ limit: 1.5, offset: 0.5 })).toHaveLength(1);
    expect(db.celebs.list({ limit: Number.NaN })).toHaveLength(1);
    // 허용되지 않은 컬럼은 거부 (SQL 인젝션 방지)
    expect(() => db.celebs.list({ where: { 'name; DROP TABLE celebs': 1 } as never })).toThrow();
    // 스키마 위반 데이터는 거부
    expect(() => db.celebs.insert({ data: { bad: true } as never })).toThrow();
    expect(db.celebs.delete(id)).toBe(true);
    expect(db.celebs.get(id)).toBeNull();
  });
  it('kv / search cache', () => {
    db.kvSet('k', { a: 1 });
    expect(db.kvGet<{ a: number }>('k')?.a).toBe(1);
    db.cacheSet('c', 'mock', [1, 2], 60);
    expect(db.cacheGet<number[]>('c')).toEqual([1, 2]);
    db.cacheSet('expired', 'mock', [1], -1);
    expect(db.cacheGet('expired')).toBeNull();
  });
});

describe('uploads', () => {
  it('저장 → 중복 제거 → 서빙', async () => {
    const png = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#E3BBA6' } }).png().toBuffer();
    const a = await uploads.saveUpload(png, { kind: 'face-front' });
    const b = await uploads.saveUpload(png, { kind: 'face-front' });
    expect(a.id).toBe(b.id);
    expect(a.width).toBe(40);
    expect(a.url).toBe(`/api/uploads/${a.id}`);
    const res = uploads.serveUpload(a.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(uploads.serveUpload('../../etc/passwd').status).toBe(404);
    const px = await uploads.readUploadPixels(a.id);
    expect(px?.width).toBe(40);
    expect(px?.data[0]).toBeGreaterThan(200);
  });
  it('이미지가 아니면 거부', async () => {
    await expect(uploads.saveUpload(Buffer.from('hello world, not an image'), { kind: 'other' })).rejects.toThrow();
  });
  it('data URL (SVG Mock) 저장', async () => {
    const r = await fetchImage.cacheRemoteImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'));
    expect(r.mime).toBe('image/svg+xml');
  });
});

describe('업로드 오류는 한국어 문구와 맞는 상태코드로', () => {
  const post = (file: Blob, kind?: string, name = 'a.bin') => {
    const fd = new FormData();
    fd.set('file', file, name);
    if (kind) fd.set('kind', kind);
    return uploads.handleUploadPost(new Request('http://x/api/uploads', { method: 'POST', body: fd }));
  };
  const errorOf = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error;
  const HANGUL = /[가-힣]/;
  const TRUNC_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="10" height="10"/><g';

  it('픽셀 상한(40MP) 초과는 422 too_many_pixels + 한국어 (413/용량 문구와 구분)', async () => {
    const png = await sharp({ create: { width: 9000, height: 5000, channels: 3, background: '#888' } }).png().toBuffer();
    const r = await post(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    expect(r.status).toBe(422);
    const e = await errorOf(r);
    expect(e.code).toBe('too_many_pixels');
    expect(e.message).toContain('4000만 화소');
    expect(e.message).not.toMatch(/pixel limit|너무 큽니다/);
  });
  it('깨진 SVG는 저장 단계에서 422 unreadable (분석 단계 500으로 넘어가지 않음)', async () => {
    const r = await post(new Blob([TRUNC_SVG], { type: 'image/svg+xml' }));
    expect(r.status).toBe(422);
    const e = await errorOf(r);
    expect(e.code).toBe('unreadable');
    expect(e.message).toMatch(HANGUL);
    expect(e.message).not.toMatch(/glib|XML|corrupt/i);
  });
  it.each(['face-front', 'face-side', 'environment'])('%s에는 정상 SVG도 거부', async (kind) => {
    const r = await post(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: 'image/svg+xml' }), kind);
    expect(r.status).toBe(422);
    expect((await errorOf(r)).code).toBe('svg_not_allowed');
  });
  it('디코드할 수 없는 HEIC는 HEIC 안내 (libheif 원문 없음)', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
    const r = await post(new Blob([new Uint8Array(heic)], { type: 'image/heic' }));
    expect(r.status).toBe(422);
    const e = await errorOf(r);
    expect(e.message).toContain('HEIC');
    expect(e.message).not.toMatch(/bad seek|plugin|heif:/);
  });
  it('이미지가 아니면 400 unsupported_type, 안내 형식은 JPEG·PNG·WebP만', async () => {
    const r = await post(new Blob(['hello world, not an image'], { type: 'text/plain' }));
    expect(r.status).toBe(400);
    const e = await errorOf(r);
    expect(e.code).toBe('unsupported_type');
    expect(e.message).toContain('지원하지 않는 이미지 형식');
    expect(e.message).not.toMatch(/HEIC|AVIF|GIF|SVG/);
  });
  it('25MB 초과 파일은 크기와 관계없이 같은 413 문구 (최대 25MB)', async () => {
    const big = new Uint8Array(uploads.MAX_UPLOAD_BYTES + 2 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    const r = await post(new Blob([big], { type: 'image/jpeg' }));
    expect(r.status).toBe(413);
    expect((await errorOf(r)).message).toBe(uploads.UPLOAD_MESSAGES.tooLarge);
    expect(uploads.UPLOAD_MESSAGES.tooLarge).toContain('최대 25MB');
  });
  it('본문이 잘린 multipart는 400 한국어 (런타임 FormData 원문 없음)', async () => {
    const body = '--XYZ\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n\xff\xd8\xff';
    const r = await uploads.handleUploadPost(new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=XYZ' }, body }));
    expect(r.status).toBe(400);
    const e = await errorOf(r);
    expect(e.code).toBe('upload_failed');
    expect(e.message).toMatch(/25MB/);
    expect(e.message).not.toMatch(/FormData/);
  });
  it('JSON 본문이 깨지면 400 invalid_json', async () => {
    const r = await uploads.handleUploadPost(new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' }));
    expect(r.status).toBe(400);
    expect((await errorOf(r)).code).toBe('invalid_json');
  });
  it('readUploadPixels: 저장 파일을 디코드할 수 없으면 예외 대신 null', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#123456' } }).png().toBuffer();
    const rec = await uploads.saveUpload(png, { kind: 'other' });
    fs.writeFileSync(path.join(uploads.uploadsDir(), `${rec.id}.png`), Buffer.from('broken'));
    await expect(uploads.readUploadPixels(rec.id)).resolves.toBeNull();
    await expect(uploads.readUploadPixels('up_missing')).resolves.toBeNull();
  });
  it('정상 SVG(목업)는 other/body kind로 그대로 저장', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"><rect width="40" height="80" fill="#ccc"/></svg>');
    expect((await uploads.saveUpload(svg, { kind: 'body' })).mime).toBe('image/svg+xml');
  });
});

describe('SSRF 방어', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.10', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0'])('%s 차단', (ip) => {
    expect(fetchImage.isPrivateIp(ip)).toBe(true);
  });
  it('공인 IP 허용', () => {
    expect(fetchImage.isPrivateIp('8.8.8.8')).toBe(false);
    expect(fetchImage.isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });
  it.each(['file:///etc/passwd', 'http://localhost/x.png', 'http://user:pw@example.com/a.jpg', 'http://example.com:8080/a.jpg', 'http://169.254.169.254/latest', 'gopher://x'])('%s 거부', (u) => {
    expect(() => fetchImage.assertSafeUrl(u)).toThrow();
  });
  it('사설 주소로 해석되는 호스트는 연결 단계에서 차단', async () => {
    await expect(fetchImage.fetchImageSafe('http://localtest.me/a.png', { timeoutMs: 3000 })).rejects.toThrow();
  });
});

describe('AI 클라이언트 Mock 폴백', () => {
  it('키 없음/강제 Mock이면 mock 반환', async () => {
    expect(env.getCapabilities().ai).toBe(false);
    const r = await ai.callVisionStructured({ schema: z.object({ ok: z.boolean() }), mock: () => ({ ok: true }), prompt: 'test' });
    expect(r.source).toBe('mock');
    expect(r.data.ok).toBe(true);
  });
});

describe('검색 프로바이더 (Mock)', () => {
  it('Mock 이미지 검색은 결정적', async () => {
    const p = search.getImageSearchProvider();
    expect(p.id).toBe('mock');
    const a = await p.searchImages({ query: '윤하람 공항패션', count: 3 });
    const b = await p.searchImages({ query: '윤하람 공항패션', count: 3 });
    expect(a).toEqual(b);
    expect(a[0].imageUrl.startsWith('data:image/svg+xml')).toBe(true);
  });
  it('역이미지 검색은 unavailable + 이름 검색 안내', async () => {
    const r = await search.reverseImageSearch({ uploadId: 'up_x' });
    expect(r.status).toBe('unavailable');
    expect(r.reason).toContain('이름');
  });
  it('전신 메타 필터', () => {
    expect(search.isLikelyFullBody({ width: 600, height: 900 })).toBe(true);
    expect(search.isLikelyFullBody({ width: 900, height: 600 })).toBe(false);
  });
});

describe('Mock 이미지 검색: 데모 래스터 사진', () => {
  it('카테고리마다 래스터 전신 사진 1장을 섞는다 (실루엣만이면 분석 흐름을 시연할 수 없음)', async () => {
    const { mockImageProvider } = await import('../src/server/search/mock');
    for (const q of ['윤하람 화보 전신', '윤하람 2026 공항패션', '윤하람 사복 일상']) {
      const r = await mockImageProvider.searchImages({ query: q, count: 6 });
      const raster = r.filter((x) => x.imageUrl.startsWith('data:image/jpeg;base64,'));
      expect(raster.length).toBe(1);
      expect(raster[0].title).toContain('데모 사진');
      expect((raster[0].height ?? 0) / (raster[0].width ?? 1)).toBeGreaterThan(1.25);
      expect(r.length).toBe(6);
    }
  });
});

describe('접근 제어 (터널 노출·localhost CSRF)', () => {
  const req = (method: string, url: string, h: Record<string, string> = {}) => ({ method, url, headers: new Headers(h) });
  it('localhost는 허용, 다른 Host는 토큰 없으면 403', async () => {
    const { decideAccess } = await import('../src/server/access');
    expect(decideAccess(req('GET', 'http://localhost:3105/api/report/reports', { host: 'localhost:3105' }), {}).ok).toBe(true);
    expect(decideAccess(req('GET', 'http://127.0.0.1:3105/', { host: '127.0.0.1:3105' }), {}).ok).toBe(true);
    const remote = decideAccess(req('GET', 'https://abc.trycloudflare.com/api/face/sessions', { host: 'abc.trycloudflare.com' }), {});
    expect(remote.ok).toBe(false);
    const withToken = decideAccess(req('GET', 'https://abc.trycloudflare.com/api/face/sessions', { host: 'abc.trycloudflare.com', cookie: 'celeber_access=s3cret' }), { token: 's3cret' });
    expect(withToken.ok).toBe(true);
    const wrong = decideAccess(req('GET', 'https://abc.trycloudflare.com/', { host: 'abc.trycloudflare.com', 'x-celeber-access': 'nope' }), { token: 's3cret' });
    expect(wrong.ok).toBe(false);
    const q = decideAccess(req('GET', 'https://abc.trycloudflare.com/new?access=s3cret', { host: 'abc.trycloudflare.com' }), { token: 's3cret' });
    expect(q.ok && q.setCookie && q.redirectTo).toBe('/new');
  });
  it('공개 이미지 경로는 서명이 맞을 때만', async () => {
    const { decideAccess, signedPublicImagePath, verifyPublicImage } = await import('../src/server/access');
    const p = signedPublicImagePath('up_abc', 600, 1_800_000_000);
    expect(decideAccess(req('GET', `https://abc.example.com${p}`, { host: 'abc.example.com' }), {}).ok).toBe(true);
    const u = new URL(`https://x${p}`);
    expect(verifyPublicImage('up_abc', u.searchParams.get('exp'), u.searchParams.get('sig'), 1_800_000_000)).toBe(true);
    expect(verifyPublicImage('up_other', u.searchParams.get('exp'), u.searchParams.get('sig'), 1_800_000_000)).toBe(false);
    expect(verifyPublicImage('up_abc', u.searchParams.get('exp'), u.searchParams.get('sig'), 1_800_000_601)).toBe(false);
  });
  it('다른 사이트에서 온 상태 변경 요청은 거부, 같은 사이트(다른 포트 localhost)는 허용', async () => {
    const { decideAccess } = await import('../src/server/access');
    expect(decideAccess(req('POST', 'http://localhost:3104/api/vibe/analyze', { host: 'localhost:3104', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }), {}).ok).toBe(false);
    expect(decideAccess(req('POST', 'http://localhost:3104/api/vibe/analyze', { host: 'localhost:3104', origin: 'https://evil.example' }), {}).ok).toBe(false);
    expect(decideAccess(req('POST', 'http://localhost:3104/api/vibe/analyze', { host: 'localhost:3104', origin: 'null' }), {}).ok).toBe(false);
    expect(decideAccess(req('POST', 'http://localhost:3104/api/vibe/analyze', { host: 'localhost:3104', 'sec-fetch-site': 'same-site', origin: 'http://localhost:3100' }), {}).ok).toBe(true);
    expect(decideAccess(req('POST', 'http://localhost:3104/api/vibe/analyze', { host: 'localhost:3104' }), {}).ok).toBe(true);
  });
});

describe('업로드 본문 상한', () => {
  it('Content-Length가 상한을 넘으면 본문을 읽기 전에 413', async () => {
    const { handleUploadPost, MAX_UPLOAD_BODY_BYTES } = await import('../src/server/uploads');
    const r = await handleUploadPost(new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(MAX_UPLOAD_BODY_BYTES + 1) }, body: '{}' }));
    expect(r.status).toBe(413);
  });
  it('스트림이 상한을 넘으면 중단', async () => {
    const { readBodyCapped } = await import('../src/server/uploads');
    const big = new Uint8Array(2048);
    await expect(readBodyCapped(new Request('http://x', { method: 'POST', body: big }), 1024)).rejects.toThrow();
    expect((await readBodyCapped(new Request('http://x', { method: 'POST', body: big }), 4096)).byteLength).toBe(2048);
  });
});
