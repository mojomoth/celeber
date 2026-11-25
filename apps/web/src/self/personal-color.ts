import type { NamedColor, PersonalColorReport } from '@celeber/core/contracts';
import type { PersonalColorData } from '@/data/types';

function dedupe(colors: NamedColor[]) {
  return [...new Map(colors.map((color) => [color.hex.toLowerCase(), color])).values()];
}

export function mapPersonalColor(report: PersonalColorReport): PersonalColorData {
  const { type, features, measurements, warmCool, accessories, hair, grooming, avoidStyles, photos, draping } = report;
  const tops = report.tops.items.map(({ color }) => color);
  const outer = report.outer.items.map(({ color }) => color);
  const points = accessories.pointColors.map(({ color }) => color);
  const hairColors = hair.items.map(({ color }) => color);
  const palette = dedupe([...tops, ...outer, ...points]).slice(0, 6);
  const name = type.nameKo.trim();
  const lastSpace = name.lastIndexOf(' ');
  const headings = lastSpace < 0 ? [name] : [name.slice(0, lastSpace), name.slice(lastSpace + 1)];
  const sliders: PersonalColorData['sliders'] = [
    { label: '명도', value: features.axes.value, ends: ['어두움', '밝음'] },
    { label: '채도', value: features.axes.chroma, ends: ['부드러움', '선명함'] },
    { label: '청탁감', value: features.axes.clarity, ends: ['탁함', '맑음'] },
  ];
  if (measurements.hair && measurements.eyes) {
    sliders.push({ label: '대비', value: features.axes.contrast, ends: ['낮음', '높음'] });
  }

  return {
    hero: photos.front.url,
    type: { ko: headings, en: type.nameEn, color: type.accentHex, confidence: Math.round(report.confidence.score) },
    palette,
    paletteNote: '얼굴 가까이 둘 때 추천해요',
    sliders,
    firstImpression: { body: report.firstImpression.bullets.join(' '), tags: [...new Set(report.firstImpression.hashtags.map((tag) => tag.replace(/^#/, '')))] },
    warmCool: { warm: Math.round(warmCool.warmPercent), cool: Math.round(warmCool.coolPercent) },
    drapes: [
      ...draping.best.slice(0, 2).map((sample) => ({ photo: sample.image?.url ?? photos.front.url, color: sample.color, good: true, note: draping.bestCaption })),
      ...draping.worst.slice(0, 2).map((sample) => ({ photo: sample.image?.url ?? photos.front.url, color: sample.color, good: false, note: draping.worstCaption })),
    ],
    guide: [
      { k: '상의', v: report.tops.tip, dots: tops.slice(0, 3).map(({ hex }) => hex) },
      { k: '아우터·하의', v: report.outer.tip, dots: outer.slice(0, 3).map(({ hex }) => hex) },
      { k: '포인트 컬러', v: points.slice(0, 3).map(({ name }) => name).join(' · '), dots: points.slice(0, 3).map(({ hex }) => hex) },
    ],
    report: {
      hair: { colors: hairColors, note: [hair.intro, hair.tip].join(' ') },
      accessories: { colors: points, note: [accessories.metalSummary, ...accessories.items.map(({ label }) => label)].join(' · ') },
      grooming: grooming.items.map(({ label, suggestion }) => ({ k: label, v: suggestion })),
      avoid: avoidStyles.items.map(({ label, colors, reason }) => ({ color: { name: label, hex: colors[0].hex }, note: reason })),
      today: report.todayActions.items,
      accuracy: {
        level: report.confidence.gradeLabel,
        factors: report.confidence.factors.map(({ label, detail, score }) => ({ k: label, v: detail, ok: score >= 0.6 })),
        caution: [...report.cautions.items, report.disclaimer].join(' '),
      },
    },
  };
}
