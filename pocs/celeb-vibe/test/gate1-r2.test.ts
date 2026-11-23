/**
 * Gate 1 독립 검증 라운드 2 회귀 테스트 (측정 없는 퍼스널컬러 표시, 측정색 노트, AI '여러 명', 말투, 강행 결과 빈 팔레트).
 * /pocs/celeb-vibe 경로는 config.test.ts에서 확인한다.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyzabilityHeadline, statsOnly } from '../src/components/analyzability';
import { PALETTE_EMPTY_TEXT, VibeResultView } from '../src/components/result-view';
import {
  type ServerImageStats,
  type VibeAi,
  FORCED_NO_PERSON_MESSAGE,
  VIBE_SYSTEM_PROMPT,
  assembleVibeAnalysis,
  buildRuleDraft,
  draftToAi,
  mergeAnalyzability,
  summarizeVibe,
} from '../src/lib';
import { measurement } from './fixtures';

const img = { uploadId: 'up_test', url: '/api/uploads/up_test', width: 1200, height: 1800 };
const at = '2026-11-24T00:00:00.000Z';

/** 사람이 가운데 서 있는 평범한 사진의 서버 통계 (중앙이 검정 계열) */
function stats(over: Partial<ServerImageStats> = {}): ServerImageStats {
  return {
    width: 1200,
    height: 1800,
    meanLuma: 130,
    clippedHigh: 0.02,
    clippedLow: 0.01,
    meanSaturation: 0.15,
    grayscale: false,
    centerToBorderLuma: 1,
    heuristicSkin: { rgb: { r: 200, g: 170, b: 150 }, used: 900, lumaStd: 10 },
    heuristicUpper: [{ rgb: { r: 10, g: 14, b: 18 }, hex: '#0A0E12', share: 0.8 }],
    heuristicLower: [{ rgb: { r: 12, g: 14, b: 16 }, hex: '#0C0E10', share: 0.8 }],
    ...over,
  };
}

/** API만 호출(측정 없음)했을 때 AI가 '1명, 모두 가능'이라고 한 응답 */
function aiFor(draft: ReturnType<typeof buildRuleDraft>, pc: Partial<VibeAi['personalColor']>): VibeAi {
  const base = draftToAi(draft);
  return {
    ...base,
    analyzability: { analyzable: true, personCount: 1, framing: 'full-body', outfit: true, personalColor: true, mood: true, issues: [] },
    personalColor: { skinHex: '', hairHex: '', eyeHex: '', tone: 'unknown', undertone: 'unknown', confidence: 0, evidence: [], lightingCaveat: '', ...pc },
  };
}

describe('측정 없는 경로의 퍼스널컬러 상태', () => {
  it("AI가 톤을 비우면 '모두 분석할 수 있습니다'라고 하지 않는다", () => {
    const draft = buildRuleDraft(undefined, stats());
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, stats: stats(), ai: { data: aiFor(draft, {}), source: 'ai', model: 'm' } });
    expect(a.personalColor.tone).toBeUndefined();
    expect(a.analyzability.partial.personalColor).toBe(false);
    expect(analyzabilityHeadline(a.analyzability).text).not.toContain('모두');
    expect(a.analyzability.analyzable).toBe(true); // 코디는 분석 가능
  });

  it('AI가 낮은 신뢰도로 톤을 주면 목록·상세에 참고용으로 남는다', () => {
    const draft = buildRuleDraft(undefined, stats());
    const ai = aiFor(draft, { skinHex: '#C9A58C', tone: 'autumn-deep', undertone: 'warm', confidence: 0.28 });
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, stats: stats(), ai: { data: ai, source: 'ai', model: 'm' } });
    expect(a.personalColor.tone).toBe('autumn-deep');
    expect(a.analyzability.partial.personalColor).toBe(false);
    const other = a.analyzability.reasons.find((r) => r.code === 'other');
    expect(other?.message).toContain('AI가 사진을 보고 판정');
    expect(other?.message).toContain('참고용');
    expect(statsOnly(a.analyzability)).toBe(false); // AI가 인물 수를 봤으므로 '인물 수 미확인'이 아니다
    expect(summarizeVibe(a).toneReferenceOnly).toBe(true);
  });

  it('얼굴을 측정한 경로는 그대로 퍼스널컬러 분석 가능', () => {
    const m = measurement();
    const draft = buildRuleDraft(m, undefined);
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, measurement: m, ai: { data: draftToAi(draft), source: 'ai', model: 'm' } });
    expect(a.personalColor.measured).toBe(true);
    expect(a.analyzability.partial.personalColor).toBe(true);
    expect(summarizeVibe(a).toneReferenceOnly).toBe(false);
  });
});

