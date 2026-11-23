/**
 * 독립 검증 라운드 2(cvr-r2) 회귀: 색 측정 불가 사진의 팔레트·상세·예전 가이드 갭, 인물 없음 실루엣,
 * AI 서술의 근거 밖 색, 표현만 다른 원색·보정 주의, 해상도 오류 문구, 요청 본문 오타.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type VibeAnalysis, type VibeGuide } from '@celeber/core/contracts';
import { type GuideAi, GenerateGuideRequestSchema, RegenerateGuideRequestSchema, buildRuleGuide, draftToAi, friendlyUploadError, gapsForDisplay, mentionsUnknownColor, mergeAiGuide } from '../src/lib';
import { VibeGuideView } from '../src/components/VibeGuideView';
import { buildReport, buildVibe } from './helpers';

const report = buildReport();
const nc = (hex: string, name: string) => ({ hex, name });
const v0 = buildVibe();
const COLOR_AXES = ['warmth', 'value', 'chroma', 'contrast', 'clarity'];

/** round1의 dark-a와 같은 모양: 측정은 됐지만 celeb-vibe가 퍼스널컬러 불가로 판정한 아주 어두운 사진 */
const dark: VibeAnalysis = buildVibe({
  analyzability: {
    analyzable: true,
    partial: { outfit: true, personalColor: false, mood: true },
    personCount: 1,
    framing: 'full-body',
    reasons: [{ code: 'extreme-lighting', severity: 'warn', message: '사진이 매우 어둡습니다.' }],
  },
  personalColor: { ...v0.personalColor, measured: true, tone: 'autumn-warm', toneNameKo: '가을웜 딥', confidence: 0.3 },
  palette: { main: [nc('#28251A', '짙은 올리브 브라운')], sub: [nc('#302924', '다크 토프'), nc('#7A3B35', '로즈 브라운 (입술)')], accent: [nc('#0C090C', '블랙')] },
});

