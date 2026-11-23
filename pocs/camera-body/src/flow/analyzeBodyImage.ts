'use client';
/**
 * 브라우저 측 전신 분석 파이프라인 (MediaPipe Tasks Vision, 로컬 wasm/모델).
 *   1) 이미지 → 캔버스(긴 변 maxEdge)
 *   2) PoseLandmarker(IMAGE, 최대 2명, 세그멘테이션 마스크) → 가장 큰 사람 선택
 *      사람을 못 찾았거나 발목이 흐리면 좌우(또는 위아래)에 여백을 붙인 정사각형 캔버스로 한 번 더 찾는다
 *   3) 머리 영역을 잘라 FaceLandmarker로 이마(10)·턱(152) → 머리 길이 정밀화 (실패 시 포즈 추정)
 *   4) computeBodyAnalysis (순수 함수) + 옷 색 측정
 * 얼굴 랜드마크는 머리 길이 측정에만 쓰며 신원 판단에 쓰지 않는다.
 */
import type { BodyAnalysis, ImageRef, Landmark3 } from '@celeber/core/contracts';
import { createFaceLandmarker, createPoseLandmarker } from '@celeber/ui/mediapipe';
import { computeBodyAnalysis, countExtraPeople, createFailedBodyAnalysis, meanLuminanceOf, noPersonIssue, type FaceHeadPoints } from '../lib/analyze';
import { sampleOutfitColors, type OutfitColors } from '../lib/outfit';
import { POSE } from '../lib/pose';
import type { PersonMask } from '../lib/silhouette';

export interface BrowserBodyResult {
  analysis: BodyAnalysis;
  outfitColors: OutfitColors;
  /** 머리 길이 산출 방식 설명용 */
  usedFace: boolean;
  usedMask: boolean;
}

export interface AnalyzeBodyImageOptions {
  image?: ImageRef;
  fromUpload?: boolean;
  /** 분석 해상도 (긴 변 px, 기본 1280) */
  maxEdge?: number;
  /** 'full'(기본, 9MB) | 'heavy'(정확, 30MB) */
  poseModel?: 'full' | 'heavy';
}

