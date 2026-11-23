import { describe, expect, it } from 'vitest';
import { createSkippedBodyAnalysis } from '../src/lib/analyze';
import { assertPlausibleGeometry, assertPlausibleRatios, BodyInputError } from '../src/server';

const ratios = { headsTall: 7.4, headToHeight: 0.135, upperToLower: 0.9, legToHeight: 0.52, shoulderToHip: 1.3, shoulderToHeight: 0.25 };

describe('ratio bounds (server-side guard)', () => {
  it('accepts plausible ratios and skipped analyses', () => {
    expect(() => assertPlausibleRatios({ ...createSkippedBodyAnalysis(), ratios } as never)).not.toThrow();
    expect(() => assertPlausibleRatios(createSkippedBodyAnalysis())).not.toThrow();
  });

  it('rejects huge, negative and non-finite values with a 400-style error', () => {
    for (const bad of [1e9, -3, Number.POSITIVE_INFINITY, Number.NaN, 0]) {
      expect(() => assertPlausibleRatios({ ...createSkippedBodyAnalysis(), ratios: { ...ratios, headsTall: bad } } as never)).toThrow(BodyInputError);
    }
  });
});

describe('geometry bounds (server-side guard)', () => {
  const keypoints = { headTop: { x: 0.5, y: 0.05 }, chin: { x: 0.5, y: 0.17 }, sole: { x: 0.5, y: 0.97 } };
  const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.1 + i * 0.02, z: -0.1, visibility: 0.9 }));

  it('accepts normal keypoints and landmarks (slightly outside the frame too)', () => {
    expect(() => assertPlausibleGeometry({ ...createSkippedBodyAnalysis(), keypoints, landmarks } as never)).not.toThrow();
    expect(() => assertPlausibleGeometry({ ...createSkippedBodyAnalysis(), keypoints: { ...keypoints, sole: { x: 0.5, y: 1.08 } } } as never)).not.toThrow();
  });

  it('rejects huge keypoints, landmarks and silhouette widths', () => {
    for (const y of [3e5, 1e7, -1e308, 1e308]) {
      expect(() => assertPlausibleGeometry({ ...createSkippedBodyAnalysis(), keypoints: { ...keypoints, sole: { x: 0.5, y } } } as never)).toThrow(BodyInputError);
    }
    const bad = landmarks.map((l, i) => (i === 27 ? { ...l, x: 1e9 } : l));
    expect(() => assertPlausibleGeometry({ ...createSkippedBodyAnalysis(), landmarks: bad } as never)).toThrow(BodyInputError);
    expect(() => assertPlausibleGeometry({ ...createSkippedBodyAnalysis(), silhouette: { shoulder: 1e9, hip: 0.2 } } as never)).toThrow(BodyInputError);
  });
});