const asGuide = (d: ReturnType<typeof buildRuleGuide>): VibeGuide => ({ ...d, id: 'guide_t', version: 1, createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z', saved: true, source: 'rules', isMock: false });

describe('색 측정을 믿을 수 없는 사진의 가이드 화면', () => {
  const html = renderToStaticMarkup(<VibeGuideView guide={asGuide(buildRuleGuide({ report, vibe: dark, myBody: null }))} vibe={dark} />);

  it('팔레트 비교와 상세 분석에 제외한 입술색·원본 톤을 보이지 않는다', () => {
    expect(html).toContain('톤 비교 불가');
    expect(html).not.toContain('로즈 브라운');
    expect(html).not.toContain('가을웜 딥');
  });

  it('수정 전에 저장한 가이드(색 갭 값이 있음)도 색 축을 비교 불가로 그린다', () => {
    const old = asGuide(buildRuleGuide({ report, vibe: v0, myBody: null }));
    expect(old.gaps.filter((x) => COLOR_AXES.includes(x.axis)).some((x) => !x.unavailable)).toBe(true);
    const shown = gapsForDisplay(old.gaps, dark);
    expect(shown.filter((x) => COLOR_AXES.includes(x.axis)).every((x) => x.unavailable && x.gap === 0 && x.comment.includes('조명·보정'))).toBe(true);
    const oldHtml = renderToStaticMarkup(<VibeGuideView guide={old} vibe={dark} />);
    expect(oldHtml).toContain('색 축은 비교하지 않았습니다');
    expect(oldHtml).not.toContain('웜/쿨 (쿨 ↔ 웜)');
    // 정상 사진이면 그대로
    expect(gapsForDisplay(old.gaps, v0)).toEqual(old.gaps);
  });
});

describe('인물 없음 + 조명 사유 강행 분석', () => {
  const forced = buildVibe({
    analyzability: {
      analyzable: true,
      partial: { outfit: true, personalColor: false, mood: true },
      personCount: 0,
      framing: 'unknown',
      reasons: [
        { code: 'extreme-lighting', severity: 'warn', message: '사진이 매우 어둡습니다.' },
        { code: 'no-person', severity: 'warn', message: '사진에서 인물을 찾지 못했습니다.' },
      ],
    },
  });

  it('코디 가이드에 연예인 룩 실루엣을 남기지 않는다', () => {
    const g = buildRuleGuide({ report, vibe: forced, myBody: null });
    expect(JSON.stringify(g.outfit.items)).not.toContain('연예인 룩:');
    expect(JSON.stringify(g.outfit.items)).not.toContain('I라인');
  });
});

describe('AI 서술이 계산 결과에 없는 색을 말할 때', () => {
  const draft = buildRuleGuide({ report, vibe: v0, myBody: null });

  it('mentionsUnknownColor: 근거 색 이름에 같은 계열 표기가 있으면 허용한다', () => {
    expect(mentionsUnknownColor('상의를 초록으로 바꾸세요', ['라이트 그레이'])).toBe(true);
    expect(mentionsUnknownColor('상의를 회색 계열로', ['라이트 그레이'])).toBe(false);
    expect(mentionsUnknownColor('소재로 분위기를 냅니다', [])).toBe(false);
  });

  it('제한 없는 사진에서도 요약·액션·코디 항목의 근거 밖 색은 버리고 규칙 서술을 쓴다', () => {
    const base = draftToAi(draft);
    const ai: GuideAi = {
      ...base,
      summary: '니트를 초록으로 바꾸세요.',
      outfitSummary: '하의를 초록 슬랙스로.',
      outfit: [{ title: '초록 니트', detail: '초록 니트로 바꾸세요.' }, { title: '울 소재', detail: '도톰한 울 소재로 볼륨을 주세요.' }],
      actions: [
        { difficulty: 'easy', area: 'outfit', title: '상의를 초록으로', detail: '초록 니트로 바꾸기' },
        { difficulty: 'medium', area: 'mood', title: '소재로 분위기 맞추기', detail: '울·니트 소재' },
      ],
    };
    const m = mergeAiGuide(draft, ai);
    expect(m.summary).toBe(draft.summary);
    expect(m.outfit.summary).toBe(draft.outfit.summary);
    expect(JSON.stringify([m.actions, m.outfit.items])).not.toContain('초록');
    expect(m.actions.map((a) => a.title)).toEqual(['소재로 분위기 맞추기']);
    expect(m.outfit.items.map((i) => i.title)).toContain('울 소재');
  });

  it('계산 결과의 색(치환 결과)을 말하면 그대로 쓴다', () => {
    const to = draft.outfit.substitutions.find((s) => !s.keepOriginal)!.myColor.name;
    const m = mergeAiGuide(draft, { ...draftToAi(draft), summary: `니트를 ${to}로 바꾸면 룩이 살아납니다.` });
    expect(m.summary).toContain(to);
  });
});

describe('표현만 다른 원색·보정 주의', () => {
  const mono = buildVibe({
    outfit: { ...v0.outfit, items: [{ category: 'top', name: '니트', color: nc('#CCC7B7', '오트밀 베이지') }, { category: 'bottom', name: '팬츠', color: nc('#4D4B4C', '차콜 그레이') }] },
    palette: { main: [nc('#CCC7B7', '오트밀 베이지')], sub: [nc('#4D4B4C', '차콜 그레이')], accent: [nc('#171717', '블랙')] },
  });

  it('무채색 룩이면 "고채도 상의"도 빼고, "사진의 색감 편집 그대로"는 규칙의 보정 주의와 하나로 묶는다', () => {
    const draft = buildRuleGuide({ report, vibe: mono, myBody: null });
    const ai: GuideAi = {
      ...draftToAi(draft),
      doNotCopy: [
        { element: '고채도 상의', reason: 'r', alternative: 'a' },
        { element: '사진의 색감 편집 그대로', reason: 'r', alternative: 'a' },
      ],
    };
    const els = mergeAiGuide(draft, ai).doNotCopy.map((d) => d.element);
    expect(els).not.toContain('고채도 상의');
    expect(els).not.toContain('사진의 색감 편집 그대로');
    expect(els).toContain('사진의 보정 색감 그대로');
  });
});

describe('업로드·요청 오류', () => {
  it('해상도 초과는 용량·일반 재시도가 아니라 해상도를 줄이라고 안내한다', () => {
    const m = friendlyUploadError('Input image exceeds pixel limit');
    expect(m).toContain('해상도');
    expect(m).not.toContain('MB');
    // core가 보내는 한국어 문구는 그대로
    expect(friendlyUploadError('사진 해상도가 약 4000만 화소를 넘습니다. 크기를 줄여서 다시 올려 주세요.')).toContain('4000만 화소');
  });

  it('생성·다시 만들기 요청의 오타 필드(skipAI)는 거절한다', () => {
    expect(RegenerateGuideRequestSchema.safeParse({ skipAI: true }).success).toBe(false);
    expect(RegenerateGuideRequestSchema.safeParse({ skipAi: true }).success).toBe(true);
    expect(RegenerateGuideRequestSchema.safeParse({}).success).toBe(true);
    expect(GenerateGuideRequestSchema.safeParse({ reportId: 'pcr_1', vibeAnalysisId: 'vibe_1', skipAI: true }).success).toBe(false);
    expect(GenerateGuideRequestSchema.safeParse({ reportId: 'pcr_1', vibeAnalysisId: 'vibe_1', skipAi: true, saved: false }).success).toBe(true);
  });
});
