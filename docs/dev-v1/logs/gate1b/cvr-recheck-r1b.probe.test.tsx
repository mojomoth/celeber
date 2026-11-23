/**
 * cvr minor r1 재검증 프로브 2: Codex sol 2차 의견 항목 직접 재현 (관찰값만 console.log).
 * 실행: pocs/celeb-vibe-report 에서 pnpm exec vitest run --config <scratch>/vitest.probe.config.ts
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'vitest';
import type { VibeAnalysis, VibeGuide } from '@celeber/core/contracts';
import { type GuideAi, buildRuleGuide, draftToAi, mergeAiGuide } from '../../../../pocs/celeb-vibe-report/src/lib';
import { VibeGuideView } from '../../../../pocs/celeb-vibe-report/src/components/VibeGuideView';
import { buildReport, buildVibe } from '../../../../pocs/celeb-vibe-report/test/helpers';

const report = buildReport();
const nc = (hex: string, name: string) => ({ hex, name });
const v0 = buildVibe();
const asGuide = (d: ReturnType<typeof buildRuleGuide>): VibeGuide => ({ ...d, id: 'guide_t', version: 1, createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z', saved: true, source: 'rules', isMock: false });
const dark: VibeAnalysis = buildVibe({
  analyzability: { analyzable: true, partial: { outfit: true, personalColor: false, mood: true }, personCount: 1, framing: 'full-body', reasons: [{ code: 'extreme-lighting', severity: 'warn', message: '사진이 매우 어둡습니다.' }] },
  personalColor: { ...v0.personalColor, measured: true, tone: 'autumn-warm', toneNameKo: '가을웜 딥', confidence: 0.3, evidence: ['AI 판단: 가을웜 트루'] },
  palette: { main: [nc('#28251A', '짙은 올리브 브라운')], sub: [nc('#7A3B35', '로즈 브라운 (입술)')], accent: [nc('#0C090C', '블랙')] },
});

describe('codex 1: 색 측정 불가', () => {
  it('예전 가이드(매핑에 입술색) + 분석 삭제', () => {
    const old = asGuide(buildRuleGuide({ report, vibe: { ...dark, analyzability: v0.analyzability }, myBody: null }));
    console.log('old mapping has lip', old.paletteMapping.some((m) => m.celeb.name.includes('입술')));
    const html = renderToStaticMarkup(<VibeGuideView guide={old} vibe={dark} />);
    console.log('c1 old guide html has 로즈 브라운', html.includes('로즈 브라운'));
    console.log('c1 detail has evidence 가을웜 트루', renderToStaticMarkup(<VibeGuideView guide={asGuide(buildRuleGuide({ report, vibe: dark, myBody: null }))} vibe={dark} />).includes('가을웜 트루'));
    const deleted = renderToStaticMarkup(<VibeGuideView guide={old} vibe={null} />);
    console.log('c1 vibe deleted shows color gap bars', deleted.includes('웜/쿨 (쿨 ↔ 웜)'));
  });
});

describe('codex 3·5·7: AI 서술 병합', () => {
  it('인물 없음 + AI 코디 항목 실루엣', () => {
    const forced = buildVibe({ analyzability: { analyzable: true, partial: { outfit: true, personalColor: false, mood: true }, personCount: 0, framing: 'unknown', reasons: [{ code: 'extreme-lighting', severity: 'warn', message: '어둡' }, { code: 'no-person', severity: 'warn', message: '인물 없음' }] } });
    const d = buildRuleGuide({ report, vibe: forced, myBody: null });
    const m = mergeAiGuide(d, { ...draftToAi(d), outfit: [{ title: '연예인 룩: I라인', detail: 'I라인 실루엣을 따라 하세요.' }] });
    console.log('c3 merged outfit titles', JSON.stringify(m.outfit.items.map((i) => i.title)));
  });
  it('무채색 룩 + 강렬한 색상의 상의, 촬영 후 바꾼 색', () => {
    const mono = buildVibe({ outfit: { ...v0.outfit, items: [{ category: 'top', name: '니트', color: nc('#4D4B4C', '차콜 그레이') }, { category: 'bottom', name: '팬츠', color: nc('#171717', '블랙') }] }, palette: { main: [nc('#4D4B4C', '차콜 그레이')], sub: [nc('#171717', '블랙')], accent: [] } });
    const d = buildRuleGuide({ report, vibe: mono, myBody: null });
    const m = mergeAiGuide(d, { ...draftToAi(d), doNotCopy: [{ element: '강렬한 색상의 상의', reason: '채도가 높습니다', alternative: 'a' }, { element: '촬영 후 바꾼 색 그대로', reason: 'r', alternative: 'a' }] });
    console.log('c5 merged doNotCopy', JSON.stringify(m.doNotCopy.map((x) => x.element)));
  });
  it('와인딩 오인', () => {
    const d = buildRuleGuide({ report, vibe: v0, myBody: null });
    const ai: GuideAi = { ...draftToAi(d), summary: '머리는 굵은 와인딩으로 연출하세요.', faceSummary: '눈썹은 그린 듯 자연스럽게 다듬으세요.' };
    const m = mergeAiGuide(d, ai);
    console.log('c7 summary kept', m.summary === ai.summary, '| faceSummary kept', m.face.summary === ai.faceSummary);
  });
});
