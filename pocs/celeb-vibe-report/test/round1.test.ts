/**
 * 독립 검증 라운드 1 회귀: 아주 어두운 사진, 인물 없음 요약, 따라 하면 안 되는 것 중복, 업로드 안내 문구.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type VibeAnalysis, VibeGuideSchema } from '@celeber/core/contracts';
import {
  COLOR_CAUTION_NOTE,
  type GuideAi,
  analysisLimits,
  buildRuleGuide,
  celebAxes,
  checkUploadFile,
  computeGaps,
  dedupeDoNotCopy,
  draftToAi,
  friendlyUploadError,
  guidePromptFacts,
  limitationNotice,
  mergeAiGuide,
} from '../src/lib';
import { SubstitutionTable } from '../src/components/GuideParts';
import { buildReport, buildVibe } from './helpers';

const report = buildReport();
const COLOR_AXES = ['warmth', 'value', 'chroma', 'contrast', 'clarity'];
const nc = (hex: string, name: string) => ({ hex, name });
const v0 = buildVibe();

/** 검증에서 쓴 dark-a.jpg(look-a 밝기 30%)의 분석 결과와 같은 모양: 측정은 됐지만 celeb-vibe가 퍼스널컬러 불가로 판정 */
const dark: VibeAnalysis = buildVibe({
  analyzability: {
    analyzable: true,
    partial: { outfit: true, personalColor: false, mood: true },
    personCount: 1,
    framing: 'full-body',
    reasons: [{ code: 'extreme-lighting', severity: 'warn', message: '사진이 매우 어둡습니다.' }],
  },
  outfit: {
    items: [
      { category: 'top', name: '크루넥 스웨트셔츠', color: nc('#28251A', '짙은 올리브 브라운'), box: { x: 0.3, y: 0.27, w: 0.4, h: 0.28 } },
      { category: 'bottom', name: '와이드 슬랙스', color: nc('#19161C', '보랏빛 차콜') },
      { category: 'shoes', name: '라운드토 청키 슈즈', color: nc('#0C090C', '블랙') },
      { category: 'bag', name: '투핸들 토트백', color: nc('#302924', '다크 토프') },
    ],
    styleKeywords: ['미니멀', '모던', '캐주얼', '시크'],
    silhouette: '여유 있는 실루엣',
    summary: '무지 스웨트셔츠와 와이드 슬랙스',
  },
  personalColor: {
    ...v0.personalColor,
    measured: true,
    tone: 'autumn-warm',
    toneNameKo: '가을웜 딥',
    hair: { ...v0.personalColor.hair!, hex: '#0C0A0A', nameKo: '블랙' },
    axes: { warmth: 38, value: 0, chroma: 40, contrast: 0, clarity: 20 },
    confidence: 0.3,
  },
  palette: { main: [nc('#28251A', '짙은 올리브 브라운'), nc('#19161C', '보랏빛 차콜')], sub: [nc('#302924', '다크 토프'), nc('#7A3B35', '로즈 브라운 (입술)')], accent: [nc('#0C090C', '블랙')] },
});

