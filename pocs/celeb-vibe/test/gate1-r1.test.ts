/**
 * Gate 1 독립 검증 라운드 1 회귀 테스트 (인물 없는 사진, 어두운 사진, 투명 PNG, 상태 문구, 이름 수정).
 */
import { describe, expect, it } from 'vitest';
import type { VibeAnalysis } from '@celeber/core/contracts';
import { statsOnly } from '../src/components/analyzability';
import {
  type ServerImageStats,
  type VibeAi,
  UNDEREXPOSED_ITEM_NOTE,
  UNDEREXPOSED_MESSAGE,
  assembleVibeAnalysis,
  buildRuleDraft,
  draftToAi,
  editPatch,
  judgeAnalyzability,
  mergePersonalColor,
  reconcileUndertone,
  sceneStats,
  serverImageStats,
  summarizeVibe,
  vibeColorConfidence,
} from '../src/lib';
import { measurement } from './fixtures';

const img = { uploadId: 'up_test', url: '/api/uploads/up_test', width: 1200, height: 800 };

/** 풍경 사진 통계: 중앙에 베이지(피부 후보)와 어두운 영역(상의·하의 후보)이 잡힌다 */
function landscapeStats(over: Partial<ServerImageStats> = {}): ServerImageStats {
  return {
    width: 1200,
    height: 800,
    meanLuma: 120,
    clippedHigh: 0.02,
    clippedLow: 0.01,
    meanSaturation: 0.15,
    grayscale: false,
    centerToBorderLuma: 1,
    heuristicSkin: { rgb: { r: 181, g: 161, b: 141 }, used: 900, lumaStd: 10 },
    heuristicUpper: [{ rgb: { r: 40, g: 41, b: 41 }, hex: '#282929', share: 0.8 }],
    heuristicLower: [{ rgb: { r: 18, g: 21, b: 21 }, hex: '#121515', share: 0.8 }],
    ...over,
  };
}

/** AI가 '판단할 내용 없음'으로 비워 둔 응답 */
function emptyAi(over: Partial<VibeAi['analyzability']> = {}): VibeAi {
  return {
    analyzability: { analyzable: false, personCount: 0, framing: 'unknown', outfit: false, personalColor: false, mood: false, issues: [{ code: 'no-person', message: '인물이 없는 풍경 사진입니다.' }], ...over },
    outfit: { items: [], styleKeywords: [], silhouette: '', summary: '측정된 상의·하의 영역은 풍경의 일부입니다.' },
    personalColor: { skinHex: '', hairHex: '', eyeHex: '', tone: 'unknown', undertone: 'unknown', confidence: 0, evidence: ['피부·머리카락·눈동자가 보이지 않습니다.'], lightingCaveat: '' },
    mood: { keywords: [], firstImpression: '', references: [] },
    palette: { main: [], sub: [], accent: [] },
    lookName: '',
  };
}