describe('측정색 비교 노트', () => {
  const sweater: VibeAi['outfit']['items'][number] = {
    category: 'top',
    name: '크루넥 니트 스웨터',
    color: { hex: '#B6A28A', name: '오트밀 베이지' },
    secondaryColors: [],
    material: '니트',
    fit: '',
    pattern: '무지',
    note: '',
    box: { x: 0.2, y: 0.2, w: 0.5, h: 0.4 },
  };

  it('측정이 없으면(플랫레이) 중앙 픽셀 초안 색과 비교하는 노트를 달지 않는다', () => {
    const draft = buildRuleDraft(undefined, stats());
    expect(draft.outfit.items.find((i) => i.category === 'top')?.color.hex).toBe('#0A0E12'); // 전제: 초안 상의는 검정
    const ai = { ...aiFor(draft, {}), outfit: { ...draftToAi(draft).outfit, items: [sweater] } };
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, stats: stats(), ai: { data: ai, source: 'ai', model: 'm' } });
    const top = a.outfit.items.find((i) => i.category === 'top');
    expect(top?.color.hex).toBe('#B6A28A');
    expect(top?.note ?? '').not.toContain('측정색');
  });

  it('측정이 있으면 노트를 달되, AI 노트가 이미 조명·측정 차이를 말하면 겹쳐 달지 않는다', () => {
    const m = measurement();
    const draft = buildRuleDraft(m, undefined);
    const ai = draftToAi(draft);
    ai.outfit.items = [{ ...sweater }, { ...sweater, category: 'bottom', name: '와이드 팬츠', note: '조명 때문에 측정값보다 밝게 보입니다.' }];
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, measurement: m, ai: { data: ai, source: 'ai', model: 'm' } });
    const top = a.outfit.items.find((i) => i.category === 'top');
    const bottom = a.outfit.items.find((i) => i.category === 'bottom');
    expect(top?.note).toContain('측정색');
    expect(bottom?.note).toBe('조명 때문에 측정값보다 밝게 보입니다.');
  });
});

describe("측정 없이 AI가 '여러 명'을 적은 경우", () => {
  const rules = buildRuleDraft(undefined, stats()).analyzability;
  const ai = (issues: { code: 'multiple-people'; message: string }[]) => ({ analyzable: true, personCount: 2, framing: 'full-body' as const, outfit: true, personalColor: true, mood: true, issues });

  it('issues에 적었든 personCount만 줬든 똑같이 오류로 막는다', () => {
    const withoutIssue = mergeAnalyzability(rules, ai([]), false);
    const withIssue = mergeAnalyzability(rules, ai([{ code: 'multiple-people', message: '인물이 2명 보입니다.' }]), false);
    for (const r of [withoutIssue, withIssue]) {
      expect(r.analyzable).toBe(false);
      expect(r.reasons.find((x) => x.code === 'multiple-people')?.severity).toBe('error');
    }
  });

  it("'그래도 분석'이면 경고로 낮춘다", () => {
    const forced = mergeAnalyzability(rules, ai([{ code: 'multiple-people', message: '인물이 2명 보입니다.' }]), false, { force: true });
    expect(forced.analyzable).toBe(true);
    expect(forced.reasons.find((x) => x.code === 'multiple-people')?.severity).toBe('warn');
  });

  it('측정이 1명이면 AI의 여러 명 사유는 경고로만 남는다 (측정 인물 수 우선)', () => {
    const measuredRules = buildRuleDraft(measurement(), undefined).analyzability;
    const r = mergeAnalyzability(measuredRules, ai([{ code: 'multiple-people', message: '뒤에 행인이 보입니다.' }]), true);
    expect(r.analyzable).toBe(true);
    expect(r.reasons.find((x) => x.code === 'multiple-people')?.severity).toBe('warn');
  });
});

describe('AI 문장 말투', () => {
  it('시스템 프롬프트가 합니다체를 지시한다', () => {
    expect(VIBE_SYSTEM_PROMPT).toContain('~습니다/~입니다');
  });
});

describe("인물 없는 사진 '그래도 분석하기'", () => {
  it('사유는 보이는 부분만 분석했다고 말하고, 사진 중앙을 인물로 가정했다고 하지 않는다', () => {
    expect(FORCED_NO_PERSON_MESSAGE).toContain('보이는 부분만 분석했습니다');
    expect(FORCED_NO_PERSON_MESSAGE).not.toContain('사진 중앙을 인물로');
  });

  it('팔레트가 비면 빈 상태 문구를 보여 준다', () => {
    const m = measurement({ faceCount: 0, poseCount: 0, face: undefined, pose: undefined, regions: [] });
    const draft = buildRuleDraft(m, stats(), { force: true });
    const empty: VibeAi = {
      ...aiFor(draft, {}),
      analyzability: { analyzable: false, personCount: 0, framing: 'unknown', outfit: false, personalColor: false, mood: false, issues: [] },
      outfit: { items: [], styleKeywords: [], silhouette: '', summary: '' },
      mood: { keywords: [], firstImpression: '', references: [] },
      palette: { main: [], sub: [], accent: [] },
      lookName: '',
    };
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, measurement: m, stats: stats(), ai: { data: empty, source: 'ai', model: 'm' } });
    expect(a.palette).toEqual({ main: [], sub: [], accent: [] });
    expect(a.analyzability.reasons.map((r) => r.message).join(' ')).not.toContain('사진 중앙을 인물로');
    const html = renderToStaticMarkup(createElement(VibeResultView, { analysis: a }));
    expect(html).toContain(PALETTE_EMPTY_TEXT);
    expect(html).toContain('컬러 팔레트');
  });
});
