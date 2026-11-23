/**
 * 순수 로직: 코디 색 치환, 팔레트 매핑, 갭, 규칙 가이드, AI 병합, 사진 색 바꾸기.
 */
import { describe, expect, it } from 'vitest';
import { VibeGuideSchema } from '@celeber/core/contracts';
import { deltaE2000, hexToLab, hexToRgb, rgbToLab } from '@celeber/core/color';
import { paletteFromReport } from '@celeber/personal-color-report/lib';
import {
  GAP_SIMILAR,
  type GuideAi,
  buildRuleGuide,
  computeGaps,
  largestGaps,
  draftToAi,
  headsTallScore,
  mapCelebPalette,
  mergeAiGuide,
  orderActions,
  pickThreshold,
  recolorRegion,
  styleScore,
  substituteItem,
  substituteOutfit,
  summarizeGuide,
  analysisLimits,
  recommendedContrast,
  stripLipTag,
} from '../src/lib';
import { buildReport, buildVibe } from './helpers';

const report = buildReport();
const pal = paletteFromReport(report);

describe('코디 색 치환 (내 팔레트 기준)', () => {
  it('리포트 픽스처는 여름 톤이고 머스타드·블랙이 워스트에 있다', () => {
    expect(report.type.season).toBe('summer');
    expect(pal.worst.some((c) => c.name === '머스타드')).toBe(true);
  });

  it('얼굴 가까운 상의 머스타드 → 내 팔레트 색으로 바꾸고 워스트 사유를 적는다', () => {
    const s = substituteItem(buildVibe().outfit.items[0], pal);
    expect(s.keepOriginal).toBe(false);
    expect(pal.all.concat(pal.tops, pal.best, pal.outer, pal.point).map((c) => c.hex)).toContain(s.myColor.hex);
    expect(s.reason).toContain('칙칙');
    expect(s.deltaE).toBeGreaterThan(0);
  });

  it('이미 내 팔레트에 있는 색은 그대로 둔다', () => {
    const mine = pal.tops[0];
    const s = substituteItem({ category: 'top', name: '셔츠', color: mine }, pal);
    expect(s.keepOriginal).toBe(true);
    expect(s.myColor.hex).toBe(mine.hex);
    expect(s.deltaE).toBe(0);
  });

  it('얼굴에서 먼 하의: 워스트와 멀면 유지, 워스트(블랙)와 가까우면 바꾼다', () => {
    const gray = substituteItem({ category: 'bottom', name: '팬츠', color: { hex: '#787880', name: '그레이' } }, pal);
    expect(gray.keepOriginal).toBe(true);
    expect(gray.reason).toContain('얼굴에서 먼');
    const black = substituteItem({ category: 'shoes', name: '로퍼', color: { hex: '#111111', name: '블랙' } }, pal);
    expect(black.keepOriginal).toBe(false);
    expect(black.myColor.hex).not.toBe('#111111');
  });

  it('주얼리는 내 추천 금속으로 맞춘다 (여름: 실버 계열)', () => {
    const s = substituteItem({ category: 'jewelry', name: '귀걸이', color: { hex: '#D4AF37', name: '골드' } }, pal);
    expect(s.keepOriginal).toBe(false);
    expect(pal.metalLabels).toContain(s.myColor.name);
  });

  it('치환은 아이템 순서를 유지하고 결정적이다', () => {
    const v = buildVibe();
    const a = substituteOutfit(v, pal);
    expect(a.map((x) => x.category)).toEqual(v.outfit.items.map((i) => i.category));
    expect(substituteOutfit(v, pal)).toEqual(a);
  });

  it('팔레트 매핑: 중복 제거, 유지 색은 ΔE 0, 바뀐 색은 실제 ΔE2000', () => {
    const m = mapCelebPalette(buildVibe(), pal);
    expect(m.length).toBe(4);
    // 주얼리 색(골드)은 금속 규칙으로 매핑
    expect(pal.metalLabels).toContain(m.find((e) => e.celeb.hex === '#D4AF37')!.mine.name);
    for (const e of m) {
      if (e.deltaE === 0) expect(e.mine.hex).toBe(e.celeb.hex);
      else expect(e.deltaE).toBeCloseTo(deltaE2000(hexToLab(e.celeb.hex), hexToLab(e.mine.hex)), 0);
    }
  });
});