describe('인물 없는 사진: AI가 비운 값을 규칙 초안으로 채우지 않는다', () => {
  it('풍경(측정 없음, AI 인물 0명): 아이템·팔레트·톤·피부·분위기가 비고 룩 이름은 상태를 말한다', () => {
    const stats = landscapeStats();
    const draft = buildRuleDraft(undefined, stats);
    // 전제: 규칙 초안에는 중앙 픽셀로 만든 상의·하의·톤이 있다
    expect(draft.outfit.items.length).toBeGreaterThan(0);
    expect(draft.personalColor.pc.tone).toBeDefined();
    const a = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, stats, ai: { data: emptyAi(), source: 'ai', model: 'm' } });
    expect(a.source).toBe('ai');
    expect(a.analyzability.analyzable).toBe(false);
    expect(a.outfit.items).toEqual([]);
    expect(a.outfit.styleKeywords).toEqual([]);
    expect(a.palette).toEqual({ main: [], sub: [], accent: [] });
    expect(a.lookName).toBe('인물이 없는 사진');
    expect(a.lookName).not.toMatch(/블랙|미니멀/);
    expect(a.mood).toEqual({ keywords: [], firstImpression: '', references: [] });
    expect(a.personalColor.tone).toBeUndefined();
    expect(a.personalColor.skin).toBeUndefined();
    expect(a.personalColor.axes).toBeUndefined();
    expect(a.personalColor.confidence).toBe(0);
    expect(a.outfit.summary).toContain('풍경의 일부'); // AI 서술은 유지
  });

  it('플랫레이(AI 인물 1명이라 했지만 톤 unknown·피부 없음): 피부 견본과 톤을 규칙 값으로 되살리지 않는다', () => {
    const stats = landscapeStats();
    const draft = buildRuleDraft(undefined, stats);
    const pc = mergePersonalColor(draft.personalColor, emptyAi().personalColor, false, false);
    expect(pc.tone).toBeUndefined();
    expect(pc.skin).toBeUndefined();
    expect(pc.confidence).toBe(0);
    expect(pc.evidence.join(' ')).toContain('판단하지 않았습니다');
  });

  it('AI가 코디 불가라 하고 아이템을 비우면 초안 아이템을 쓰지 않는다 (인물 1명)', () => {
    const draft = buildRuleDraft(undefined, landscapeStats());
    const ai = emptyAi({ personCount: 1, issues: [], analyzable: false });
    const a = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, stats: landscapeStats(), ai: { data: ai, source: 'ai', model: 'm' } });
    expect(a.analyzability.partial.outfit).toBe(false);
    expect(a.outfit.items).toEqual([]);
    expect(a.lookName).toBe('코디 분석 제한 사진');
  });

  it('코디 분석이 가능한데 AI가 아이템만 비우면 측정 아이템을 쓰되 규칙 추정이라고 표시', () => {
    const m = measurement();
    const draft = buildRuleDraft(m, undefined);
    const ai = draftToAi(draft);
    ai.outfit.items = [];
    const a = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, measurement: m, ai: { data: ai, source: 'ai', model: 'm' } });
    expect(a.outfit.items.length).toBe(draft.outfit.items.length);
    expect(a.outfit.items.every((i) => i.note?.startsWith('규칙 추정'))).toBe(true);
  });

  it('Mock(측정 인물 0명, 검출기 정상): 중앙 픽셀 톤을 채우지 않는다', () => {
    const m = measurement({ faceCount: 0, poseCount: 0, face: undefined, pose: undefined, regions: [] });
    const stats = landscapeStats();
    const draft = buildRuleDraft(m, stats);
    const a = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, measurement: m, stats, ai: { data: draftToAi(draft), source: 'mock', model: null } });
    expect(a.personalColor.tone).toBeUndefined();
    expect(a.personalColor.skin).toBeUndefined();
  });
});

describe('어두운 사진', () => {
  it('톤 계절과 언더톤이 정반대면 언더톤 판정을 보류하고 신뢰도를 낮춘다 (여러 번 적용해도 같음)', () => {
    const base = { measured: true, tone: 'autumn-deep' as const, toneNameKo: '가을웜 딥', season: 'autumn' as const, undertone: 'cool' as const, confidence: 0.3, evidence: ['붉은·핑크 기(쿨) 쪽'], lightingCaveat: '' };
    const r = reconcileUndertone(base);
    expect(r.undertone).toBeUndefined();
    expect(r.confidence).toBe(0.2);
    expect(r.evidence.at(-1)).toContain('언더톤 판정을 보류');
    expect(reconcileUndertone(r)).toEqual(r);
    // 같은 방향이거나 뉴트럴이면 그대로
    expect(reconcileUndertone({ ...base, undertone: 'warm' })).toEqual({ ...base, undertone: 'warm' });
    expect(reconcileUndertone({ ...base, undertone: 'neutral' }).undertone).toBe('neutral');
    expect(reconcileUndertone({ ...base, tone: 'summer-cool', season: 'summer', undertone: 'warm' }).undertone).toBeUndefined();
  });

  it('노출 부족이면 사유 문구와 아이템 색 노트로 실제보다 어두울 수 있음을 알린다', () => {
    const m = measurement({ scene: { ...measurement().scene, meanLuma: 28, clippedLow: 0.2 } });
    const draft = buildRuleDraft(m, undefined);
    expect(draft.analyzability.reasons.find((r) => r.code === 'extreme-lighting')?.message).toBe(UNDEREXPOSED_MESSAGE);
    const mock = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, measurement: m, ai: { data: draftToAi(draft), source: 'mock', model: null } });
    expect(mock.outfit.items.length).toBeGreaterThan(0);
    expect(mock.outfit.items.every((i) => i.note?.includes(UNDEREXPOSED_ITEM_NOTE))).toBe(true);
    const withAi = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, measurement: m, ai: { data: draftToAi(draft), source: 'ai', model: 'm' } });
    expect(withAi.outfit.items.every((i) => i.note?.includes(UNDEREXPOSED_ITEM_NOTE))).toBe(true);
  });
});