describe('아주 어두운 사진 (partial.personalColor=false + extreme-lighting)', () => {
  const g = buildRuleGuide({ report, vibe: dark, myBody: null });

  it('측정값이 있어도 색 축을 비교하지 않는다', () => {
    const c = celebAxes(dark);
    expect(c.basis).toBe('none');
    expect(c.reason).toContain('조명·보정');
    const gaps = computeGaps(report, dark);
    expect(gaps.filter((x) => COLOR_AXES.includes(x.axis)).every((x) => x.unavailable)).toBe(true);
  });

  it('색 갭에서 나온 행동·주의를 만들지 않는다 (무게감·원색·언더톤)', () => {
    const text = JSON.stringify([g.actions, g.mood.items, g.doNotCopy]);
    expect(text).not.toContain('무게감');
    expect(text).not.toContain('원색');
    expect(text).not.toContain('따뜻한 색 상의');
    expect(g.gaps.filter((x) => COLOR_AXES.includes(x.axis)).every((x) => x.unavailable)).toBe(true);
  });

  it('연예인 헤어·입술 측정색을 쓰지 않고 내 리포트 기준으로 안내한다', () => {
    expect(g.face.hair[0].detail).not.toContain('연예인 헤어');
    expect(JSON.stringify(g.face)).not.toContain('로즈 브라운');
  });

  it('제한 사유를 싣고, 코디 치환 사유와 요약에 색 불확실성을 적는다', () => {
    expect(g.limitations).toEqual(['사진이 매우 어둡습니다']);
    expect(g.outfit.substitutions.length).toBe(4);
    expect(g.outfit.substitutions.every((x) => x.reason.endsWith(COLOR_CAUTION_NOTE))).toBe(true);
    expect(g.summary).toContain('참고만');
    expect(VibeGuideSchema.safeParse({ ...g, id: 'guide_t', version: 1, createdAt: 'x', updatedAt: 'x', saved: true, source: 'rules', isMock: false }).success).toBe(true);
  });

  it('가이드 상단 안내는 "색이 실제와 다를 수 있는 사진"이다', () => {
    const l = analysisLimits(dark.analyzability);
    expect(l).toMatchObject({ limited: false, colorCaution: true, colorUnusable: true });
    const n = limitationNotice(g.limitations ?? [], l, false)!;
    expect(n.title).toContain('색이 실제와 다를 수 있는 사진');
    expect(n.body).toContain('피부·헤어 색은 비교하지 않았고');
  });

  it('AI 프롬프트에 연예인 톤·헤어를 넘기지 않고 제한 사유와 팔레트 매핑을 넘긴다', () => {
    const f = guidePromptFacts({ report, vibe: dark, myBody: null }, g);
    expect(f.celebLook.tone).toBeNull();
    expect(f.celebLook.hair).toBeNull();
    expect(f.limitations).toEqual(['사진이 매우 어둡습니다']);
    expect(f.paletteMapping.length).toBe(g.paletteMapping.length);
  });

  it('역광 경고만 있고 퍼스널컬러가 가능하면 색 비교는 하되 상단 안내를 띄운다', () => {
    const back = buildVibe({ analyzability: { ...v0.analyzability, reasons: [{ code: 'backlight', severity: 'warn', message: '역광입니다.' }] } });
    const b = buildRuleGuide({ report, vibe: back, myBody: null });
    expect(b.gaps.find((x) => x.axis === 'warmth')!.unavailable).toBeUndefined();
    expect(b.limitations).toEqual(['역광입니다']);
    expect(limitationNotice(b.limitations!, analysisLimits(back.analyzability), true)!.body).toContain('색 비교와 코디 색 치환은 참고만');
  });

  it('측정 없이 사진 통계만 쓴 분석(사유 없음)은 색 주의 안내를 띄우지 않는다', () => {
    const stats = buildVibe({ analyzability: { ...v0.analyzability, partial: { ...v0.analyzability.partial, personalColor: false } }, personalColor: { ...v0.personalColor, measured: false, confidence: 0.18 } });
    expect(analysisLimits(stats.analyzability).colorCaution).toBe(false);
    expect(buildRuleGuide({ report, vibe: stats, myBody: null }).limitations).toBeUndefined();
  });
});

describe('인물 없는 사진 강행 분석', () => {
  const forced = buildVibe({
    analyzability: {
      analyzable: true,
      partial: { outfit: true, personalColor: false, mood: true },
      personCount: 0,
      framing: 'unknown',
      reasons: [{ code: 'no-person', severity: 'warn', message: '브라우저 측정에서 인물을 찾지 못했습니다.' }],
    },
    palette: { main: [nc('#CCC7B7', '오트밀 베이지')], sub: [nc('#4D4B4C', '차콜 그레이')], accent: [] },
  });
  const draft = buildRuleGuide({ report, vibe: forced, myBody: null });

  it('AI 프롬프트에는 계산에서 뺀 코디 아이템을 넘기지 않는다', () => {
    const f = guidePromptFacts({ report, vibe: forced, myBody: null }, draft);
    expect(f.celebLook.items).toEqual([]);
    expect(f.substitutions).toEqual([]);
    expect(f.paletteMapping.map((m) => m.from)).toEqual(['오트밀 베이지', '차콜 그레이']);
  });

  it('제한된 사진이면 AI 요약 대신 규칙 요약을 쓴다 (팔레트 매핑과 다른 색을 말하지 않게)', () => {
    const ai: GuideAi = { ...draftToAi(draft), summary: '오트밀 베이지 니트를 라이트 그레이로 바꾸세요.', outfitSummary: '니트를 라이트 그레이로.' };
    const m = mergeAiGuide(draft, ai);
    expect(m.summary).toBe(draft.summary);
    expect(m.outfit.summary).toBe(draft.outfit.summary);
    expect(m.summary).toContain('인물을 찾지 못해');
  });

  it('치환표의 빈 목록 문구를 바꿀 수 있다 (인물 없음: 치환을 하지 않음)', () => {
    const html = renderToStaticMarkup(SubstitutionTable({ substitutions: [], emptyText: '인물을 찾지 못해 색 치환 예시는 만들지 않았습니다.' }));
    expect(html).toContain('인물을 찾지 못해 색 치환 예시는 만들지 않았습니다.');
    expect(html).not.toContain('코디 아이템을 찾지 못했습니다');
  });
});

