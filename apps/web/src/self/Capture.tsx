'use client';

import { analyzeBodyImage, loadImage } from '@celeber/camera-body/flow';
import type { AnalyzeResponse as BodyResponse } from '@celeber/camera-body/lib';
import { buildDraft, captureVideoFrame, fileToCanvas, postAnalyze, postEnvironment, uploadCanvas, useCamera, useLiveBrightness } from '@celeber/camera-face/flow';
import type { CaptureDraft } from '@celeber/camera-face/flow';
import { encodeMask, reviewAction } from '@celeber/camera-face/lib';
import type { CaptureInput, EnvironmentResponse, SideCaptureInput } from '@celeber/camera-face/lib';
import type { UploadRecord } from '@celeber/core/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CaptureData, CaptureStep } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { CaptureStage } from '@/screens/02-self-capture';
import { Photo } from '@/ui';
import { writeCurrent } from '../current';
import { fetchSelfJson, postOptions } from './api';
import s from './Capture.module.css';

const steps: CaptureStep[] = [
  { id: 'environment', title: '주변 밝기를 확인할게요', preview: '', guide: '/photos/u-selfie.jpg' },
  { id: 'front', title: '정면을 바라봐 주세요', preview: '', guide: '/photos/u-front.jpg' },
  { id: 'side', title: '고개를 옆으로 돌려 주세요', preview: '', guide: '/photos/u-side.jpg' },
  { id: 'body', title: '전신이 나오게 서 주세요', preview: '', guide: '/photos/u-full.jpg', optional: true },
];

const directions = {
  environment: '얼굴을 비추는 쪽의 주변을 찍어 주세요.',
  front: '눈높이에 카메라를 두고 얼굴을 타원 안에 맞춰 주세요.',
  side: '얼굴 옆선이 보이게 고개를 돌려 주세요.',
  body: '머리부터 발끝까지 화면에 담아 주세요.',
};

const brightness = {
  'too-dark': '너무 어두워요',
  dim: '약간 어두워요',
  normal: '밝기 적정',
  bright: '약간 밝아요',
  'too-bright': '너무 밝아요',
};

type Draft = { kind: 'face'; value: CaptureDraft } | { kind: 'body'; canvas: HTMLCanvasElement; src: string; fromUpload: boolean };

function storedCapture(draft: CaptureDraft, upload: UploadRecord): SideCaptureInput {
  if (!draft.quality) throw new Error('얼굴 사진을 다시 찍어 주세요.');
  return {
    uploadId: upload.id,
    capturedAt: draft.capturedAt,
    landmarks: draft.landmarks,
    yawDeg: draft.yawDeg,
    pitchDeg: draft.pitchDeg,
    rollDeg: draft.rollDeg,
    quality: draft.quality.quality,
    fromUpload: draft.fromUpload,
    ...(draft.mask ? { mask: encodeMask(draft.mask) } : {}),
  };
}

async function analyzeBodyPhoto(draft: Extract<Draft, { kind: 'body' }>) {
  const upload = await uploadCanvas('', draft.canvas, 'body');
  const img = await loadImage(upload.url);
  const { analysis, outfitColors } = await analyzeBodyImage(img, {
    image: { uploadId: upload.id, url: upload.url, width: img.naturalWidth, height: img.naturalHeight },
    fromUpload: draft.fromUpload,
  });
  if (analysis.status !== 'complete') {
    throw new Error(analysis.failureReasons[0]?.message ?? '전신을 잴 수 없어요. 머리부터 발끝까지 보이게 찍어 주세요.');
  }
  const { session } = await fetchSelfJson<BodyResponse>('/api/body/analyze', postOptions({ analysis, outfitColors }));
  return session.id;
}