describe('갭', () => {
  it('색 5축 + 체형 + 스타일, gap = celeb - me, 0..100', () => {
    const g = computeGaps(report, buildVibe(), { headsTall: 7.4 });
    expect(g.map((x) => x.axis)).toEqual(['warmth', 'value', 'chroma', 'contrast', 'clarity', 'body-ratio', 'style']);
    for (const x of g) {
      expect(x.gap).toBe(x.celeb - x.me);
      expect(x.me).toBeGreaterThanOrEqual(0);
      expect(x.celeb).toBeLessThanOrEqual(100);
    }
    const warm = g[0];
    expect(warm.me).toBe(Math.round(report.classification.axes.warmth));
    expect(warm.celeb).toBe(85);
    expect(warm.gap).toBeGreaterThan(GAP_SIMILAR);
    expect(warm.comment).toContain('웜');
    const body = g.find((x) => x.axis === 'body-ratio')!;
    expect(body.unavailable).toBeUndefined();
    expect(body.me).toBe(headsTallScore(7.4));
    expect(body.celeb).toBe(headsTallScore(8.2));
  });

  it('내 전신이 없으면 체형 갭은 unavailable + 전신 추가 안내', () => {
    const body = computeGaps(report, buildVibe(), null).find((x) => x.axis === 'body-ratio')!;
    expect(body.unavailable).toBe(true);
    expect(body.comment).toContain('전신');
  });

  it('연예인 축이 없으면 톤 기준값으로 대체, 톤도 없으면 비교 불가', () => {
    const v = buildVibe();
    const toneOnly = buildVibe({ personalColor: { ...v.personalColor, axes: undefined } });
    const g = computeGaps(report, toneOnly);
    expect(g[0].unavailable).toBeUndefined();
    expect(g[0].comment).toContain('추정 톤');
    const none = buildVibe({ personalColor: { ...v.personalColor, axes: undefined, tone: undefined } });
    expect(computeGaps(report, none)[0].unavailable).toBe(true);
  });

  it('측정 없는 사진 통계 폴백(measured=false, 신뢰도 0.18)이면 색 축은 비교 불가이고 행동 제안에 쓰이지 않는다', () => {
    const v = buildVibe();
    const fallback = buildVibe({
      analyzability: { ...v.analyzability, partial: { ...v.analyzability.partial, personalColor: false } },
      personalColor: { ...v.personalColor, measured: false, hair: undefined, confidence: 0.18, axes: { warmth: 60, value: 100, chroma: 0, contrast: 50, clarity: 30 } },
    });
    const g = computeGaps(report, fallback);
    const color = g.filter((x) => ['warmth', 'value', 'chroma', 'contrast', 'clarity'].includes(x.axis));
    expect(color.every((x) => x.unavailable)).toBe(true);
    expect(color[0].comment).toContain('측정하지 못해');
    expect(largestGaps(g).some((x) => ['warmth', 'value', 'chroma', 'contrast', 'clarity'].includes(x.axis))).toBe(false);
  });

  it('AI가 읽은 색(측정 없음, 신뢰도 충분)은 추정으로 표시하고, 헤어·눈이 없으면 대비는 비교하지 않는다', () => {
    const v = buildVibe();
    const est = buildVibe({ personalColor: { ...v.personalColor, measured: false, hair: undefined, eyes: undefined, confidence: 0.45 } });
    const g = computeGaps(report, est);
    expect(g.find((x) => x.axis === 'warmth')!.comment).toContain('추정');
    expect(g.find((x) => x.axis === 'warmth')!.unavailable).toBeUndefined();
    expect(g.find((x) => x.axis === 'contrast')!.unavailable).toBe(true);
  });

  it('스타일 점수: 소프트 0 ↔ 시크 100, 매칭 없음 null', () => {
    expect(styleScore(['부드러운', '차분한']).score).toBe(0);
    expect(styleScore(['#시크', '모던']).score).toBe(100);
    expect(styleScore(['부드러운', '시크']).score).toBe(50);
    expect(styleScore(['바다']).score).toBeNull();
  });

  it('등신 점수는 5.5~9를 0~100으로 자른다', () => {
    expect(headsTallScore(5)).toBe(0);
    expect(headsTallScore(9.5)).toBe(100);
    expect(headsTallScore(7.25)).toBe(50);
  });
});