describe('투명 여백 PNG', () => {
  it('투명 픽셀은 흰 배경으로 합성해 통계를 낸다 (매우 어둡다고 판정하지 않음)', () => {
    const W = 200;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const inside = x >= 50 && x < 150 && y >= 60 && y < 240;
        // 안쪽: 밝은 베이지 불투명. 바깥: 완전 투명(RGB 0)
        if (inside) data.set([210, 200, 188, 255], i);
      }
    const px = { data, width: W, height: H };
    expect(sceneStats(px).meanLuma).toBeGreaterThan(190);
    const stats = serverImageStats(px, { width: W * 4, height: H * 4 });
    const a = judgeAnalyzability(undefined, stats);
    expect(a.reasons.map((r) => r.code)).not.toContain('extreme-lighting');
  });
});

describe('상태 문구 일관성', () => {
  it('검출기가 정상이고 0명이면 통계 추정이 아니다 → 인물 0명', () => {
    const m = measurement({ faceCount: 0, poseCount: 0, face: undefined, pose: undefined, regions: [] });
    const a = judgeAnalyzability(m, undefined);
    expect(a.personCount).toBe(0);
    expect(statsOnly(a)).toBe(false);
    expect(statsOnly(judgeAnalyzability(undefined, landscapeStats()))).toBe(true);
  });

  it("측정이 없을 때 AI 비교 문구는 '측정 기반'이라고 하지 않는다", () => {
    const f = vibeColorConfidence({ measured: false, conditionsOk: true, agreement: false, hasHair: false, hasEyes: false, aiConfidence: 0.5 }).factors.join(' ');
    expect(f).toContain('측정값 없이 AI가');
    expect(f).not.toContain('측정 기반');
    expect(f).toContain('색 규칙 추정과 AI 판단이 서로 다릅니다');
    const measured = vibeColorConfidence({ measured: true, conditionsOk: true, agreement: false, hasHair: true, hasEyes: true }).factors.join(' ');
    expect(measured).toContain('측정 기반 판정과 AI 판단이 서로 다릅니다');
  });

  it('목록 요약: 퍼스널컬러가 사진 조건 때문에 불가면 참고용 표시', () => {
    const m = measurement({ scene: { ...measurement().scene, meanLuma: 28, clippedLow: 0.2 } });
    const draft = buildRuleDraft(m, undefined);
    const a = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft, measurement: m, ai: { data: draftToAi(draft), source: 'mock', model: null } });
    expect(a.analyzability.partial.personalColor).toBe(false);
    const s = summarizeVibe(a);
    expect(s.toneNameKo).toBeDefined();
    expect(s.toneReferenceOnly).toBe(true);
    const ok = buildRuleDraft(measurement(), undefined);
    const okA = assembleVibeAnalysis({ id: 'v', createdAt: '2026-11-24T00:00:00.000Z', image: img, draft: ok, measurement: measurement(), ai: { data: draftToAi(ok), source: 'mock', model: null } });
    expect(summarizeVibe(okA).toneReferenceOnly).toBe(false);
  });
});

describe('이름 수정 PATCH 본문', () => {
  const current = { celebName: undefined, lookName: '올리브 차콜 와이드 룩' } satisfies Pick<VibeAnalysis, 'celebName' | 'lookName'>;
  it('인물 이름만 바꾸면 룩 이름은 보내지 않는다 (재분석된 룩 이름을 덮지 않음)', () => {
    expect(editPatch(current, { celebName: '홍길동', lookName: '올리브 차콜 와이드 룩' })).toEqual({ celebName: '홍길동' });
  });
  it('룩 이름을 바꾸면 룩 이름만, 아무것도 안 바꾸면 빈 본문', () => {
    expect(editPatch(current, { celebName: '', lookName: '새 룩' })).toEqual({ lookName: '새 룩' });
    expect(editPatch(current, { celebName: '', lookName: '올리브 차콜 와이드 룩' })).toEqual({});
  });
});
