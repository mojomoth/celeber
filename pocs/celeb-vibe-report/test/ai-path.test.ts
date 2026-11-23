/**
 * AI 경로 (외부 호출 없음): callVisionStructured를 가짜 'ai' 결과로 바꿔 병합·저장·출처 표시를 확인한다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { GuideAi } from '../src/lib/ai';
import { buildReport } from './helpers';

const calls: { label?: string; images?: unknown[]; prompt: string }[] = [];

vi.mock('@celeber/core/server/ai', async (orig) => {
  const real = await orig<typeof import('@celeber/core/server/ai')>();
  return {
    ...real,
    callVisionStructured: async (opts: { label?: string; images?: unknown[]; prompt: string; mock: unknown }) => {
      calls.push({ label: opts.label, images: opts.images, prompt: opts.prompt });
      const mock = typeof opts.mock === 'function' ? await (opts.mock as () => unknown)() : opts.mock;
      if (opts.label !== 'celeb-vibe-report/guide') return { data: mock, source: 'mock', model: 'test', warning: '데모' };
      const base = mock as GuideAi;
      const ai: GuideAi = {
        ...base,
        summary: '니트의 질감은 살리고 색만 세이지로 옮기면 됩니다.',
        hair: [{ title: '가르마', detail: '옆 가르마로 이마를 조금 드러내세요.' }],
        actions: [
          { difficulty: 'hard', area: 'face', title: '헤어 톤 다운', detail: '애쉬 브라운으로' },
          { difficulty: 'easy', area: 'outfit', title: '실버 귀걸이', detail: '골드 대신' },
        ],
        doNotCopy: [{ element: '머스타드 머플러', reason: '얼굴이 노래 보임', alternative: '라벤더 머플러' }],
      };
      return { data: ai, source: 'ai', model: 'claude-opus-5-5' };
    },
  };
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeb-vibe-report-ai-'));
process.env.CELEBER_DATA_DIR = tmp;
delete process.env.CELEBER_FORCE_MOCK;

const { saveUpload } = await import('@celeber/core/server/uploads');
const db = await import('@celeber/core/server/db');
const { analyzeVibe } = await import('@celeber/celeb-vibe/server');
const server = await import('../src/server');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('AI 서술 경로', () => {
  it('source=hybrid, isMock=false, AI 서술 병합 + 계산값 유지 + 연예인 사진 첨부', async () => {
    const report = buildReport({ id: db.newId('pcr') });
    db.personalColorReports.insert({ id: report.id, data: report, cols: { tone: report.type.tone, season: report.type.season, is_mock: report.isMock, face_session_id: report.faceSessionId } });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#E7E4DF"/><rect x="180" y="250" width="240" height="250" fill="#D4A017"/></svg>`;
    const rec = await saveUpload(await sharp(Buffer.from(svg)).jpeg().toBuffer(), { kind: 'vibe' });
    const { analysis } = await analyzeVibe({ uploadId: rec.id, celebName: '윤하람' });

    const r = await server.generateVibeGuide({ reportId: report.id, vibeAnalysisId: analysis.id });
    expect(r.aiSource).toBe('ai');
    expect(r.guide.source).toBe('hybrid');
    expect(r.guide.isMock).toBe(false);
    expect(r.guide.summary).toContain('세이지');
    expect(r.guide.face.hair.map((h) => h.title)).toContain('가르마');
    expect(r.guide.actions.map((a) => [a.priority, a.title])).toEqual([
      [1, '실버 귀걸이'],
      [2, '헤어 톤 다운'],
    ]);
    expect(r.guide.doNotCopy.map((d) => d.element)).toContain('머스타드 머플러');
    expect(r.guide.gaps.length).toBe(7);

    const call = calls.find((c) => c.label === 'celeb-vibe-report/guide')!;
    expect(call.images).toEqual([{ uploadId: rec.id, label: '연예인 룩 사진' }]);
    expect(call.prompt).toContain('substitutions');
    expect(call.prompt).not.toContain('윤하람');
  });
});
