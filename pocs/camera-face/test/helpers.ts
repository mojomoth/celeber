/** 테스트용 합성 이미지 생성기 */
import { FACE_OVAL, LEFT_EYE, LIPS_OUTER, RIGHT_EYE, pointInPolygon } from '@celeber/core/face';
import { type Rgb, linearToSrgb, srgbToLinear } from '@celeber/core/color';
import fx from './fixtures/landmarks.json';

export interface Fixture {
  width: number;
  height: number;
  landmarks: { x: number; y: number; z: number }[];
  matrix: number[];
}
export const FIXTURES = fx as unknown as Record<'front-card' | 'front-doji' | 'side-doji', Fixture>;

export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function solid(w: number, h: number, fn: (x: number, y: number) => Rgb): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      data.set([Math.round(c.r), Math.round(c.g), Math.round(c.b), 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

/** 선형 RGB 게인으로 조명 캐스트 적용 */
export function cast(c: Rgb, k: { r: number; g: number; b: number }): Rgb {
  const l = srgbToLinear(c);
  return linearToSrgb({ r: Math.min(1, l.r * k.r), g: Math.min(1, l.g * k.g), b: Math.min(1, l.b * k.b) });
}

/** 픽스처 랜드마크 위에 피부/눈/입술/배경을 칠한 얼굴 이미지 */
export function paintFace(f: Fixture, skin: Rgb, bg: Rgb, k = { r: 1, g: 1, b: 1 }): Img {
  const P = (idx: readonly number[]) => idx.map((i) => ({ x: f.landmarks[i].x * f.width, y: f.landmarks[i].y * f.height }));
  const oval = P(FACE_OVAL);
  const eyes = [P(LEFT_EYE), P(RIGHT_EYE)];
  const lips = P(LIPS_OUTER);
  // 배경에 약간의 무늬 (gray-world 입력 다양화)
  return solid(f.width, f.height, (x, y) => {
    const p = { x: x + 0.5, y: y + 0.5 };
    let c: Rgb;
    if (pointInPolygon(p, oval)) {
      if (eyes.some((e) => pointInPolygon(p, e))) c = { r: 40, g: 30, b: 28 };
      else if (pointInPolygon(p, lips)) c = { r: 190, g: 110, b: 110 };
      else c = skin;
    } else {
      const t = ((x >> 4) + (y >> 4)) % 2 ? 12 : -12;
      c = { r: bg.r + t, g: bg.g + t, b: bg.b + t };
    }
    return cast(c, k);
  });
}

/** 색온도 K 광원의 백색을 sRGB 선형 게인으로 (g=1) — 실제 광원 캐스트 재현 */
import { cctToXy, xyToXyz, xyzToLinear } from '@celeber/core/color';
export function illuminantGains(k: number): { r: number; g: number; b: number } {
  const l = xyzToLinear(xyToXyz(cctToXy(k), 1));
  return { r: l.r / l.g, g: 1, b: l.b / l.g };
}