describe('그대로 따라 하면 안 되는 것', () => {
  const mono = buildVibe({
    outfit: { ...v0.outfit, items: [{ category: 'top', name: '니트', color: nc('#CCC7B7', '오트밀 베이지') }, { category: 'bottom', name: '팬츠', color: nc('#4D4B4C', '차콜 그레이') }] },
    palette: { main: [nc('#CCC7B7', '오트밀 베이지')], sub: [nc('#4D4B4C', '차콜 그레이')], accent: [nc('#171717', '블랙')] },
  });

  it('채도 갭이 커도 룩에 고채도 색이 없으면 "선명한 원색" 주의를 만들지 않는다', () => {
    const g = buildRuleGuide({ report, vibe: mono, myBody: null });
    expect(g.gaps.find((x) => x.axis === 'chroma')!.gap).toBeGreaterThanOrEqual(25);
    expect(g.doNotCopy.some((d) => d.element.includes('원색'))).toBe(false);
    // 머스타드(고채도)가 있는 기본 룩은 만든다
    expect(buildRuleGuide({ report, vibe: v0, myBody: null }).doNotCopy.some((d) => d.element.includes('원색'))).toBe(true);
  });

  it('AI 병합: 같은 주의를 다른 말로 쓴 항목은 하나만, 무채색 룩이면 AI의 원색 주의도 뺀다', () => {
    const draft = buildRuleGuide({ report, vibe: mono, myBody: null });
    const ai: GuideAi = {
      ...draftToAi(draft),
      doNotCopy: [
        { element: '얼굴 가까이 오는 선명한 원색', reason: 'r', alternative: 'a' },
        { element: '사진의 보정 색감', reason: 'r', alternative: 'a' },
        { element: '오버사이즈 볼륨', reason: 'r', alternative: 'a' },
      ],
    };
    const els = mergeAiGuide(draft, ai).doNotCopy.map((d) => d.element);
    expect(els.filter((e) => e.includes('보정'))).toEqual(['사진의 보정 색감 그대로']);
    expect(els.some((e) => e.includes('원색'))).toBe(false);
    expect(els).toContain('오버사이즈 볼륨');
  });

  it('dedupeDoNotCopy: 원색·보정·명도 대비는 묶어서 앞의 항목만 남긴다', () => {
    const d = (element: string) => ({ element, reason: '', alternative: '' });
    expect(dedupeDoNotCopy([d('선명한 원색을 얼굴 가까이'), d('얼굴 가까이 오는 선명한 원색'), d('얼굴 가까이 강한 명도 대비 (블랙 × 화이트 등)'), d('블랙 × 화이트 대비'), d('A  B'), d('A B')]).map((x) => x.element)).toEqual([
      '선명한 원색을 얼굴 가까이',
      '얼굴 가까이 강한 명도 대비 (블랙 × 화이트 등)',
      'A  B',
    ]);
  });
});

describe('사진 올리기 안내 문구', () => {
  const MB = 1024 * 1024;
  it('형식·크기를 올리기 전에 한국어로 막는다', () => {
    expect(checkUploadFile({ name: 'doc.pdf', type: 'application/pdf', size: 1000 })).toBe('PDF 파일은 올릴 수 없습니다. JPEG·PNG·WebP 사진을 올려 주세요.');
    expect(checkUploadFile({ name: 'a.heic', type: 'image/heic', size: 1000 })).toContain('HEIC 사진은 올릴 수 없습니다');
    expect(checkUploadFile({ name: 'a.heic', type: '', size: 1000 })).toContain('HEIC 사진은');
    expect(checkUploadFile({ name: 'big.jpg', type: 'image/jpeg', size: 27 * MB })).toBe('사진이 너무 큽니다 (27.0MB). 25MB 이하 사진을 올려 주세요.');
    expect(checkUploadFile({ name: 'ok.jpg', type: 'image/jpeg', size: 24.4 * MB })).toBeNull();
    expect(checkUploadFile({ name: 'ok.webp', type: '', size: 1000 })).toBeNull();
  });

  it('서버의 영어 원문·내부 형식 목록은 사용자 문구로 바꾸고, 한국어 안내는 살린다', () => {
    expect(friendlyUploadError('Failed to parse body as FormData.')).toBe('사진이 너무 큽니다. 25MB 이하 사진을 올려 주세요.');
    expect(friendlyUploadError('지원하지 않는 이미지 형식입니다 (JPEG/PNG/WebP/HEIC/AVIF/GIF/SVG).')).toBe('사진 파일을 읽지 못했습니다. JPEG·PNG·WebP 사진을 올려 주세요.');
    expect(friendlyUploadError('source: bad seek to 19037\nheif: Error while loading plugin')).toBe('사진 파일을 읽지 못했습니다. JPEG·PNG·WebP 사진을 올려 주세요.');
    expect(friendlyUploadError('이미지가 너무 큽니다 (최대 25MB).')).toContain('25MB 이하');
    expect(friendlyUploadError('fetch failed')).toContain('사진을 올리지 못했습니다');
    expect(friendlyUploadError('요청 실패 (502)')).toBe('요청 실패 (502)');
  });
});
