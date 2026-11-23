/**
 * cvr minor r1 독립 재검증 프로브: mergeAiGuide의 근거 밖 색 필터(#4)와 doNotCopy 묶음(#5)을 표현만 바꿔 찔러 본다.
 * 실행: pocs/celeb-vibe-report 에서 pnpm exec vitest run --config <scratch>/vitest.probe.config.ts
 * 결과는 단언이 아니라 관찰값(console.log)으로 남긴다.
 */
import { describe, it } from 'vitest';
import { type GuideAi, buildRuleGuide, draftToAi, mentionsUnknownColor, mergeAiGuide } from '../../../../pocs/celeb-vibe-report/src/lib';
import { buildReport, buildVibe } from '../../../../pocs/celeb-vibe-report/test/helpers';

const report = buildReport();
const nc = (hex: string, name: string) => ({ hex, name });
const v0 = buildVibe();

describe('#4 근거 밖 색', () => {
  const draft = buildRuleGuide({ report, vibe: v0, myBody: null });
  const allowed = [...draft.outfit.substitutions.flatMap((s) => [s.celebColor.name, s.myColor.name]), ...draft.paletteMapping.flatMap((m) => [m.celeb.name, m.mine.name])];
  it('표현별 감지', () => {
    const phrases = ['니트를 초록으로 바꾸세요', '니트를 연두색으로 바꾸세요', '하늘색 셔츠로 바꾸세요', '청록 니트', '자주색 니트', '에메랄드 니트', '카멜 코트', '테라코타 니트', '눈썹은 그린 듯 자연스럽게', '와이드 팬츠 핏'];
    console.log('allowed', JSON.stringify([...new Set(allowed)]));
    for (const p of phrases) console.log('unknownColor', JSON.stringify(p), mentionsUnknownColor(p, allowed));
  });
  it('AI 요약·액션에 매핑 밖 색 (감지 안 되는 표현)', () => {
    const ai: GuideAi = { ...draftToAi(draft), summary: '니트를 연두색으로 바꾸세요.', actions: [{ difficulty: 'easy', area: 'outfit', title: '하늘색 셔츠', detail: '하늘색 셔츠로 바꾸기' }] };
    const m = mergeAiGuide(draft, ai);
    console.log('merged summary', m.summary, '| actions', m.actions.map((a) => a.title).join(','));
  });
});

describe('#5 표현만 다른 주의', () => {
  const mono = buildVibe({
    outfit: { ...v0.outfit, items: [{ category: 'top', name: '니트', color: nc('#CCC7B7', '오트밀 베이지') }, { category: 'bottom', name: '팬츠', color: nc('#4D4B4C', '차콜 그레이') }] },
    palette: { main: [nc('#CCC7B7', '오트밀 베이지')], sub: [nc('#4D4B4C', '차콜 그레이')], accent: [nc('#171717', '블랙')] },
  });
  it('무채색 룩 + 원색/보정 표현 변형', () => {
    const draft = buildRuleGuide({ report, vibe: mono, myBody: null });
    const els = ['채도 높은 상의', '선명한 색 상의', '형광색 포인트', '사진의 어두운 색감 그대로', '화면의 색감 그대로 맞추기', '조명 색 그대로 따라 하기'];
    const ai: GuideAi = { ...draftToAi(draft), doNotCopy: els.map((element) => ({ element, reason: 'r', alternative: 'a' })) };
    console.log('rule doNotCopy', JSON.stringify(draft.doNotCopy.map((d) => d.element)));
    console.log('merged doNotCopy', JSON.stringify(mergeAiGuide(draft, ai).doNotCopy.map((d) => d.element)));
  });
});