export function Capture() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [env, setEnv] = useState<EnvironmentResponse | null>(null);
  const [front, setFront] = useState<CaptureInput | null>(null);
  const [faceSessionId, setFaceSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState(0);
  const onScreen = useRef(true);
  const locked = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const step = steps[index];
  const camera = useCamera(video, !draft, step.id === 'environment' || step.id === 'body' ? 'environment' : 'user');
  const light = useLiveBrightness(video, step.id === 'environment' && !draft && camera.ready);
  const facingUser = step.id === 'front' || step.id === 'side';

  useEffect(() => {
    onScreen.current = true;
    return () => { onScreen.current = false; };
  }, []);

  async function run(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요. 다시 시도해 주세요.');
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  function take(makeCanvas: () => HTMLCanvasElement | Promise<HTMLCanvasElement>, fromUpload: boolean) {
    void run('사진을 확인하는 중이에요.', async () => {
      const canvas = await makeCanvas();
      if (step.id === 'body') setDraft({ kind: 'body', canvas, src: canvas.toDataURL('image/jpeg', 0.9), fromUpload });
      else setDraft({ kind: 'face', value: await buildDraft(canvas, step.id, fromUpload) });
      if (!fromUpload) setShots((value) => value + 1);
    });
  }

  function finish(faceId: string, bodySessionId?: string) {
    if (!onScreen.current) return;
    writeCurrent({ faceSessionId: faceId, ...(bodySessionId ? { bodySessionId } : {}) });
    router.replace(ROUTES.analysis);
  }

  function confirm() {
    if (!draft) return;
    const label = step.id === 'environment' ? '조명을 분석하는 중이에요.' : step.id === 'front' ? '정면 사진을 저장하는 중이에요.' : step.id === 'side' ? '얼굴을 분석하는 중이에요.' : '전신과 옷차림을 분석하는 중이에요.';
    void run(label, async () => {
      if (draft.kind === 'body') {
        if (faceSessionId) finish(faceSessionId, await analyzeBodyPhoto(draft));
        return;
      }
      const shot = draft.value;
      if (shot.pose === 'environment') {
        const upload = await uploadCanvas('', shot.canvas, 'environment');
        const result = await postEnvironment('', { uploadId: upload.id, fromUpload: shot.fromUpload });
        setEnv(result);
      } else if (shot.pose === 'front') {
        if (!shot.landmarks) return;
        const upload = await uploadCanvas('', shot.canvas, 'face-front');
        setFront({ ...storedCapture(shot, upload), landmarks: shot.landmarks });
      } else if (front) {
        const upload = await uploadCanvas('', shot.canvas, 'face-side');
        const result = await postAnalyze('', { sessionId: env?.sessionId, front, side: storedCapture(shot, upload) });
        setFaceSessionId(result.sessionId);
      }
      setDraft(null);
      setIndex((value) => value + 1);
    });
  }

  const faceDraft = draft?.kind === 'face' ? draft.value : null;
  const gate = faceDraft ? reviewAction(faceDraft.pose, faceDraft) : null;
  const draftSrc = draft?.kind === 'body' ? draft.src : faceDraft?.previewUrl;
  const status = busy ?? error ?? (draft ? gate?.note ?? '이 사진을 사용할까요?' : camera.error ?? (camera.ready ? directions[step.id] : '카메라를 여는 중이에요. 사진을 올릴 수도 있어요.'));
  const data: CaptureData = {
    steps,
    startIndex: 0,
    light: env
      ? { ok: !env.environment.retakeRecommended, items: [env.environment.lightSourceLabel, env.environment.brightness.label] }
      : { ok: light?.level === 'normal', items: [light ? brightness[light.level] : '주변광 확인'] },
  };

  return (
    <CaptureStage
      data={data}
      index={index}
      shots={shots}
      guideLabel={step.id === 'environment' ? '촬영 예시' : '자세 예시'}
      disabled={Boolean(busy)}
      shootDisabled={!camera.ready}
      status={<p role={error ? 'alert' : 'status'}>{status}</p>}
      preview={draftSrc
        ? <Photo src={draftSrc} alt="촬영한 사진" className={s.still} />
        : <video ref={video} className={facingUser ? s.mirrored : s.video} autoPlay playsInline muted aria-label="카메라 미리보기" />}
      review={draft ? { confirm: gate?.label ?? '사용하기', disabled: gate?.disabled, onConfirm: confirm, onRetake: () => { setError(null); setDraft(null); } } : undefined}
      onShoot={() => {
        const source = video.current;
        if (source && source.readyState >= 2 && source.videoWidth) take(() => captureVideoFrame(source), false);
      }}
      onUpload={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) take(() => fileToCanvas(file), true);
      }}
      onSkip={step.optional && faceSessionId ? () => finish(faceSessionId) : undefined}
    />
  );
}
