/**
 * 브라우저 측정: FaceLandmarker(피부/헤어/눈 색) + PoseLandmarker(인물 수·프레이밍·의상 영역·체형 비율)
 * + 셀피 멀티클래스 세그멘터(헤어/옷 마스크) → VibeMeasurement.
 * 각 단계가 실패해도 나머지 측정은 계속하고 notes에 사유를 남긴다.
 * 브라우저 전용 (canvas, MediaPipe wasm).
 */
import { type Rgb, deltaE2000, rgbToLab } from '@celeber/core/color';
import { type CategoryMaskLike, SELFIE_MULTICLASS, boundingBox, estimateHeadPose, faceBoxFromLandmarks, isSkinLike, pointInPolygon, sampleFaceColors } from '@celeber/core/face';
import { createFaceLandmarker, createPoseLandmarker, createSelfieSegmenter } from '@celeber/ui/mediapipe';
import { dominantColors } from '../lib/kmeans';
import { type DetectorStatus, type FaceMeasurement, type MBox, MEASUREMENT_LIMITS, type RegionMeasurement, type VibeMeasurement } from '../lib/measurement';
import { type P2, type PosePoint, clampBox, headCrop, estimateBodyRatios, framingFromPose, minAnkleVisibility, outfitRegions, personBox, poseVisibility, preferPaddedPose, unpadPoint } from '../lib/pose';
import { sceneStats } from '../lib/stats';

const MAX_EDGE = 1024;

/** 이미지 URL → 로드된 HTMLImageElement (같은 출처 /api/uploads/<id> 권장: canvas 오염 방지) */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}

function toCanvas(img: HTMLImageElement): { canvas: HTMLCanvasElement; data: ImageData; scale: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context를 만들 수 없습니다.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height), scale };
}

/** 정사각형 여백 캔버스: 원본을 가운데에 두고 테두리 평균색으로 채운다. 이미 정사각형이면 null */
function padToSquare(canvas: HTMLCanvasElement, data: ImageData): { canvas: HTMLCanvasElement; offX: number; offY: number; side: number } | null {
  const W = canvas.width;
  const H = canvas.height;
  const side = Math.max(W, H);
  if (side === Math.min(W, H)) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    r += data.data[i];
    g += data.data[i + 1];
    b += data.data[i + 2];
    n++;
  };
  for (let y = 0; y < H; y += 4) {
    add(0, y);
    add(W - 1, y);
  }
  for (let x = 0; x < W; x += 4) {
    add(x, 0);
    add(x, H - 1);
  }
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  ctx.fillRect(0, 0, side, side);
  const offX = Math.round((side - W) / 2);
  const offY = Math.round((side - H) / 2);
  ctx.drawImage(canvas, offX, offY);
  return { canvas: c, offX, offY, side };
}

function boxArea(b: MBox) {
  return b.w * b.h;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rBox = (b: MBox): MBox => ({ x: r3(b.x), y: r3(b.y), w: r3(b.w), h: r3(b.h) });
const rRgb = (c: Rgb): Rgb => ({ r: Math.round(c.r * 10) / 10, g: Math.round(c.g * 10) / 10, b: Math.round(c.b * 10) / 10 });

function maskAt(mask: CategoryMaskLike, w: number, h: number, x: number, y: number): number {
  const mx = Math.min(mask.width - 1, Math.floor((x / w) * mask.width));
  const my = Math.min(mask.height - 1, Math.floor((y / h) * mask.height));
  return mask.data[my * mask.width + mx];
}

/** 정규화 다각형들 안의 픽셀 (마스크 카테고리/피부 제외 필터) */
function polygonPixels(img: ImageData, polys: P2[][], mask: CategoryMaskLike | undefined, maxPixels = 5000): Rgb[] {
  const W = img.width;
  const H = img.height;
  const pxPolys = polys.map((p) => p.map((q) => ({ x: q.x * W, y: q.y * H })));
  const strict: Rgb[] = [];
  const loose: Rgb[] = [];
  for (const poly of pxPolys) {
    const bb = boundingBox(poly);
    const x0 = Math.max(0, Math.floor(bb.x));
    const y0 = Math.max(0, Math.floor(bb.y));
    const x1 = Math.min(W - 1, Math.ceil(bb.x + bb.w));
    const y1 = Math.min(H - 1, Math.ceil(bb.y + bb.h));
    const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    const step = Math.max(1, Math.floor(Math.sqrt((area * polys.length) / maxPixels)));
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        if (!pointInPolygon({ x: x + 0.5, y: y + 0.5 }, poly)) continue;
        const i = (y * W + x) * 4;
        const r = img.data[i];
        const g = img.data[i + 1];
        const b = img.data[i + 2];
        const skin = isSkinLike(r, g, b);
        if (mask) {
          const c = maskAt(mask, W, H, x, y);
          if (c === SELFIE_MULTICLASS.clothes || c === SELFIE_MULTICLASS.others) strict.push({ r, g, b });
          else if (!skin && c !== SELFIE_MULTICLASS.background && c !== SELFIE_MULTICLASS.hair) loose.push({ r, g, b });
        } else if (!skin) loose.push({ r, g, b });
      }
    }
  }
  // 마스크가 옷을 충분히 못 잡으면(전신 사진에서 셀피 모델 한계) 피부 제외 필터로 대체
  return strict.length >= 80 ? strict : [...strict, ...loose];
}

