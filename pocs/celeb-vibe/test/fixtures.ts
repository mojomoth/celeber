import type { VibeMeasurement } from '../src/lib/measurement';
import type { PosePoint } from '../src/lib/pose';

/** 정면 직립 전신 포즈 (정규화, 세로 사진 aspect 2/3) */
export function standingPose(): PosePoint[] {
  const kp: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0.1 }));
  const set = (i: number, x: number, y: number) => (kp[i] = { x, y, v: 0.99 });
  set(0, 0.5, 0.12); // nose
  set(7, 0.53, 0.11);
  set(8, 0.47, 0.11);
  set(11, 0.62, 0.22); // left shoulder (피사체 왼쪽 = 이미지 오른쪽)
  set(12, 0.38, 0.22);
  set(13, 0.66, 0.36);
  set(14, 0.34, 0.36);
  set(15, 0.67, 0.48);
  set(16, 0.33, 0.48);
  set(23, 0.56, 0.5); // hips
  set(24, 0.44, 0.5);
  set(25, 0.56, 0.7);
  set(26, 0.44, 0.7);
  set(27, 0.56, 0.88);
  set(28, 0.44, 0.88);
  set(29, 0.56, 0.9);
  set(30, 0.44, 0.9);
  set(31, 0.58, 0.92);
  set(32, 0.42, 0.92);
  return kp;
}

export function measurement(over: Partial<VibeMeasurement> = {}): VibeMeasurement {
  return {
    version: 1,
    width: 1200,
    height: 1800,
    analyzedWidth: 683,
    analyzedHeight: 1024,
    faceCount: 1,
    poseCount: 1,
    faceBoxes: [{ x: 0.44, y: 0.05, w: 0.12, h: 0.11 }],
    face: {
      box: { x: 0.44, y: 0.05, w: 0.12, h: 0.11 },
      heightPx: 198,
      yawDeg: 3,
      faceMeanLuma: 150,
      skin: { rgb: { r: 226, g: 190, b: 172 }, used: 5200, lumaStd: 9 },
      skinRegionCount: 4,
      regionSpreadDeltaE: 2.1,
      hair: { rgb: { r: 32, g: 28, b: 30 }, used: 3000, lumaStd: 8, method: 'segmentation' },
      eyes: { rgb: { r: 58, g: 44, b: 40 }, used: 120 },
      lips: { rgb: { r: 190, g: 100, b: 110 }, used: 400 },
    },
    pose: {
      keypoints: standingPose(),
      visible: { head: true, shoulders: true, hips: true, knees: true, ankles: true },
      framing: 'full-body',
      personBox: { x: 0.3, y: 0.03, w: 0.4, h: 0.92 },
    },
    regions: [
      { key: 'torsoCenter', box: { x: 0.45, y: 0.25, w: 0.1, h: 0.25 }, pixelCount: 3000, clusters: [{ rgb: { r: 245, g: 243, b: 238 }, hex: '#F5F3EE', share: 0.9 }] },
      { key: 'torsoSides', box: { x: 0.38, y: 0.25, w: 0.24, h: 0.25 }, pixelCount: 2500, clusters: [{ rgb: { r: 31, g: 42, b: 68 }, hex: '#1F2A44', share: 0.85 }] },
      { key: 'arms', box: { x: 0.33, y: 0.22, w: 0.34, h: 0.15 }, pixelCount: 1500, clusters: [{ rgb: { r: 31, g: 42, b: 68 }, hex: '#1F2A44', share: 0.95 }] },
      { key: 'legs', box: { x: 0.4, y: 0.5, w: 0.2, h: 0.4 }, pixelCount: 4000, clusters: [{ rgb: { r: 60, g: 60, b: 64 }, hex: '#3C3C40', share: 0.92 }] },
      { key: 'feet', box: { x: 0.4, y: 0.87, w: 0.2, h: 0.07 }, pixelCount: 300, clusters: [{ rgb: { r: 20, g: 20, b: 20 }, hex: '#141414', share: 0.9 }] },
    ],
    body: { headsTall: 7.4, upperToLower: 0.88, legToHeight: 0.46, shoulderToHip: 2.0 },
    scene: { meanLuma: 160, clippedHigh: 0.02, clippedLow: 0.01, meanSaturation: 0.12, grayscale: false, grayWorldGains: { r: 1.02, g: 1, b: 0.97 }, cctK: 6200 },
    segmentation: true,
    durationMs: 900,
    notes: [],
    ...over,
  };
}
