/**
 * AI 성공 경로 통합 테스트: callVisionStructured를 'ai' 결과로 대체해(실제 API는 호출하지 않음)
 * hybrid source, aiOpinion, 규칙·AI 일치도 신뢰도 요인, AI 서술 병합, 변형 전환 후 템플릿/복원을 확인한다.
 * (실 키가 사용 한도 초과라 실제 호출은 검증하지 못하므로, 앱 쪽 처리 로직만 결정적으로 검증)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FaceAnalysisSchema, PersonalColorReportSchema, type Tone } from '@celeber/core/contracts';
import { toneSeason } from '@celeber/core/personal-color';
import fixture from './fixtures/face-analysis.json';
import type { AiNarrative } from '../src/lib';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-pcr-ai-'));
process.env.CELEBER_DATA_DIR = tmp;
delete process.env.CELEBER_FORCE_MOCK;

const aiState: { tone: Tone | null; calls: { prompt: string; images: unknown[] }[] } = { tone: null, calls: [] };

vi.mock('@celeber/core/server/ai', () => ({
  callVisionStructured: async (opts: { schema: { parse: (v: unknown) => AiNarrative }; mock: () => AiNarrative; prompt: string; images: unknown[] }) => {
    aiState.calls.push({ prompt: opts.prompt, images: opts.images });
    const base = opts.mock();
    const data: AiNarrative = {
      ...base,
      independentTone: aiState.tone ?? base.independentTone,
      independentRationale: '목 주변 피부가 붉은 기를 띱니다.',
      firstImpression: ['AI 첫인상 1', 'AI 첫인상 2', 'AI 첫인상 3', 'AI 첫인상 4'],
      hashtags: ['차분한', '#지적'],
      topsTip: 'AI 셔츠 TIP',
      outerTip: 'AI 수트 TIP',
      grooming: ['AI 피부', 'AI 눈썹', 'AI 수염', 'AI 향수'],
      todayActions: ['AI 행동 1', 'AI 행동 2', 'AI 행동 3', 'AI 행동 4'],
    };
    return { data: opts.schema.parse(data), source: 'ai', model: 'claude-opus-5-5' };
  },
}));

type Routes = typeof import('../src/routes');
type Db = typeof import('@celeber/core/server/db');
type Lib = typeof import('../src/lib');
let R: Routes;
let D: Db;
let L: Lib;

beforeAll(async () => {
  R = await import('../src/routes');
  D = await import('@celeber/core/server/db');
  L = await import('../src/lib');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const json = (method: string, body?: unknown) => new Request('http://x/api', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function seedFace() {
  const a = FaceAnalysisSchema.parse(fixture);
  const analysis = { ...a, ai: { ...a.ai!, presentation: 'male' as const } };
  const id = D.newId('face');
  const now = D.nowIso();
  D.faceSessions.upsert({ id, data: { id, createdAt: now, updatedAt: now, status: 'complete', label: 'AI', analysis }, cols: { status: 'complete', is_mock: false, front_upload_id: a.front.image.uploadId, label: 'AI' } });
  return { id, analysis };
}

describe('AI 성공 경로 (hybrid)', () => {
  it('규칙과 같은 톤 → hybrid, aiOpinion 일치, 일치도 요인 1, AI 서술 반영, 사진 첨부', async () => {
    const { id, analysis } = seedFace();
    aiState.tone = L.classifyFace(analysis).tone;
    const g = await (await R.generatePOST(json('POST', { faceSessionId: id }))).json();
    expect(g.aiSource).toBe('ai');
    const r = PersonalColorReportSchema.parse(g.report);
    expect(r.source).toBe('hybrid');
    expect(r.isMock).toBe(false);
    expect(r.header.tool).toContain('AI 비전 (claude-opus-5-5)');
    expect(r.aiOpinion).toMatchObject({ tone: aiState.tone, agreesWithRules: true });
    const agree = r.confidence.factors.find((f) => f.key === 'rule-ai-agreement');
    expect(agree?.score).toBe(1);
    expect(r.firstImpression.bullets[0]).toBe('AI 첫인상 1');
    expect(r.firstImpression.hashtags).toEqual(['#차분한', '#지적']);
    expect(r.tops.tip).toBe('AI 셔츠 TIP');
    expect(r.grooming.items.map((x) => x.suggestion)).toEqual(['AI 피부', 'AI 눈썹', 'AI 수염', 'AI 향수']);
    expect(L.variantUsesTemplateNarrative(r)).toBe(false);
    const call = aiState.calls.at(-1)!;
    expect(call.images).toEqual([expect.objectContaining({ uploadId: analysis.front.image.uploadId })]);
    expect(call.prompt).toContain('featureContrast');
    expect(call.prompt).toContain('피부, 눈썹, 수염, 향수');

    // 다른 스타일로 바꾸면 성별 의존 서술은 템플릿 → 안내 표시 대상
    const fem = PersonalColorReportSchema.parse(await (await R.reportPATCH(json('PATCH', { gender: 'female' }), ctx(r.id))).json());
    expect(fem.tops.tip).not.toBe('AI 셔츠 TIP');
    expect(fem.grooming.items[0].key).toBe('base');
    expect(L.variantUsesTemplateNarrative(fem)).toBe(true);
    // 성별 무관 서술(첫인상)은 유지
    expect(fem.firstImpression.bullets[0]).toBe('AI 첫인상 1');

    // 원래 스타일로 되돌리면 AI 서술 복원
    const back = PersonalColorReportSchema.parse(await (await R.reportPATCH(json('PATCH', { gender: 'male' }), ctx(r.id))).json());
    expect(back.tops.tip).toBe('AI 셔츠 TIP');
    expect(back.todayActions.items[0]).toBe('AI 행동 1');
    expect(L.variantUsesTemplateNarrative(back)).toBe(false);
  });

  it('AI가 다른 계절로 판정 → 일치도 요인 낮음, 신뢰도 점수 하락', async () => {
    const { id, analysis } = seedFace();
    const ruleTone = L.classifyFace(analysis).tone;
    aiState.tone = ruleTone;
    const same = (await (await R.generatePOST(json('POST', { faceSessionId: id }))).json()).report;
    aiState.tone = toneSeason(ruleTone) === 'autumn' ? 'winter-cool' : 'autumn-warm';
    const diff = (await (await R.generatePOST(json('POST', { faceSessionId: id }))).json()).report;
    expect(diff.aiOpinion.agreesWithRules).toBe(false);
    expect(diff.confidence.factors.find((f: { key: string }) => f.key === 'rule-ai-agreement').score).toBeLessThan(0.5);
    expect(diff.confidence.score).toBeLessThan(same.confidence.score);
    // 최종 타입은 규칙 판정 유지
    expect(diff.type.tone).toBe(ruleTone);
  });
});
