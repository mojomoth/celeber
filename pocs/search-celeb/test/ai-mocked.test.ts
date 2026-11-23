/**
 * AI 응답을 고정해 검색/식별 결과를 확인한다 (임시 DB, 외부 호출 없음).
 * 검증 이슈 재현: '김민수' 동명이인 4명, 사진 속 글자로 후보를 찾았는데 역이미지 사유(키 이름)가 함께 나오던 문제.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-search-celeb-ai-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

vi.mock('@celeber/core/server/ai', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@celeber/core/server/ai')>();
  return {
    ...orig,
    callTextStructured: vi.fn(async (o: { label?: string }) => {
      if (o.label === 'search-celeb/name-candidates')
        return {
          source: 'ai',
          data: {
            candidates: [
              { name: '김민수', nameEn: 'Kim Min-su', description: '코미디언 · 피식대학', confidence: 0.5 },
              { name: '김민수', nameEn: 'Kim Min-su', description: '배우 · 압구정 백야', confidence: 0.3 },
              { name: '김민수', nameEn: 'Kim Min-soo', description: '가수 · 먼데이 키즈', confidence: 0.3 },
              { name: '김민수', nameEn: 'Kim Min-soo', description: '전 농구선수 · 서울 SK', confidence: 0.2 },
            ],
          },
        };
      return { source: 'mock', data: { names: [] } };
    }),
    callVisionStructured: vi.fn(async () => ({
      source: 'ai',
      data: { visibleTexts: ['아이유'], nameTexts: [{ text: '아이유', where: '하단 자막' }], personCount: 1, framing: 'upper-body', note: '상반신 사진입니다.' },
    })),
  };
});

const server = await import('../src/server');
const uploads = await import('@celeber/core/server/uploads');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('AI 응답 고정', () => {
  it("'김민수' 검색: 동명이인 4명이 각각 후보로 나오고, 입력 이름 후보는 따로 붙지 않는다", async () => {
    const r = await server.searchCelebCandidates('김민수');
    expect(r.candidates.map((c) => c.description)).toEqual(['코미디언 · 피식대학', '배우 · 압구정 백야', '가수 · 먼데이 키즈', '전 농구선수 · 서울 SK']);
  });
  it('사진 속 글자로 후보를 찾으면 역이미지 사유 대신 "글자만 확인" 안내, 키 이름 노출 없음', async () => {
    const png = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#a0a0a0' } }).png().toBuffer();
    const rec = await uploads.saveUpload(png, { kind: 'celeb' });
    const r = (await server.identifyFromPhoto(rec.id))!;
    expect(r.reverse.status).toBe('unavailable');
    expect(r.needsNameSearch).toBe(false);
    expect(r.candidates[0]).toMatchObject({ name: '아이유', source: 'photo-text' });
    expect(r.notices).toEqual(['사진 검색을 쓸 수 없어 사진 속 글자만 확인했습니다.']);
  });
});
