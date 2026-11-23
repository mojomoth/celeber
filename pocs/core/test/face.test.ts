import { describe, expect, it } from 'vitest';
import { deltaE2000, hexToLab, hexToRgb } from '../src/color';
import { FaceAnalysisSchema, PersonalColorReportSchema } from '../src/contracts';
import { SKIN_ROI, buildSkinMeasurement, convexHull, estimateHeadPose, pointInPolygon, sampleFaceColors } from '../src/face';

/** 합성 얼굴: 478개 랜드마크를 타원 위/안에 배치하고 피부색으로 칠한 이미지 */
function synthetic(skinHex: string) {
  const W = 200;
  const H = 260;
  const skin = hexToRgb(skinHex);
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = 100;
  const cy = 130;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inFace = ((x - cx) / 70) ** 2 + ((y - cy) / 95) ** 2 <= 1;
      const c = inFace ? skin : { r: 40, g: 40, b: 50 };
      data.set([c.r, c.g, c.b, 255], (y * W + x) * 4);
    }
  // 모든 랜드마크를 얼굴 안쪽 랜덤 위치로 (ROI가 피부 위에 오도록), 주요 점은 실제 위치 근사
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lms = Array.from({ length: 478 }, () => {
    const t = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.6;
    return { x: (cx + Math.cos(t) * 70 * r) / W, y: (cy + Math.sin(t) * 95 * r) / H, z: 0 };
  });
  // ROI 인덱스들은 얼굴 중앙 영역에 넓게
  for (const idx of Object.values(SKIN_ROI).flat()) {
    const t = rnd() * Math.PI * 2;
    lms[idx] = { x: (cx + Math.cos(t) * 45) / W, y: (cy + Math.sin(t) * 60) / H, z: 0 };
  }
  lms[10] = { x: cx / W, y: (cy - 95) / H, z: 0 };
  lms[152] = { x: cx / W, y: (cy + 95) / H, z: 0 };
  lms[234] = { x: (cx - 70) / W, y: cy / H, z: 0 };
  lms[454] = { x: (cx + 70) / W, y: cy / H, z: 0 };
  lms[1] = { x: cx / W, y: (cy + 10) / H, z: 0 };
  lms[33] = { x: (cx - 35) / W, y: (cy - 20) / H, z: 0 };
  lms[263] = { x: (cx + 35) / W, y: (cy - 20) / H, z: 0 };
  return { img: { data, width: W, height: H }, lms };
}

describe('face sampling', () => {
  it('균일한 피부 이미지에서 피부색을 정확히 복원', () => {
    const { img, lms } = synthetic('#E3BBA6');
    const s = sampleFaceColors(img, lms);
    expect(s.skin.overall.used).toBeGreaterThan(100);
    const d = deltaE2000(hexToLab('#E3BBA6'), hexToLab(`#${[s.skin.overall.rgb.r, s.skin.overall.rgb.g, s.skin.overall.rgb.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`));
    expect(d).toBeLessThan(0.5);
    const m = buildSkinMeasurement(s, { method: 'none', gains: { r: 1, g: 1, b: 1 }, strength: 0 });
    expect(m.corrected.hex).toBe('#E3BBA6');
    expect(m.whiteBalance.deltaE).toBe(0);
    expect(m.confidence).toBeGreaterThan(0);
  });
  it('정면 랜드마크 → yaw ≈ 0', () => {
    const { lms } = synthetic('#E3BBA6');
    expect(Math.abs(estimateHeadPose(lms).yawDeg)).toBeLessThan(3);
  });
  it('기하 유틸', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(hull).toHaveLength(4);
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, hull)).toBe(true);
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, hull)).toBe(false);
  });
});

