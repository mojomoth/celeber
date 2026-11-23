/**
 * Gate 1 독립 검증 라운드 3 minor 회귀 테스트
 * (측정 없는 프롬프트의 내부 입력, 언더톤 보류 축 요약, 없는 기록 404 화면).
 * 측정 없이 강행한 기록의 재분석은 server.test.ts. 흑백·어두운 전신 사진의 여백 재검출(measure.ts)은 순수 함수만 여기서 보고 실제 검출은 브라우저에서 확인한다.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound from '../app/not-found';
import { VibeResultView } from '../src/components/result-view';
import { type PosePoint, type ServerImageStats, POSE, VIBE_SYSTEM_PROMPT, assembleVibeAnalysis, buildRuleDraft, buildVibePrompt, draftToAi, minAnkleVisibility, preferPaddedPose, unpadPoint } from '../src/lib';
import { measurement } from './fixtures';

const img = { uploadId: 'up_test', url: '/api/uploads/up_test', width: 1200, height: 1800 };
const at = '2026-11-24T00:00:00.000Z';

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

describe('AI 프롬프트: 측정 없는 경로에서 중앙 픽셀 초안을 측정값으로 넘기지 않는다', () => {
  it('측정 없음 → 의상 측정색·중앙 통계 노트·피부색을 넣지 않는다', () => {
    const s = stats();
    const draft = buildRuleDraft(undefined, s);
    expect(draft.outfit.items.length).toBeGreaterThan(0);
    const prompt = buildVibePrompt(draft, undefined, s);
    expect(prompt).not.toContain('measuredColor');
    expect(prompt).not.toContain('#0A0E12');
    expect(prompt).not.toContain('사진 중앙');
    expect(prompt).not.toMatch(/"skin"/);
  });

  it('브라우저 측정이 있으면 측정색과 피부색을 근거로 넘긴다', () => {
    const m = measurement();
    const draft = buildRuleDraft(m, stats());
    const prompt = buildVibePrompt(draft, m, stats());
    expect(prompt).toContain('measuredColor');
    expect(prompt).toMatch(/"skin":"#/);
  });

  it('시스템 프롬프트가 결과 문장에서 입력 자료를 언급하지 말라고 한다', () => {
    expect(VIBE_SYSTEM_PROMPT).toContain('입력 자료를 언급하지 말고');
  });
});

describe('언더톤 보류', () => {
  it('헤더가 언더톤 보류면 축 요약 줄도 웜·쿨을 단정하지 않는다', () => {
    const m = measurement();
    const draft = buildRuleDraft(m, stats());
    const a = assembleVibeAnalysis({ id: 'v', createdAt: at, image: img, draft, measurement: m, stats: stats(), ai: { data: draftToAi(draft), source: 'mock', model: null } });
    expect(a.personalColor.tone).toBeTruthy();
    expect(a.personalColor.axes).toBeTruthy();
    const held = { ...a, personalColor: { ...a.personalColor, undertone: undefined, axes: { ...a.personalColor.axes!, warmth: 30 } } };
    const html = renderToStaticMarkup(createElement(VibeResultView, { analysis: held }));
    expect(html).toContain('언더톤 판정 보류');
    expect(html).toContain('웜·쿨 보류 · 명도');
    expect(html).not.toContain('뉴트럴 쿨 · 명도');
    // 언더톤이 있으면 기존처럼 축 수준을 보여 준다
    const judged = renderToStaticMarkup(createElement(VibeResultView, { analysis: { ...held, personalColor: { ...held.personalColor, undertone: 'cool' } } }));
    expect(judged).toContain('뉴트럴 쿨 · 명도');
  });
});

describe('없는 기록 상세', () => {
  it('한국어 안내와 기록 목록 링크를 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain('찾을 수 없습니다');
    expect(html).toContain('/analyses');
    expect(html).not.toMatch(/could not be found/i);
  });
});

describe('포즈 여백 재검출 (measure.ts)', () => {
  const kp = (ankleV: number): PosePoint[] => Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, v: i === POSE.leftAnkle || i === POSE.rightAnkle ? ankleV : 0.9 }));

  it('여백 캔버스 좌표를 원본 좌표로 되돌린다', () => {
    // 600×1000 원본을 1000×1000 가운데(offX 200)에 둔 경우
    const p = unpadPoint({ x: 0.5, y: 0.9, v: 0.8 }, { side: 1000, offX: 200, offY: 0 }, 600, 1000);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.9);
    expect(p.v).toBe(0.8);
    expect(unpadPoint({ x: 0.2, y: 0 }, { side: 1000, offX: 200, offY: 0 }, 600, 1000).x).toBeCloseTo(0);
  });

  it('원본에서 못 찾았거나 발목이 흐리면 재검출을, 아니면 원본을 쓴다', () => {
    expect(minAnkleVisibility(kp(0.13))).toBeCloseTo(0.13);
    expect(preferPaddedPose(undefined, kp(0.9))).toBe(true);
    expect(preferPaddedPose(kp(0.13), kp(0.97))).toBe(true);
    expect(preferPaddedPose(kp(0.4), kp(0.3))).toBe(false);
    expect(preferPaddedPose(kp(0.4), undefined)).toBe(false);
  });
});