describe('규칙 가이드', () => {
  const draft = buildRuleGuide({ report, vibe: buildVibe(), myBody: null });

  it('계약 VibeGuide를 통과한다', () => {
    const g = VibeGuideSchema.parse({ ...draft, id: 'guide_t', version: 1, createdAt: 'x', updatedAt: 'x', saved: true, source: 'mock', isMock: true });
    expect(g.celebName).toBe('윤하람');
    expect(g.thumbnail?.uploadId).toBe('up_test');
  });

  it('액션은 쉬움 → 보통 → 어려움, priority는 1..n', () => {
    const order = { easy: 0, medium: 1, hard: 2 } as const;
    const ds = draft.actions.map((a) => order[a.difficulty]);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    expect(draft.actions.map((a) => a.priority)).toEqual(draft.actions.map((_, i) => i + 1));
    expect(draft.actions.some((a) => a.area === 'outfit')).toBe(true);
  });

  it('워스트 색 상의·헤어·금속은 따라 하면 안 되는 요소로, 대체안을 함께', () => {
    const els = draft.doNotCopy.map((d) => d.element).join(' / ');
    expect(els).toContain('머스타드');
    expect(els).toContain('주얼리');
    for (const d of draft.doNotCopy) expect(d.alternative.length).toBeGreaterThan(0);
  });

  it('남성 리포트는 그루밍, 여성 리포트는 립/아이/베이스', () => {
    const titles = draft.face.makeup.map((m) => m.title);
    expect(titles.some((t) => t.startsWith('수염'))).toBe(true);
    // 연예인 사진 측정값(헤어 명도)에서 온 항목이 리포트 그루밍 복사보다 먼저 온다
    expect(titles[0]).toBe('헤어 명도·대비');
    expect(titles).toContain('헤어 스타일');
    const f = buildRuleGuide({ report: buildReport({ gender: 'female' }), vibe: buildVibe() });
    expect(f.face.makeup.map((m) => m.title)).toEqual(['립', '아이', '베이스·치크']);
    expect(f.face.makeup[0].colors?.length).toBe(2);
  });

  it('연예인 입술색이 측정되면 남성 리포트에도 혈색 항목을 만든다', () => {
    const v = buildVibe();
    const withLip = buildVibe({ palette: { ...v.palette, accent: [{ hex: '#A8443C', name: '브릭 레드 (입술)' }] } });
    const g = buildRuleGuide({ report, vibe: withLip, myBody: null });
    const lip = g.face.makeup.find((m) => m.title === '혈색·입술 톤');
    expect(lip?.colors?.length).toBe(2);
    expect(lip?.detail).toContain('브릭 레드');
  });

  it('헤어: 연예인 헤어 색 → 내 추천 헤어 컬러 중 가장 가까운 색', () => {
    const h = draft.face.hair[0];
    expect(h.title).toBe('헤어 컬러');
    expect(h.colors?.[1] && pal.hair.map((c) => c.hex)).toContain(h.colors![1].hex);
  });

  it('결정적이며 요약에 바뀐 아이템 수를 적는다', () => {
    expect(buildRuleGuide({ report, vibe: buildVibe(), myBody: null })).toEqual(draft);
    const changed = draft.outfit.substitutions.filter((s) => !s.keepOriginal).length;
    expect(draft.summary).toContain(`${changed}개 아이템`);
  });

  it('목록 요약: 썸네일 · 이름 · 룩 이름 + 팔레트', () => {
    const g = VibeGuideSchema.parse({ ...draft, id: 'guide_t', version: 1, createdAt: 'a', updatedAt: 'b', saved: true, source: 'mock', isMock: true });
    const sm = summarizeGuide(g);
    expect([sm.thumbnail?.uploadId, sm.celebName, sm.lookName]).toEqual(['up_test', '윤하람', '머스타드 니트 룩']);
    expect(sm.myColors.length).toBeGreaterThan(0);
  });
});