function drawToCanvas(src: CanvasImageSource, w: number, h: number, maxEdge: number): HTMLCanvasElement {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

interface PosePass {
  people: Landmark3[][];
  idx: number;
  mask: PersonMask | null;
}

/** 정사각형 여백 캔버스: 원본을 가운데에 두고 테두리 평균색으로 채운다 */
function padToSquare(canvas: HTMLCanvasElement, pixels: ImageData): { canvas: HTMLCanvasElement; offX: number; offY: number; side: number } {
  const W = canvas.width;
  const H = canvas.height;
  const side = Math.max(W, H);
  const offX = Math.round((side - W) / 2);
  const offY = Math.round((side - H) / 2);
  // 테두리(왼쪽·오른쪽 열, 위·아래 행) 평균색
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    r += pixels.data[i];
    g += pixels.data[i + 1];
    b += pixels.data[i + 2];
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
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.fillStyle = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(canvas, offX, offY);
  return { canvas: c, offX, offY, side };
}

const minAnkleVis = (lms: Landmark3[]) => Math.min(lms[POSE.leftAnkle]?.visibility ?? 0, lms[POSE.rightAnkle]?.visibility ?? 0);

const bboxArea = (lms: { x: number; y: number }[]) => {
  const xs = lms.map((l) => l.x);
  const ys = lms.map((l) => l.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

/** 포즈 머리 영역을 잘라 FaceLandmarker 실행 → 이마/턱 (원본 정규화 좌표) */
async function detectHeadPoints(canvas: HTMLCanvasElement, lms: Landmark3[]): Promise<FaceHeadPoints | null> {
  const W = canvas.width;
  const H = canvas.height;
  const eye = { x: ((lms[POSE.leftEye].x + lms[POSE.rightEye].x) / 2) * W, y: ((lms[POSE.leftEye].y + lms[POSE.rightEye].y) / 2) * H };
  const mouth = { x: ((lms[POSE.mouthLeft].x + lms[POSE.mouthRight].x) / 2) * W, y: ((lms[POSE.mouthLeft].y + lms[POSE.mouthRight].y) / 2) * H };
  const sh = Math.hypot((lms[POSE.leftShoulder].x - lms[POSE.rightShoulder].x) * W, (lms[POSE.leftShoulder].y - lms[POSE.rightShoulder].y) * H);
  const head = Math.max(Math.hypot(eye.x - mouth.x, eye.y - mouth.y) * 3, sh * 0.45, 24);
  const side = head * 2.2;
  const x0 = Math.max(0, eye.x - side / 2);
  const y0 = Math.max(0, eye.y - side / 2);
  const x1 = Math.min(W, eye.x + side / 2);
  const y1 = Math.min(H, eye.y + side / 2);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 16 || ch < 16) return null;
  const out = 384;
  const crop = document.createElement('canvas');
  const sc = out / Math.max(cw, ch);
  crop.width = Math.round(cw * sc);
  crop.height = Math.round(ch * sc);
  crop.getContext('2d')?.drawImage(canvas, x0, y0, cw, ch, 0, 0, crop.width, crop.height);
  const fl = await createFaceLandmarker({ runningMode: 'IMAGE', numFaces: 1 });
  const res = fl.detect(crop);
  const f = res.faceLandmarks?.[0];
  if (!f || f.length < 153) return null;
  const map = (p: { x: number; y: number }) => ({ x: (x0 + p.x * cw) / W, y: (y0 + p.y * ch) / H });
  // 눈 중심: 양쪽 눈의 안쪽·바깥쪽 눈꼬리(33·133, 362·263) 평균. 포즈 눈 점보다 흔들림이 작다
  const eyeMid = map({ x: (f[33].x + f[133].x + f[362].x + f[263].x) / 4, y: (f[33].y + f[133].y + f[362].y + f[263].y) / 4 });
  const pts: FaceHeadPoints = { foreheadTop: map(f[10]), chin: map(f[152]), eyeMid };
  // 얼굴 길이가 포즈 추정 머리 길이와 크게 어긋나면(오검출) 버린다
  const faceH = Math.hypot((pts.chin.x - pts.foreheadTop.x) * W, (pts.chin.y - pts.foreheadTop.y) * H) * 1.25;
  if (faceH < head * 0.55 || faceH > head * 1.8) return null;
  return pts;
}

export async function analyzeBodyImage(img: HTMLImageElement | HTMLCanvasElement, opts: AnalyzeBodyImageOptions = {}): Promise<BrowserBodyResult> {
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (!w || !h) throw new Error('이미지를 읽지 못했습니다.');
  const canvas = drawToCanvas(img, w, h, opts.maxEdge ?? 1280);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const meanLuminance = meanLuminanceOf(pixels);

  const pose = await createPoseLandmarker({ runningMode: 'IMAGE', model: opts.poseModel ?? 'full', numPoses: 2, outputSegmentationMasks: true });
  /** 포즈 검출 1회. pad가 있으면 여백 캔버스 좌표를 원본 정규화 좌표로, 마스크는 원본 영역만 잘라 되돌린다 */
  const detect = (src: HTMLCanvasElement, pad?: { offX: number; offY: number; side: number }): PosePass | null => {
    const res = pose.detect(src);
    try {
      const raw = res.landmarks ?? [];
      if (!raw.length) return null;
      const W = canvas.width;
      const H = canvas.height;
      const people: Landmark3[][] = raw.map((p) =>
        p.map((l) => (pad ? { x: (l.x * pad.side - pad.offX) / W, y: (l.y * pad.side - pad.offY) / H, z: l.z, visibility: l.visibility } : { x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
      );
      let idx = 0;
      people.forEach((p, i) => {
        if (bboxArea(p) > bboxArea(people[idx])) idx = i;
      });
      let mask: PersonMask | null = null;
      const m = res.segmentationMasks?.[idx];
      if (m) {
        try {
          const full = m.getAsFloat32Array();
          if (!pad) mask = { data: Float32Array.from(full), width: m.width, height: m.height, threshold: 0.5 };
          else {
            const s = m.width / pad.side;
            const x0 = Math.round(pad.offX * s);
            const y0 = Math.round(pad.offY * s);
            const mw = Math.max(1, Math.min(m.width - x0, Math.round(W * s)));
            const mh = Math.max(1, Math.min(m.height - y0, Math.round(H * (m.height / pad.side))));
            const data = new Float32Array(mw * mh);
            for (let y = 0; y < mh; y++) data.set(full.subarray((y0 + y) * m.width + x0, (y0 + y) * m.width + x0 + mw), y * mw);
            mask = { data, width: mw, height: mh, threshold: 0.5 };
          }
        } catch {
          mask = null;
        }
      }
      return { people, idx, mask };
    } finally {
      res.segmentationMasks?.forEach((mm) => mm.close());
    }
  };

  let pass = detect(canvas);
  // 세로로 긴 사진(흑백·저채도 사본 실측)은 사람을 놓치거나 발목을 흐리게 잡는다. 정사각형 여백 캔버스로 한 번 더 찾아 나은 쪽을 쓴다
  if (!pass || minAnkleVis(pass.people[pass.idx]) < 0.5) {
    const pad = padToSquare(canvas, pixels);
    const retry = pad.side > Math.min(canvas.width, canvas.height) ? detect(pad.canvas, pad) : null;
    if (retry && (!pass || minAnkleVis(retry.people[retry.idx]) > minAnkleVis(pass.people[pass.idx]))) pass = retry;
  }
  if (!pass) {
    return { analysis: createFailedBodyAnalysis([noPersonIssue(meanLuminance)], { image: opts.image, fromUpload: opts.fromUpload }), outfitColors: {}, usedFace: false, usedMask: false };
  }
  const { people, idx, mask } = pass;
  const landmarks: Landmark3[] = people[idx];

  let face: FaceHeadPoints | null = null;
  try {
    face = await detectHeadPoints(canvas, landmarks);
  } catch {
    face = null;
  }

  const analysis = computeBodyAnalysis({
    landmarks,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    face,
    mask,
    extraPeople: countExtraPeople(people, idx),
    meanLuminance,
    image: opts.image,
    fromUpload: opts.fromUpload,
  });
  const outfitColors = analysis.status === 'complete' || analysis.landmarks ? sampleOutfitColors(pixels, landmarks, mask) : {};
  return { analysis, outfitColors, usedFace: !!face, usedMask: !!mask };
}

/** URL → 로드된 HTMLImageElement */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}