/** 랜드마크(region 기준 정규화) → 얼굴 측정. region은 전체 이미지 기준 정규화 영역, regionHeightPx는 원본 해상도 높이 */
function faceFromLandmarks(lms: { x: number; y: number; z: number }[], data: ImageData, mask: CategoryMaskLike | undefined, region: MBox, regionHeightPx: number): FaceMeasurement | undefined {
  const s = sampleFaceColors(data, lms, { categoryMask: mask });
  if (!(s.skin.overall.used > 0 && Number.isFinite(s.skin.overall.rgb.r))) return undefined;
  const regions = Object.values(s.skin.regions).filter((r) => r && Number.isFinite(r.rgb.r));
  let spread = 0;
  let pairs = 0;
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      spread += deltaE2000(rgbToLab(regions[i]!.rgb), rgbToLab(regions[j]!.rgb));
      pairs++;
    }
  const b = faceBoxFromLandmarks(lms);
  const box = { x: region.x + b.x * region.w, y: region.y + b.y * region.h, w: b.w * region.w, h: b.h * region.h };
  return {
    box: rBox(clampBox(box)),
    heightPx: Math.round(b.h * regionHeightPx),
    yawDeg: Math.round(estimateHeadPose(lms, data.width, data.height).yawDeg),
    faceMeanLuma: Math.round(s.faceMeanLuma * 10) / 10,
    skin: { rgb: rRgb(s.skin.overall.rgb), used: s.skin.overall.used, lumaStd: Math.round(s.skin.overall.lumaStd * 10) / 10 },
    skinRegionCount: regions.length,
    regionSpreadDeltaE: pairs ? Math.round((spread / pairs) * 10) / 10 : 0,
    hair: s.hair && Number.isFinite(s.hair.rgb.r) ? { rgb: rRgb(s.hair.rgb), used: s.hair.used, lumaStd: Math.round(s.hair.lumaStd * 10) / 10, method: s.hair.method } : undefined,
    eyes: s.eyes && Number.isFinite(s.eyes.rgb.r) ? { rgb: rRgb(s.eyes.rgb), used: s.eyes.used } : undefined,
    lips: s.lips && Number.isFinite(s.lips.rgb.r) ? { rgb: rRgb(s.lips.rgb), used: s.lips.used } : undefined,
  };
}

export interface MeasureProgress {
  (step: string): void;
}

/**
 * 이미지 → VibeMeasurement. src는 같은 출처 URL 또는 로드된 이미지.
 * @example const m = await measureVibeImage('/api/uploads/up_xxx');
 */