describe('AI 서술 병합', () => {
  const draft = buildRuleGuide({ report, vibe: buildVibe(), myBody: null });

  it('Mock(draftToAi)을 병합해도 수치(치환·갭·매핑)는 그대로', () => {
    const m = mergeAiGuide(draft, draftToAi(draft));
    expect(m.outfit.substitutions).toEqual(draft.outfit.substitutions);
    expect(m.gaps).toEqual(draft.gaps);
    expect(m.paletteMapping).toEqual(draft.paletteMapping);
    expect(m.summary).toBe(draft.summary);
  });

  it('AI 항목은 색이 붙은 규칙 항목 뒤에 붙고, 액션은 쉬움→어려움으로 재정렬', () => {
    const ai: GuideAi = {
      ...draftToAi(draft),
      summary: 'AI 요약',
      hair: [{ title: '앞머리 결', detail: '가르마를 살려 가볍게' }],
      actions: [
        { difficulty: 'hard', area: 'face', title: '헤어 염색', detail: 'x' },
        { difficulty: 'easy', area: 'outfit', title: '시계 교체', detail: 'y' },
        { difficulty: 'medium', area: 'mood', title: '소재', detail: 'z' },
      ],
      doNotCopy: [{ element: '오버사이즈 볼륨', reason: 'r', alternative: 'a' }],
      moodKeywords: ['#도시적', ''],
    };
    const m = mergeAiGuide(draft, ai);
    expect(m.summary).toBe('AI 요약');
    expect(m.face.hair[0].title).toBe('헤어 컬러');
    expect(m.face.hair.map((h) => h.title)).toContain('앞머리 결');
    expect(m.actions.map((a) => a.title)).toEqual(['시계 교체', '소재', '헤어 염색']);
    expect(m.actions.map((a) => a.priority)).toEqual([1, 2, 3]);
    expect(m.doNotCopy.map((d) => d.element)).toContain('오버사이즈 볼륨');
    expect(m.mood.keywords).toEqual(['도시적']);
  });

  it('orderActions는 같은 난이도 안에서 입력 순서를 지킨다', () => {
    const r = orderActions([
      { difficulty: 'medium', area: 'face', title: 'a', detail: '' },
      { difficulty: 'easy', area: 'face', title: 'b', detail: '' },
      { difficulty: 'medium', area: 'face', title: 'c', detail: '' },
    ]);
    expect(r.map((x) => x.title)).toEqual(['b', 'a', 'c']);
  });
});

describe('사진 색 바꾸기 (recolorRegion)', () => {
  /** 40x60 이미지: 배경 회색, 가운데 상자(옷)는 머스타드 + 명도 줄무늬(주름) */
  function image() {
    const w = 40;
    const h = 60;
    const data = new Uint8ClampedArray(w * h * 4);
    const bg = hexToRgb('#DDDDDD');
    const cloth = hexToRgb('#D4A017');
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inBox = x >= 10 && x < 30 && y >= 20 && y < 40;
        const shade = inBox && y % 4 === 0 ? 0.85 : 1;
        const c = inBox ? cloth : bg;
        data[i] = c.r * shade;
        data[i + 1] = c.g * shade;
        data[i + 2] = c.b * shade;
        data[i + 3] = 255;
      }
    return { w, h, data };
  }
  const box = { x: 10 / 40, y: 20 / 60, w: 20 / 40, h: 20 / 60 };

  it('box 안의 옷 색만 목표색으로, 바깥(배경)은 그대로, 주름 명도 차는 유지', () => {
    const { w, h, data } = image();
    const before = data.slice();
    const r = recolorRegion(data, w, h, box, '#D4A017', '#91A6BE', { pad: 0 });
    expect(r.changed).toBe(400);
    const px = (d: Uint8ClampedArray, x: number, y: number) => ({ r: d[(y * w + x) * 4], g: d[(y * w + x) * 4 + 1], b: d[(y * w + x) * 4 + 2] });
    // 옷 중심: 목표색과 ΔE < 3
    expect(deltaE2000(rgbToLab(px(data, 20, 21)), hexToLab('#91A6BE'))).toBeLessThan(3);
    // 배경 불변
    expect(px(data, 2, 2)).toEqual(px(before, 2, 2));
    expect(px(data, 35, 50)).toEqual(px(before, 35, 50));
    // 주름(줄무늬) 행은 여전히 더 어둡다
    expect(rgbToLab(px(data, 20, 24)).l).toBeLessThan(rgbToLab(px(data, 20, 25)).l);
  });

  it('임계값 자동 선택: 옷이 box 대부분이면 가장 작은 값', () => {
    const { w, h, data } = image();
    expect(pickThreshold(data, w, h, box, '#D4A017', 0)).toBe(16);
  });

  it('옷 색과 먼 box는 바꾸지 않는다', () => {
    const { w, h, data } = image();
    const r = recolorRegion(data, w, h, { x: 0, y: 0, w: 0.2, h: 0.2 }, '#D4A017', '#91A6BE', { threshold: 16, pad: 0 });
    expect(r.changed).toBe(0);
  });
});

