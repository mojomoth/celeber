'use client';
/**
 * 카메라 스트림과 실시간 품질 체크 훅.
 */
import { useEffect, useState, type RefObject } from 'react';
import { createFaceLandmarker } from '@celeber/ui/mediapipe';
import { quietMediapipeInfoLogs } from './mediapipe-log';
import { faceBoxFromLandmarks } from '@celeber/core/face';
import { type BrightnessLevel, type QualityResult, evaluateCaptureQuality, poseFromMatrix, quickBrightness } from '../lib';
import { faceLumaOf } from './vision';

export type Facing = 'user' | 'environment';

export interface CameraState {
  videoRef: RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
}

/** getUserMedia 스트림. active=false면 정지. facing이 바뀌면 다시 연다. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, facing: Facing): Omit<CameraState, 'videoRef'> {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const video = videoRef.current;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('이 브라우저에서는 카메라를 쓸 수 없습니다. 사진 업로드를 이용해 주세요.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video ?? videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
          if (v.readyState >= 2) setReady(true);
          else v.onloadeddata = () => setReady(true);
        }
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? '카메라 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 사진 업로드를 이용해 주세요.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? '사용할 수 있는 카메라가 없습니다. 사진 업로드를 이용해 주세요.'
              : '카메라를 열 수 없습니다. 사진 업로드를 이용해 주세요.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      setReady(false);
      setError(null);
    };
  }, [videoRef, active, facing]);

  return { ready, error };
}

/** 환경 단계: 300ms마다 프레임 밝기 */
export function useLiveBrightness(videoRef: RefObject<HTMLVideoElement | null>, active: boolean): { level: BrightnessLevel; meanLuma: number } | null {
  const [state, setState] = useState<{ level: BrightnessLevel; meanLuma: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!ctx || !v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const b = quickBrightness(ctx.getImageData(0, 0, c.width, c.height));
      setState({ level: b.level, meanLuma: Math.round(b.meanLuma) });
    }, 300);
    return () => window.clearInterval(id);
  }, [videoRef, active]);
  return active ? state : null;
}

export interface LiveFaceState {
  result: QualityResult | null;
  /** 연속 3회 이상 통과 */
  stableReady: boolean;
  loading: boolean;
  error: string | null;
  yawDeg: number | null;
  /** 조건 미충족이 지속된 시간(ms) — 일정 시간 후 '그래도 촬영' 허용 */
  failingMs: number;
}

const INITIAL_LIVE: LiveFaceState = { result: null, stableReady: false, loading: true, error: null, yawDeg: null, failingMs: 0 };

/** 정면/측면 단계: FaceLandmarker VIDEO 모드로 약 10fps 품질 체크 */
export function useLiveFace(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, pose: 'front' | 'side'): LiveFaceState {
  const [state, setState] = useState<LiveFaceState>(INITIAL_LIVE);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stopped = false;
    let last = 0;
    let okCount = 0;
    let failSince = performance.now();
    let prevNose: { x: number; y: number } | null = null;
    let lm: Awaited<ReturnType<typeof createFaceLandmarker>> | null = null;
    const small = document.createElement('canvas');
    small.width = 160;
    small.height = 120;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    quietMediapipeInfoLogs();
    createFaceLandmarker({ runningMode: 'VIDEO' })
      .then((l) => {
        lm = l;
        if (!stopped) setState((s) => ({ ...s, loading: false }));
      })
      .catch(() => {
        if (!stopped) setState((s) => ({ ...s, loading: false, error: '얼굴 인식 모델을 불러오지 못했습니다. 사진 업로드를 이용해 주세요.' }));
      });
    const tick = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!lm || !v || v.readyState < 2 || t - last < 100) return;
      last = t;
      let res;
      try {
        res = lm.detectForVideo(v, performance.now());
      } catch {
        return;
      }
      const pts = res.faceLandmarks?.[0] ?? null;
      let faceLuma: number | null = null;
      let pose3 = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
      let stability = 1;
      if (pts && sctx) {
        sctx.drawImage(v, 0, 0, small.width, small.height);
        faceLuma = faceLumaOf(sctx.getImageData(0, 0, small.width, small.height), pts);
        pose3 = poseFromMatrix(res.facialTransformationMatrixes?.[0]?.data, pts, v.videoWidth, v.videoHeight);
        const nose = pts[1];
        const box = faceBoxFromLandmarks(pts);
        if (prevNose) stability = Math.max(0, Math.min(1, 1 - (Math.hypot(nose.x - prevNose.x, nose.y - prevNose.y) / Math.max(0.01, box.h)) * 8));
        prevNose = { x: nose.x, y: nose.y };
      } else prevNose = null;
      const q = evaluateCaptureQuality({ pose, landmarks: pts, ...pose3, faceLuma, stability });
      okCount = q.ready && stability > 0.6 ? okCount + 1 : 0;
      if (q.ready) failSince = t;
      setState({ result: q, stableReady: okCount >= 3, loading: false, error: null, yawDeg: pts ? pose3.yawDeg : null, failingMs: t - failSince });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      setState(INITIAL_LIVE);
    };
  }, [videoRef, active, pose]);
  return state;
}