export async function measureVibeImage(src: string | HTMLImageElement, onProgress?: MeasureProgress): Promise<VibeMeasurement> {
  const t0 = performance.now();
  const img = typeof src === 'string' ? await loadImage(src) : src;
  const { canvas, data } = toCanvas(img);
  const W = data.width;
  const H = data.height;
  const aspect = W / H;
  const notes: string[] = [];
  const note = (msg: string) => {
    if (notes.length < MEASUREMENT_LIMITS.notes) notes.push(msg.slice(0, MEASUREMENT_LIMITS.noteLength));
  };
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
  const detectors: { face: DetectorStatus; pose: DetectorStatus; segmentation: DetectorStatus } = { face: 'ok', pose: 'ok', segmentation: 'ok' };
  const scene = sceneStats(data);

  // 1) 세그멘테이션 (헤어/옷 마스크)
  let mask: CategoryMaskLike | undefined;
  onProgress?.('헤어·옷 영역 나누는 중');
  try {
    const seg = await createSelfieSegmenter({ runningMode: 'IMAGE' });
    const res = seg.segment(canvas);
    const m = res.categoryMask;
    if (m) {
      mask = { data: new Uint8Array(m.getAsUint8Array()), width: m.width, height: m.height };
      m.close();
    }
    res.close?.();
  } catch (e) {
    detectors.segmentation = 'failed';
    note(`세그멘테이션 실패: ${errMsg(e)}`);
  }

  // 2) 얼굴 (전체 이미지)
  onProgress?.('얼굴 랜드마크 찾는 중');
  let faceCount = 0;
  let faceBoxes: MBox[] = [];
  let face: FaceMeasurement | undefined;
  try {
    const fl = await createFaceLandmarker({ runningMode: 'IMAGE', numFaces: 4 });
    const res = fl.detect(canvas);
    const faces = res.faceLandmarks.map((lms) => ({ lms, box: faceBoxFromLandmarks(lms) })).sort((a, b) => boxArea(b.box) - boxArea(a.box));
    faceCount = faces.length;
    faceBoxes = faces.map((f) => rBox(clampBox(f.box)));
    const main = faces[0];
    if (main) {
      face = faceFromLandmarks(main.lms, data, mask, { x: 0, y: 0, w: 1, h: 1 }, img.naturalHeight);
      if (!face) note('얼굴은 찾았지만 피부 픽셀을 충분히 얻지 못했습니다.');
    }
  } catch (e) {
    detectors.face = 'failed';
    note(`얼굴 검출기 실패: ${errMsg(e)}`);
  }

  // 3) 포즈 → 인물 수, 프레이밍, 의상 영역, 체형 비율
  onProgress?.('자세와 의상 영역 찾는 중');
  let poseCount = 0;
  let pose: VibeMeasurement['pose'];
  const regions: RegionMeasurement[] = [];
  let body: VibeMeasurement['body'];
  try {
    const pl = await createPoseLandmarker({ runningMode: 'IMAGE', numPoses: 3 });
    const detectPeople = (src: HTMLCanvasElement, pad?: { offX: number; offY: number; side: number }) =>
      pl
        .detect(src)
        .landmarks.map((lms) =>
          lms.map((p): PosePoint => {
            const q = { x: p.x, y: p.y, v: p.visibility ?? 0 };
            return pad ? unpadPoint(q, pad, W, H) : q;
          }),
        )
        .map((kp) => ({ kp, box: personBox(kp) }))
        .sort((a, b) => boxArea(b.box) - boxArea(a.box));
    let people = detectPeople(canvas);
    // 세로로 긴 흑백·어두운 전신 사진은 사람을 놓치거나 발목을 흐리게 잡아 상반신으로 판정된다.
    // 정사각형 여백 캔버스로 한 번 더 찾아 나은 쪽을 쓴다 (camera-body와 같은 보정)
    if (!people.length || minAnkleVisibility(people[0].kp) < 0.5) {
      const pad = padToSquare(canvas, data);
      const retry = pad ? detectPeople(pad.canvas, pad) : [];
      if (preferPaddedPose(people[0]?.kp, retry[0]?.kp)) people = retry;
    }
    // 너무 작은 검출(배경 인물/오검출)은 인원수에서 제외
    const big = people.filter((p) => boxArea(p.box) >= boxArea(people[0]?.box ?? { x: 0, y: 0, w: 0, h: 0 }) * 0.15);
    poseCount = big.length;
    const main = people[0];
    if (main) {
      const vis = poseVisibility(main.kp);
      pose = {
        keypoints: main.kp.map((p) => ({ x: r3(p.x), y: r3(p.y), v: r3(p.v) })),
        visible: vis,
        framing: framingFromPose(vis, faceCount > 0),
        personBox: rBox(main.box),
      };
      for (const reg of outfitRegions(main.kp, aspect)) {
        const px = polygonPixels(data, reg.polys, mask);
        const box = boundingBox(reg.polys.flat());
        if (px.length < 40) continue;
        regions.push({ key: reg.key, box: rBox(clampBox(box)), pixelCount: px.length, clusters: dominantColors(px, { k: 3, seed: reg.key }) });
      }
      body = estimateBodyRatios(main.kp, aspect, face?.box);
    }
  } catch (e) {
    detectors.pose = 'failed';
    note(`포즈 검출기 실패: ${errMsg(e)}`);
  }
  // 2-b) 전신 사진처럼 얼굴이 작아 못 찾았으면 포즈의 머리 위치를 원본 해상도로 잘라 다시 찾는다
  if (!face && pose?.visible.head) {
    onProgress?.('얼굴 확대해서 다시 찾는 중');
    try {
      const crop = headCrop(pose.keypoints, img.naturalWidth, img.naturalHeight);
      if (crop) {
        const cc = document.createElement('canvas');
        const side = Math.min(512, Math.max(256, Math.round(crop.w * img.naturalWidth * 2)));
        cc.width = side;
        cc.height = Math.round(side * ((crop.h * img.naturalHeight) / (crop.w * img.naturalWidth)));
        const ctx = cc.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, crop.x * img.naturalWidth, crop.y * img.naturalHeight, crop.w * img.naturalWidth, crop.h * img.naturalHeight, 0, 0, cc.width, cc.height);
          const cdata = ctx.getImageData(0, 0, cc.width, cc.height);
          const fl = await createFaceLandmarker({ runningMode: 'IMAGE', numFaces: 1 });
          const res = fl.detect(cc);
          const lms = res.faceLandmarks[0];
          if (lms) {
            let cmask: CategoryMaskLike | undefined;
            try {
              const seg = await createSelfieSegmenter({ runningMode: 'IMAGE' });
              const sr = seg.segment(cc);
              if (sr.categoryMask) {
                cmask = { data: new Uint8Array(sr.categoryMask.getAsUint8Array()), width: sr.categoryMask.width, height: sr.categoryMask.height };
                sr.categoryMask.close();
              }
              sr.close?.();
            } catch {
              /* 마스크 없이 진행 */
            }
            face = faceFromLandmarks(lms, cdata, cmask, crop, crop.h * img.naturalHeight);
            if (face) {
              faceCount = Math.max(faceCount, 1);
              faceBoxes = [face.box, ...faceBoxes];
              note(`얼굴이 작아 머리 영역(원본 ${Math.round(crop.w * img.naturalWidth)}px)을 확대해 측정했습니다.`);
              body = estimateBodyRatios(pose.keypoints, aspect, face.box) ?? body;
            }
          } else note('머리 영역을 확대해도 얼굴 랜드마크를 찾지 못했습니다 (가림/뒷모습/저해상도).');
        }
      }
    } catch (e) {
      note(`얼굴 재측정 실패: ${errMsg(e)}`);
    }
  }

  if (!regions.some((r) => r.key === 'torsoCenter' || r.key === 'torsoSides') && faceCount > 0) {
    // 몸통 영역을 못 얻었으면(얼굴 위주·어깨가 잘린 사진) 턱 아래를 상의로 본다
    const fb = face?.box ?? faceBoxes[0];
    if (fb) {
      const top = fb.y + fb.h * 1.1;
      const bottom = Math.min(1, top + fb.h);
      if (bottom - top >= 0.03) {
        const poly: P2[] = [
          { x: Math.max(0, fb.x - fb.w * 0.3), y: top },
          { x: Math.min(1, fb.x + fb.w * 1.3), y: top },
          { x: Math.min(1, fb.x + fb.w * 1.3), y: bottom },
          { x: Math.max(0, fb.x - fb.w * 0.3), y: bottom },
        ];
        const px = polygonPixels(data, [poly], mask);
        if (px.length >= 40) regions.push({ key: 'torsoCenter', box: rBox(clampBox(boundingBox(poly))), pixelCount: px.length, clusters: dominantColors(px, { k: 3, seed: 'torsoCenter' }) });
      }
    }
  }

  return {
    version: 1,
    width: img.naturalWidth,
    height: img.naturalHeight,
    analyzedWidth: W,
    analyzedHeight: H,
    faceCount,
    poseCount,
    faceBoxes: faceBoxes.slice(0, MEASUREMENT_LIMITS.faceBoxes),
    face,
    pose,
    regions,
    body,
    scene: {
      ...scene,
      meanLuma: Math.round(scene.meanLuma * 10) / 10,
      clippedHigh: r3(scene.clippedHigh),
      clippedLow: r3(scene.clippedLow),
      meanSaturation: r3(scene.meanSaturation),
    },
    segmentation: !!mask,
    durationMs: Math.round(performance.now() - t0),
    detectors,
    notes,
  };
}