/** ROI마다 직사각형 한 칸. 나머지 랜드마크는 왼쪽 위 구석에 모은다 */
function roiBoxes(boxes: Partial<Record<keyof typeof SKIN_ROI, { x0: number; y0: number; x1: number; y1: number; rgb: [number, number, number] }>>) {
  const W = 400;
  const H = 400;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([40, 40, 50, 255], i * 4);
  const lms = Array.from({ length: 478 }, () => ({ x: 2 / W, y: 2 / H, z: 0 }));
  for (const [name, b] of Object.entries(boxes)) {
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) data.set([...b.rgb, 255], (y * W + x) * 4);
    const corners = [
      [b.x0, b.y0],
      [b.x1, b.y0],
      [b.x1, b.y1],
      [b.x0, b.y1],
    ];
    SKIN_ROI[name as keyof typeof SKIN_ROI].forEach((idx, k) => {
      const [x, y] = corners[k % 4];
      lms[idx] = { x: x / W, y: y / H, z: 0 };
    });
  }
  return { img: { data, width: W, height: H }, lms };
}

describe('피부 ROI 상한·균등 가중·누락 사유', () => {
  const LIGHT: [number, number, number] = [232, 196, 176];
  const DARK: [number, number, number] = [141, 90, 69];
  const RED: [number, number, number] = [230, 60, 60]; // Cr > 180 → 피부로 보지 않음 (강한 붉은 조명에서 볼이 빠지는 상황)
  const scene = () =>
    roiBoxes({
      forehead: { x0: 20, y0: 20, x1: 80, y1: 60, rgb: LIGHT },
      leftCheek: { x0: 120, y0: 20, x1: 180, y1: 60, rgb: LIGHT },
      rightCheek: { x0: 220, y0: 20, x1: 280, y1: 60, rgb: RED },
      chin: { x0: 20, y0: 120, x1: 380, y1: 380, rgb: DARK },
    });
  const luma = (c: { r: number; g: number; b: number }) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

  it('ROI 면적이 상한의 4배 미만이어도 ROI당 픽셀은 상한(6000)을 넘지 않는다', () => {
    const { img, lms } = scene();
    const s = sampleFaceColors(img, lms);
    expect(s.skin.regions.chin?.total).toBeLessThanOrEqual(6000);
    expect(sampleFaceColors(img, lms, { maxPixelsPerRegion: 2000 }).skin.regions.chin?.total).toBeLessThanOrEqual(2000);
  });
  it('큰 ROI(턱)가 전체 피부값을 좌우하지 않는다 (ROI 균등 가중)', () => {
    const { img, lms } = scene();
    const s = sampleFaceColors(img, lms);
    // 밝은 ROI 2곳 + 어두운 턱 1곳 → 전체값은 밝은 쪽에 더 가까워야 한다
    const L = luma(s.skin.overall.rgb);
    const light = luma({ r: LIGHT[0], g: LIGHT[1], b: LIGHT[2] });
    const dark = luma({ r: DARK[0], g: DARK[1], b: DARK[2] });
    expect(Math.abs(L - light)).toBeLessThan(Math.abs(L - dark));
  });
  it('기본 4곳 중 빠진 ROI는 신뢰도 사유에 이름이 나오고 감점된다', () => {
    const { img, lms } = scene();
    const s = sampleFaceColors(img, lms);
    expect(s.skin.missing).toEqual(['rightCheek']);
    const wb = { method: 'none' as const, gains: { r: 1, g: 1, b: 1 }, strength: 0 };
    const m = buildSkinMeasurement(s, wb);
    expect(m.regions).toHaveLength(3);
    expect(m.confidenceReasons.some((r) => r.includes('오른쪽 볼') && r.includes('3곳'))).toBe(true);
    const full = buildSkinMeasurement({ ...s, skin: { ...s.skin, missing: [] } }, wb);
    expect(m.confidence).toBeLessThan(full.confidence);
  });
});

describe('contracts', () => {
  it('스키마가 잘못된 데이터를 거부', () => {
    expect(FaceAnalysisSchema.safeParse({}).success).toBe(false);
    expect(PersonalColorReportSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});
