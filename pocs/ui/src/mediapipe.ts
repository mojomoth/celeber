'use client';
/**
 * MediaPipe Tasks Vision 로더 (브라우저 전용). wasm/모델은 각 앱 public/mediapipe/ 에 로컬로 있다(오프라인 동작).
 * 인스턴스는 옵션별로 캐시된다. 사용 후 앱을 떠날 때 closeAllVisionTasks()로 정리 가능.
 *
 * 예) const lm = await createFaceLandmarker({ runningMode: 'VIDEO' });
 *     const res = lm.detectForVideo(video, performance.now());
 */
import type { FaceLandmarker, FilesetResolver, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export const MEDIAPIPE_ASSETS = {
  wasm: '/mediapipe/wasm',
  faceLandmarker: '/mediapipe/models/face_landmarker.task',
  poseLandmarkerFull: '/mediapipe/models/pose_landmarker_full.task',
  poseLandmarkerHeavy: '/mediapipe/models/pose_landmarker_heavy.task',
  /** 0 배경, 1 헤어, 2 몸 피부, 3 얼굴 피부, 4 옷, 5 기타 */
  selfieMulticlass: '/mediapipe/models/selfie_multiclass_256x256.tflite',
} as const;

type Delegate = 'GPU' | 'CPU';
type RunningMode = 'IMAGE' | 'VIDEO';

let filesetPromise: Promise<WasmFileset> | null = null;
const cache = new Map<string, Promise<unknown>>();

async function vision() {
  return import('@mediapipe/tasks-vision');
}

/** wasm 파일셋 (1회 로드) */
export async function getVisionFileset(basePath: string = MEDIAPIPE_ASSETS.wasm): Promise<WasmFileset> {
  if (!filesetPromise) filesetPromise = vision().then((v) => v.FilesetResolver.forVisionTasks(basePath));
  return filesetPromise;
}

function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = make().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

/** GPU 실패 시 CPU로 재시도 */
async function withDelegate<T>(delegate: Delegate | undefined, make: (d: Delegate) => Promise<T>): Promise<T> {
  try {
    return await make(delegate ?? 'GPU');
  } catch (e) {
    if ((delegate ?? 'GPU') === 'GPU') return make('CPU');
    throw e;
  }
}

/** FaceLandmarker (478점, 홍채 포함). outputFacialTransformationMatrixes로 정확한 머리 자세 가능 */
export function createFaceLandmarker(opts: { runningMode?: RunningMode; numFaces?: number; outputFaceBlendshapes?: boolean; outputFacialTransformationMatrixes?: boolean; delegate?: Delegate } = {}): Promise<FaceLandmarker> {
  const o = { runningMode: 'IMAGE' as RunningMode, numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true, ...opts };
  return cached(`face:${JSON.stringify(o)}`, async () => {
    const [v, fs] = await Promise.all([vision(), getVisionFileset()]);
    return withDelegate(o.delegate, (delegate) =>
      v.FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MEDIAPIPE_ASSETS.faceLandmarker, delegate },
        runningMode: o.runningMode,
        numFaces: o.numFaces,
        outputFaceBlendshapes: o.outputFaceBlendshapes,
        outputFacialTransformationMatrixes: o.outputFacialTransformationMatrixes,
      }),
    );
  });
}

/** PoseLandmarker (33점). model: 'full'(기본, 9MB) | 'heavy'(정확, 29MB) */
export function createPoseLandmarker(opts: { runningMode?: RunningMode; model?: 'full' | 'heavy'; numPoses?: number; outputSegmentationMasks?: boolean; delegate?: Delegate } = {}): Promise<PoseLandmarker> {
  const o = { runningMode: 'IMAGE' as RunningMode, model: 'full' as const, numPoses: 1, outputSegmentationMasks: false, ...opts };
  return cached(`pose:${JSON.stringify(o)}`, async () => {
    const [v, fs] = await Promise.all([vision(), getVisionFileset()]);
    return withDelegate(o.delegate, (delegate) =>
      v.PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: o.model === 'heavy' ? MEDIAPIPE_ASSETS.poseLandmarkerHeavy : MEDIAPIPE_ASSETS.poseLandmarkerFull, delegate },
        runningMode: o.runningMode,
        numPoses: o.numPoses,
        outputSegmentationMasks: o.outputSegmentationMasks,
      }),
    );
  });
}

/** 셀피 멀티클래스 세그멘터 (헤어/피부/옷 분리 → 헤어 색 측정에 사용) */
export function createSelfieSegmenter(opts: { runningMode?: RunningMode; delegate?: Delegate } = {}): Promise<ImageSegmenter> {
  const o = { runningMode: 'IMAGE' as RunningMode, ...opts };
  return cached(`seg:${JSON.stringify(o)}`, async () => {
    const [v, fs] = await Promise.all([vision(), getVisionFileset()]);
    return withDelegate(o.delegate, (delegate) =>
      v.ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MEDIAPIPE_ASSETS.selfieMulticlass, delegate },
        runningMode: o.runningMode,
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    );
  });
}

/** 캐시된 모든 태스크 해제 */
export async function closeAllVisionTasks(): Promise<void> {
  const all = await Promise.allSettled([...cache.values()]);
  for (const r of all) if (r.status === 'fulfilled') (r.value as { close?: () => void }).close?.();
  cache.clear();
}

/** HTMLImageElement/Video/Canvas → ImageData (core/face sampleFaceColors 입력) */
export function toImageData(src: CanvasImageSource & { width?: number; height?: number }, width?: number, height?: number): ImageData {
  const w = width ?? (src as HTMLVideoElement).videoWidth ?? (src as HTMLImageElement).naturalWidth ?? src.width ?? 0;
  const h = height ?? (src as HTMLVideoElement).videoHeight ?? (src as HTMLImageElement).naturalHeight ?? src.height ?? 0;
  const c = document.createElement('canvas');
  c.width = Number(w);
  c.height = Number(h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context를 만들 수 없습니다.');
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}
