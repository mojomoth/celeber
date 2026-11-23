/**
 * 결정적 k-means (CIELAB 공간) → 대표색(dominant color) 클러스터.
 * 의상 영역 픽셀에서 패턴/주름 그림자에 덜 흔들리는 주색을 뽑기 위해 사용한다.
 * 브라우저/서버 공용 순수 함수. 같은 입력이면 항상 같은 결과.
 */
import { type Lab, type Rgb, deltaE2000, labToRgb, rgbToHex, rgbToLab } from '@celeber/core/color';
import { seededRandom } from '@celeber/core/mock';
import type { ColorCluster } from './measurement';

export interface DominantOptions {
  k?: number;
  /** 샘플 상한 (초과 시 등간격 다운샘플) */
  maxSamples?: number;
  iterations?: number;
  /** 이 값보다 가까운 클러스터는 병합 (ΔE2000) */
  mergeDeltaE?: number;
  /** 이 비율 미만 클러스터는 버림 */
  minShare?: number;
  seed?: string;
}

const dist2 = (a: Lab, b: Lab) => (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

/** 픽셀 → 대표색 클러스터 (share 내림차순) */
export function dominantColors(pixels: readonly Rgb[], opts: DominantOptions = {}): ColorCluster[] {
  const k = Math.max(1, opts.k ?? 4);
  const maxSamples = opts.maxSamples ?? 3000;
  const iterations = opts.iterations ?? 12;
  const mergeDeltaE = opts.mergeDeltaE ?? 7;
  const minShare = opts.minShare ?? 0.04;
  if (pixels.length === 0) return [];

  const step = Math.max(1, Math.floor(pixels.length / maxSamples));
  const pts: Lab[] = [];
  for (let i = 0; i < pixels.length; i += step) pts.push(rgbToLab(pixels[i]));
  const n = pts.length;
  const kk = Math.min(k, n);

  // k-means++ 초기화 (시드 고정)
  const rng = seededRandom(opts.seed ?? 'celeb-vibe-kmeans');
  const centers: Lab[] = [pts[Math.floor(rng() * n) % n]];
  const d = new Float64Array(n).fill(Infinity);
  while (centers.length < kk) {
    const last = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      d[i] = Math.min(d[i], dist2(pts[i], last));
      sum += d[i];
    }
    if (sum === 0) break;
    let r = rng() * sum;
    let idx = 0;
    for (; idx < n - 1; idx++) {
      r -= d[idx];
      if (r <= 0) break;
    }
    centers.push(pts[idx]);
  }

  const assign = new Int32Array(n);
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dd = dist2(pts[i], centers[c]);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      if (assign[i] !== best || it === 0) {
        changed = changed || assign[i] !== best;
        assign[i] = best;
      }
    }
    const acc = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    for (let i = 0; i < n; i++) {
      const a = acc[assign[i]];
      a.l += pts[i].l;
      a.a += pts[i].a;
      a.b += pts[i].b;
      a.n++;
    }
    for (let c = 0; c < centers.length; c++) if (acc[c].n) centers[c] = { l: acc[c].l / acc[c].n, a: acc[c].a / acc[c].n, b: acc[c].b / acc[c].n };
    if (!changed && it > 0) break;
  }

  let clusters = centers.map((c, ci) => {
    let cnt = 0;
    for (let i = 0; i < n; i++) if (assign[i] === ci) cnt++;
    return { lab: c, count: cnt };
  });
  clusters = clusters.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);

  // 가까운 클러스터 병합 (큰 쪽으로 가중 평균)
  const merged: { lab: Lab; count: number }[] = [];
  for (const c of clusters) {
    const m = merged.find((x) => deltaE2000(x.lab, c.lab) < mergeDeltaE);
    if (m) {
      const t = m.count + c.count;
      m.lab = { l: (m.lab.l * m.count + c.lab.l * c.count) / t, a: (m.lab.a * m.count + c.lab.a * c.count) / t, b: (m.lab.b * m.count + c.lab.b * c.count) / t };
      m.count = t;
    } else merged.push({ ...c });
  }
  return merged
    .map((m) => {
      const rgb = labToRgb(m.lab);
      const r = { r: Math.round(clamp255(rgb.r)), g: Math.round(clamp255(rgb.g)), b: Math.round(clamp255(rgb.b)) };
      return { rgb: r, hex: rgbToHex(r), share: Math.round((m.count / n) * 1000) / 1000 };
    })
    .filter((c) => c.share >= minShare)
    .sort((a, b) => b.share - a.share);
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

/** 여러 영역의 클러스터를 픽셀 수 가중으로 합친다 (팔레트 계산용) */
export function mergeClusterSets(sets: { clusters: ColorCluster[]; weight: number }[], mergeDeltaE = 8): ColorCluster[] {
  const acc: { lab: Lab; w: number }[] = [];
  let total = 0;
  for (const s of sets) {
    for (const c of s.clusters) {
      const w = c.share * s.weight;
      if (w <= 0) continue;
      total += w;
      const lab = rgbToLab(c.rgb);
      const m = acc.find((x) => deltaE2000(x.lab, lab) < mergeDeltaE);
      if (m) {
        const t = m.w + w;
        m.lab = { l: (m.lab.l * m.w + lab.l * w) / t, a: (m.lab.a * m.w + lab.a * w) / t, b: (m.lab.b * m.w + lab.b * w) / t };
        m.w = t;
      } else acc.push({ lab, w });
    }
  }
  if (!total) return [];
  return acc
    .sort((a, b) => b.w - a.w)
    .map((m) => {
      const rgb = labToRgb(m.lab);
      const r = { r: Math.round(clamp255(rgb.r)), g: Math.round(clamp255(rgb.g)), b: Math.round(clamp255(rgb.b)) };
      return { rgb: r, hex: rgbToHex(r), share: Math.round((m.w / total) * 1000) / 1000 };
    });
}
