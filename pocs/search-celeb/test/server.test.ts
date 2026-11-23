/**
 * 서버 함수 통합 테스트 (Mock 모드, 임시 DB). 외부 네트워크/AI 호출 없음.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-search-celeb-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

const server = await import('../src/server');
const routes = await import('../src/routes');
const uploads = await import('@celeber/core/server/uploads');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('이름 검색 (Mock)', () => {
  it('데모 인물 부분 일치 + 입력 이름 후보, 썸네일은 서버 캐시 URL', async () => {
    const r = await server.searchCelebCandidates('하람');
    expect(r.isMock).toBe(true);
    expect(r.origin).toBe('mock');
    const names = r.candidates.map((c) => c.name);
    expect(names).toContain('윤하람');
    expect(names).toContain('하람');
    for (const c of r.candidates) expect(c.thumbnailUrl).toMatch(/^\/api\/uploads\/up_/);
  });
  it('자동완성: 데모 인물', () => {
    expect(server.suggestCelebs('서지').items.map((i) => i.name)).toContain('서지온');
    expect(server.suggestCelebs('').items).toEqual([]);
  });
});

describe('확정 → 사진 수집 → 선택 → 저장 → 삭제', () => {
  let celebId = '';
  it('후보 확정 시 celebs에 저장되고 같은 이름은 재사용', async () => {
    const s = await server.searchCelebCandidates('윤하람');
    const cand = s.candidates.find((c) => c.name === '윤하람')!;
    const { celebId: _x, saved: _y, ...candidate } = cand;
    void _x;
    void _y;
    const p = await server.confirmCandidate(candidate);
    celebId = p.id;
    expect(p.id).toMatch(/^celeb_/);
    expect(p.isMock).toBe(true);
    expect(p.thumbnail?.url).toMatch(/^\/api\/uploads\//);
    const again = await server.confirmCandidate({ ...candidate, nameEn: 'Haram' });
    expect(again.id).toBe(celebId);
    expect(server.findCelebByName('윤 하람')?.id).toBe(celebId);
    expect(server.searchCelebCandidates).toBeTypeOf('function');
  });

  it('카테고리별 전신 사진 수집 (데모 이미지 캐시, 전신 판정, 결과 캐시)', async () => {
    for (const cat of ['signature', 'recent', 'daily'] as const) {
      const r = (await server.collectCelebImages(celebId, cat))!;
      expect(r.provider).toBe('mock');
      expect(r.isMock).toBe(true);
      expect(r.images.length).toBeGreaterThanOrEqual(3);
      for (const im of r.images) {
        expect(im.category).toBe(cat);
        expect(im.cached?.url).toMatch(/^\/api\/uploads\//);
        expect(im.sourceUrl).toMatch(/^mock:\/\/celeb\//);
        expect(im.isFullBody).toBe(true);
        // 데모 실루엣(SVG)은 미리 분석 불가, 래스터 데모 사진은 분석 가능
        const silhouette = im.reasons.some((x) => x.message.includes('데모 실루엣'));
        expect(im.analyzable).toBe(!silhouette);
      }
      // 키 없이도 카테고리마다 분석 가능한 래스터 사진이 최소 1장
      expect(r.images.filter((i) => i.analyzable === true).length).toBeGreaterThanOrEqual(1);
      // 두 번째 호출은 저장된 것을 그대로 (target 충족 시) 또는 새 이미지 없이
      const r2 = (await server.collectCelebImages(celebId, cat))!;
      expect(r2.images.map((i) => i.id)).toEqual(r.images.map((i) => i.id));
    }
    const d = server.getCelebDetail(celebId)!;
    expect(d.images.signature.length).toBeGreaterThan(0);
    expect(d.images.recent.length).toBeGreaterThan(0);
    expect(d.images.daily.length).toBeGreaterThan(0);
  });

  it('사진 선택 + refresh는 선택한 사진을 유지', async () => {
    const d = server.getCelebDetail(celebId)!;
    const pick = d.images.signature[0];
    expect(server.setImageSelected(pick.id, true)?.selected).toBe(true);
    const r = (await server.collectCelebImages(celebId, 'signature', { refresh: true }))!;
    expect(r.images.some((i) => i.id === pick.id && i.selected)).toBe(true);
    expect(server.selectedImages(celebId).map((i) => i.id)).toEqual([pick.id]);
  });

  it('저장 토글과 목록', () => {
    expect(server.setCelebSaved(celebId, true)?.saved).toBe(true);
    const saved = server.listCelebSummaries({ saved: true });
    expect(saved[0].celeb.id).toBe(celebId);
    expect(saved[0].selectedCount).toBe(1);
    expect(server.listCelebSummaries({ saved: false })).toHaveLength(0);
    expect(server.suggestCelebs('윤하').items[0]).toMatchObject({ celebId, saved: true });
  });

  it('Route Handler: 목록/상세/선택/검증 오류', async () => {
    const ctx = { params: Promise.resolve({ id: celebId }) };
    const list = await (await routes.celebsGET(new Request('http://x/api/celeb/celebs?saved=1'))).json();
    expect(list.items).toHaveLength(1);
    const detail = await routes.celebGET(new Request('http://x'), ctx);
    expect(detail.status).toBe(200);
    const bad = await routes.celebImagesPOST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'nope' }) }), ctx);
    expect(bad.status).toBe(400);
    const empty = await routes.searchGET(new Request('http://x/api/celeb/search?q='));
    expect(empty.status).toBe(400);
    const missing = await routes.celebGET(new Request('http://x'), { params: Promise.resolve({ id: 'celeb_nope' }) });
    expect(missing.status).toBe(404);
  });

  it('삭제 시 사진 기록도 함께 지운다', () => {
    const n = server.listCelebImages(celebId).length;
    expect(server.deleteCeleb(celebId)).toEqual({ deleted: true, images: n });
    expect(server.getCelebDetail(celebId)).toBeNull();
    expect(server.listCelebImages(celebId)).toHaveLength(0);
  });
});

describe('동명이인 확정과 DB 연결', () => {
  const descs = ['코미디언 · 피식대학', '배우 · 압구정 백야', '가수 · 먼데이 키즈', '전 농구선수 · 서울 SK'];
  const cand = (description?: string) => ({ name: '김민수', nameEn: 'Kim Min-su', description, source: 'name-search' as const, score: 0.5, evidence: ['test'] });
  it('이름이 같아도 설명이 다르면 다른 인물로 저장하고, 같은 설명은 재사용', async () => {
    const ids: string[] = [];
    for (const d of descs) ids.push((await server.confirmCandidate(cand(d))).id);
    expect(new Set(ids).size).toBe(4);
    expect((await server.confirmCandidate(cand('배우·압구정 백야'))).id).toBe(ids[1]);
    // 설명 없이 이름만으로는 누구인지 알 수 없다
    expect(server.findCelebByName('김민수')).toBeNull();
    expect(server.findCelebByName('김민수', '가수 · 먼데이 키즈')?.id).toBe(ids[2]);
  });
  it('후보 목록의 동명이인마다 맞는 인물을 붙인다', async () => {
    const { attachCelebIds } = await import('../src/server/celebs');
    const r = attachCelebIds([...descs.map((d) => cand(d)), cand('뮤지컬 배우')]);
    const byDesc = new Map(r.map((x) => [x.description, x.celebId]));
    expect(new Set(descs.map((d) => byDesc.get(d))).size).toBe(4);
    expect(byDesc.get('뮤지컬 배우')).toBeUndefined();
  });
  it('설명 없는 인물이 하나뿐이면 설명이 생겼을 때 그 인물에 채운다', async () => {
    const a = await server.confirmCandidate({ ...cand(undefined), name: '박하늘' });
    const b = await server.confirmCandidate({ ...cand('배우'), name: '박하늘' });
    expect(b.id).toBe(a.id);
    expect(b.description).toBe('배우');
    const c = await server.confirmCandidate({ ...cand('가수'), name: '박하늘' });
    expect(c.id).not.toBe(a.id);
  });
  it('사진 글자처럼 설명 없는 이름은 설명이 있는 동명이인에 자동으로 붙이지 않는다', async () => {
    const { attachCelebIds } = await import('../src/server/celebs');
    const player = await server.confirmCandidate({ ...cand('야구선수 · 한화'), name: '이민호' });
    const caption = { name: '이민호', source: 'photo-text' as const, score: 0.55, evidence: ['사진 속 글자에서 읽음 (하단 자막)'] };
    expect(attachCelebIds([caption])[0].celebId).toBeUndefined();
    const fromCaption = await server.confirmCandidate(caption);
    expect(fromCaption.id).not.toBe(player.id);
    expect((await server.confirmCandidate(caption)).id).toBe(fromCaption.id);
    expect(attachCelebIds([caption])[0].celebId).toBe(fromCaption.id);
    // 자동완성: DB의 두 사람을 하나로 합치지 않고, 설명도 섞지 않는다
    const items = server.suggestCelebs('이민호').items;
    expect(items.map((i) => i.celebId).sort()).toEqual([player.id, fromCaption.id].sort());
    expect(items.find((i) => i.celebId === fromCaption.id)?.description).toBeUndefined();
  });
});

describe('사진으로 찾기 (Mock: 얼굴 인식 없음)', () => {
  it('역이미지 검색 불가 → 데모 후보 + 이름 검색 안내', async () => {
    const png = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#c8b8a8' } }).png().toBuffer();
    const rec = await uploads.saveUpload(png, { kind: 'celeb' });
    const r = (await server.identifyFromPhoto(rec.id))!;
    expect(r.reverse.status).toBe('unavailable');
    expect(r.needsNameSearch).toBe(true);
    expect(r.isMock).toBe(true);
    expect(r.candidates.every((c) => c.source === 'mock')).toBe(true);
    expect(r.notices.join(' ')).toContain('이름으로 검색');
    // 환경변수 이름은 화면 문구에 내보내지 않는다
    expect(r.notices.join(' ')).not.toMatch(/SERPAPI|CELEBER_|API_KEY/);
    expect(r.photoCheck.origin).toBe('rules');
    expect(r.photoCheck.note).toContain('세로 사진');
    expect(await server.identifyFromPhoto('up_missing')).toBeNull();
  });
});