describe('조사', () => {
  it('받침에 따라 고른다 (ㄹ 받침은 로)', async () => {
    const { wj } = await import('../src/lib');
    expect(wj('버건디 브라운', '로/으로')).toBe('버건디 브라운으로');
    expect(wj('세이지', '로/으로')).toBe('세이지로');
    expect(wj('블루 그레이 펄', '로/으로')).toBe('블루 그레이 펄로');
    expect(wj('니트', '을/를')).toBe('니트를');
    expect(wj('팬츠', '이/가')).toBe('팬츠가');
    expect(wj('코트', '와/과')).toBe('코트와');
    expect(wj('실버', '은/는')).toBe('실버는');
    expect(wj('네이비 셔츠', '을/를')).toBe('네이비 셔츠를');
    expect(wj('ABC', '을/를')).toBe('ABC을(를)');
  });
});

describe('마무리 검증 회귀', () => {
  const v0 = buildVibe();
  const colorAxes = ['warmth', 'value', 'chroma', 'contrast', 'clarity'];

  it('연예인 대비가 크게 높고 내 권장 대비가 낮음~중간이면 "대비를 올리라"는 액션 대신 포인트 대비만 권한다', () => {
    expect(recommendedContrast(report)).toBeLessThan(60);
    // 검증에서 재현한 조건: 내 대비 축 ≈ 0 (여름 라이트), 연예인 사진 측정 대비 49
    const lowMe = { ...report, classification: { ...report.classification, axes: { ...report.classification.axes, contrast: 0 } } };
    const hi = buildVibe({ personalColor: { ...v0.personalColor, axes: { ...v0.personalColor.axes!, contrast: 49 } } });
    const g = buildRuleGuide({ report: lowMe, vibe: hi, myBody: null });
    const titles = g.actions.map((a) => a.title);
    expect(titles).not.toContain('상하의 명도 차로 대비 만들기');
    expect(titles).toContain('대비는 얼굴에서 먼 곳에만');
    const dn = g.doNotCopy.find((d) => d.element.includes('강한 명도 대비'));
    expect(dn?.element).toContain('얼굴 가까이');
    const mood = g.mood.items.find((i) => i.title === '대비·밝기로 맞추기')!;
    expect(mood.detail).not.toContain('상하의 명도 차로 만들고');
    const gap = g.gaps.find((x) => x.axis === 'contrast')!;
    expect(gap.comment).toContain('얼굴에서 먼 곳');
  });

  it('연예인 색 축을 비교하지 못하면 분위기 가이드가 "비슷하다"고 말하지 않는다', () => {
    const fallback = buildVibe({
      analyzability: { ...v0.analyzability, partial: { ...v0.analyzability.partial, personalColor: false } },
      personalColor: { ...v0.personalColor, measured: false, hair: undefined, confidence: 0.18 },
    });
    const g = buildRuleGuide({ report, vibe: fallback, myBody: null });
    const mood = g.mood.items.find((i) => i.title === '대비·밝기로 맞추기')!;
    expect(mood.detail).not.toContain('비슷');
    expect(mood.detail).toContain('비교하지 않았습니다');
  });

  it('스타일 키워드가 한쪽에만 있으면 가정값 50과 비교하지 않는다', () => {
    const noKw = buildVibe({ mood: { ...v0.mood, keywords: ['바다', '여름'], firstImpression: '해변' }, outfit: { ...v0.outfit, styleKeywords: [] } });
    const style = computeGaps(report, noKw).find((x) => x.axis === 'style')!;
    expect(style.unavailable).toBe(true);
    expect(style.gap).toBe(0);
  });

  it('범위를 벗어난 등신(1e300)은 비교하지 않고 그대로 보여주지 않는다', () => {
    const huge = buildVibe({ body: { measured: true, headsTall: 1e300, notes: [] } });
    const body = computeGaps(report, huge, { headsTall: 7.3 }).find((x) => x.axis === 'body-ratio')!;
    expect(body.unavailable).toBe(true);
    expect(body.comment).not.toContain('e+');
  });

  it('강행 분석(인물 없음 경고)은 제한된 분석으로 보고, 코디 치환·얼굴 색 비교를 하지 않으며 사유를 싣는다', () => {
    const forced = buildVibe({
      analyzability: {
        analyzable: true,
        partial: { outfit: true, personalColor: false, mood: true },
        personCount: 1,
        framing: 'unknown',
        reasons: [{ code: 'no-person', severity: 'warn', message: '브라우저 측정에서 인물을 찾지 못했습니다. 요청에 따라 사진 중앙을 인물로 가정하고 사진 통계로 분석했습니다.' }],
      },
    });
    const lim = analysisLimits(forced.analyzability);
    expect(lim.limited).toBe(true);
    expect(lim.noPerson).toBe(true);
    const g = buildRuleGuide({ report, vibe: forced, myBody: { headsTall: 7.3 } });
    expect(g.limitations?.[0]).toContain('인물을 찾지 못했습니다');
    expect(g.outfit.substitutions).toEqual([]);
    expect(g.gaps.filter((x) => colorAxes.includes(x.axis)).every((x) => x.unavailable)).toBe(true);
    expect(g.gaps.find((x) => x.axis === 'body-ratio')!.unavailable).toBe(true);
    expect(g.gaps.find((x) => x.axis === 'style')!.unavailable).toBe(true);
    expect(g.actions.some((a) => a.area === 'mood')).toBe(false);
    expect(g.summary).toContain('인물을 찾지 못해');
    expect(VibeGuideSchema.safeParse({ ...g, id: 'guide_t', version: 1, createdAt: 'x', updatedAt: 'x', saved: true, source: 'mock', isMock: true }).success).toBe(true);
    // 정상 분석에는 limitations가 없다
    expect(analysisLimits(v0.analyzability).limited).toBe(false);
    expect(buildRuleGuide({ report, vibe: v0, myBody: null }).limitations).toBeUndefined();
  });

  it('요약은 팔레트 매핑도 본다: 아이템은 유지인데 매핑에서 색이 바뀌면 "그대로"라고 쓰지 않는다', () => {
    const noItems = buildVibe({ outfit: { ...v0.outfit, items: [] } });
    const g = buildRuleGuide({ report, vibe: noItems, myBody: null });
    const mapChanged = g.paletteMapping.filter((m) => m.celeb.hex !== m.mine.hex).length;
    expect(mapChanged).toBeGreaterThan(0);
    expect(g.summary).not.toContain('그대로 참고해도 됩니다');
    expect(g.summary).toContain(`${mapChanged}색`);
  });

  it('여성 리포트: 립 액션과 얼굴 가이드 립 항목이 같은 색, (입술) 표시는 조사 앞에서 뗀다', () => {
    const withLip = buildVibe({ palette: { ...v0.palette, accent: [{ hex: '#A8443C', name: '브릭 레드 (입술)' }] } });
    const f = buildRuleGuide({ report: buildReport({ gender: 'female' }), vibe: withLip, myBody: null });
    const lipItem = f.face.makeup.find((m) => m.title === '립')!;
    const lipAction = f.actions.find((a) => a.title.startsWith('립을'))!;
    expect(lipAction.title).toContain(lipItem.colors![1].name);
    expect(lipItem.detail).toContain('브릭 레드는');
    expect(lipItem.detail).not.toContain('(입술)');
    expect(stripLipTag('브릭 레드 (입술)')).toBe('브릭 레드');
  });

  it('여성 리포트: 무채색(블랙·그레이)은 립으로 옮길 포인트 색으로 쓰지 않는다', () => {
    const mono = buildVibe({ palette: { main: [{ hex: '#CCC7B7', name: '오트밀 베이지' }], sub: [{ hex: '#4D4B4C', name: '차콜 그레이' }], accent: [{ hex: '#171717', name: '블랙' }] } });
    const f = buildRuleGuide({ report: buildReport({ gender: 'female' }), vibe: mono, myBody: null });
    const lipItem = f.face.makeup.find((m) => m.title === '립')!;
    expect(lipItem.detail).not.toContain('블랙');
    expect(lipItem.detail).not.toContain('포인트 색');
    // 유채색 포인트가 sub에만 있으면 그 색을 쓴다
    const withSub = buildVibe({ palette: { main: [{ hex: '#CCC7B7', name: '오트밀 베이지' }], sub: [{ hex: '#B0234A', name: '라즈베리' }], accent: [{ hex: '#171717', name: '블랙' }] } });
    const g = buildRuleGuide({ report: buildReport({ gender: 'female' }), vibe: withSub, myBody: null });
    expect(g.face.makeup.find((m) => m.title === '립')!.detail).toContain('라즈베리는');
  });
});
