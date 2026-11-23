'use client';
/**
 * 브라우저 전용 캡처/검출 유틸: 비디오 프레임·파일 → 캔버스, FaceLandmarker(IMAGE) 검출, 셀피 세그멘테이션,
 * 품질 평가, 업로드. 모든 좌표는 비반전(원본) 이미지 기준 정규화 좌표다.
 */
import { createFaceLandmarker, createSelfieSegmenter } from '@celeber/ui/mediapipe';
import { quietMediapipeInfoLogs } from './mediapipe-log';
import type { Landmark3, UploadKind, UploadRecord } from '@celeber/core/contracts';
import { faceBoxFromLandmarks } from '@celeber/core/face';
import { type CategoryMask, type QualityResult, downsampleMask, evaluateCaptureQuality, faceLumaOf, poseFromMatrix, sharpnessOf } from '../lib';

export { faceLumaOf };

export type CapturePose = 'environment' | 'front' | 'side';

export interface CaptureDraft {
  pose: CapturePose;
  canvas: HTMLCanvasElement;
  previewUrl: string;
  width: number;
  height: number;
  fromUpload: boolean;
  capturedAt: string;
  landmarks: Landmark3[] | null;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  quality: QualityResult | null;
  mask: CategoryMask | null;
}

export const CAPTURE_MAX_EDGE = 1600;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 비디오 현재 프레임 → 캔버스 (미러 없이 원본 방향) */
export function captureVideoFrame(video: HTMLVideoElement, maxEdge = CAPTURE_MAX_EDGE): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const s = Math.min(1, maxEdge / Math.max(vw, vh));
  const c = makeCanvas(vw * s, vh * s);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

/** 파일 → 캔버스 (EXIF 회전 반영) */
export async function fileToCanvas(file: File, maxEdge = CAPTURE_MAX_EDGE): Promise<HTMLCanvasElement> {
  if (file.type && !/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(file.type)) throw new Error('JPEG, PNG, WebP 이미지 파일을 선택해 주세요.');
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      bmp = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('이미지를 열 수 없습니다. HEIC라면 JPEG로 변환해 올려 주세요.'));
        im.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = makeCanvas(w * s, h * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  if ('close' in bmp) bmp.close();
  return c;
}

export function canvasImageData(c: HTMLCanvasElement): ImageData {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
}

/** FaceLandmarker IMAGE 모드 검출 */
export async function detectFaceOnCanvas(c: HTMLCanvasElement): Promise<{ landmarks: Landmark3[]; matrix: number[] | null } | null> {
  quietMediapipeInfoLogs();
  const lm = await createFaceLandmarker({ runningMode: 'IMAGE' });
  const res = lm.detect(c);
  const pts = res.faceLandmarks?.[0];
  if (!pts?.length) return null;
  return {
    landmarks: pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
    matrix: res.facialTransformationMatrixes?.[0]?.data ? Array.from(res.facialTransformationMatrixes[0].data) : null,
  };
}

/** 셀피 멀티클래스 세그멘테이션 → 256px 카테고리 마스크 (실패 시 null) */
export async function segmentCanvas(c: HTMLCanvasElement): Promise<CategoryMask | null> {
  try {
    quietMediapipeInfoLogs();
    const seg = await createSelfieSegmenter({ runningMode: 'IMAGE' });
    const res = seg.segment(c);
    const m = res.categoryMask;
    if (!m) return null;
    const data = m.getAsUint8Array();
    const out = downsampleMask({ width: m.width, height: m.height, data }, 256);
    res.close?.();
    return out;
  } catch (e) {
    console.warn('[camera-face] segmentation 실패, 마스크 없이 진행', e);
    return null;
  }
}

/** 캔버스 → 캡처 초안 (검출/품질/마스크). 환경 단계는 검출하지 않는다. */
export async function buildDraft(canvas: HTMLCanvasElement, pose: CapturePose, fromUpload: boolean): Promise<CaptureDraft> {
  const base: CaptureDraft = {
    pose,
    canvas,
    previewUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: canvas.width,
    height: canvas.height,
    fromUpload,
    capturedAt: new Date().toISOString(),
    landmarks: null,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    quality: null,
    mask: null,
  };
  if (pose === 'environment') return base;
  const det = await detectFaceOnCanvas(canvas);
  const img = canvasImageData(canvas);
  if (!det) {
    const q = evaluateCaptureQuality({ pose, landmarks: null, faceLuma: null });
    const mask = pose === 'side' ? await segmentCanvas(canvas) : null;
    return { ...base, quality: q, mask };
  }
  const pose3 = poseFromMatrix(det.matrix, det.landmarks, canvas.width, canvas.height);
  const box = faceBoxFromLandmarks(det.landmarks);
  const quality = evaluateCaptureQuality({
    pose,
    landmarks: det.landmarks,
    yawDeg: pose3.yawDeg,
    pitchDeg: pose3.pitchDeg,
    rollDeg: pose3.rollDeg,
    faceLuma: faceLumaOf(img, det.landmarks),
    sharpness: sharpnessOf(img, box),
  });
  const mask = await segmentCanvas(canvas);
  return { ...base, landmarks: det.landmarks, yawDeg: pose3.yawDeg, pitchDeg: pose3.pitchDeg, rollDeg: pose3.rollDeg, quality, mask };
}

/** 캔버스를 JPEG로 업로드 → UploadRecord */
export async function uploadCanvas(apiBase: string, canvas: HTMLCanvasElement, kind: UploadKind): Promise<UploadRecord> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 인코딩 실패'))), 'image/jpeg', 0.92));
  const fd = new FormData();
  fd.append('file', blob, `${kind}.jpg`);
  fd.append('kind', kind);
  const res = await fetch(`${apiBase}/api/uploads`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(await errorMessage(res, '사진 업로드에 실패했습니다.'));
  return (await res.json()) as UploadRecord;
}

export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ? `${fallback} (${j.error.message})` : fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}
