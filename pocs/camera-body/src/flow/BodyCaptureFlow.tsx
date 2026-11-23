'use client';
/**
 * 전신 사진 업로드(주) / 카메라 촬영(보조) / 건너뛰기 플로우.
 *   intro → (upload | camera) → analyzing → review → saving → onComplete({ analysis, session, outfit })
 * 다른 PoC가 "@celeber/camera-body/flow"로 import한다. API는 apiBase + '/api/uploads', '/api/body/analyze'.
 * 호스트 앱은 app/api/body/analyze/route.ts 에서 analyzePOST를 재노출해야 한다(persist=true일 때).
 */
import type { BodyAnalysis, BodySession, ImageRef, UploadRecord } from '@celeber/core/contracts';
import { AnalyzingOverlay, AppHeader, BodyFrameGuide, Button, CameraShell, Card, FileButton, Notice, PageContainer, PhotoFrame, SectionHeader } from '@celeber/ui';
import { createPoseLandmarker } from '@celeber/ui/mediapipe';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSkippedBodyAnalysis } from '../lib/analyze';
import { framingFeedback, type FramingFeedback } from '../lib/framing';
import type { OutfitColors } from '../lib/outfit';
import type { AnalyzeResponse, OutfitMeta } from '../lib/types';
import { BodyIssues, BodyResultView } from '../components/BodyResultView';
import { analyzeBodyImage, loadImage } from './analyzeBodyImage';
import { analyzingNote, bodyUploadErrorMessage, precheckBodyUpload } from './uploadMessages';

export interface BodyFlowResult {
  analysis: BodyAnalysis;
  /** persist=true면 저장된 세션 */
  session: BodySession | null;
  outfit: OutfitMeta | null;
}

export interface BodyCaptureFlowProps {
  /** 호스트 앱 API 접두사 (기본 '') */
  apiBase?: string;
  onComplete: (r: BodyFlowResult) => void;
  /** 지정하면 건너뛰기 시 onComplete 대신 호출 (analysis.status === 'skipped') */
  onSkip?: (r: BodyFlowResult) => void;
  allowSkip?: boolean;
  /** body_sessions에 저장 (기본 true) */
  persist?: boolean;
  /** 저장 시 Claude 비전 코디 서술 (기본 true; 키 없으면 색 측정 요약) */
  describeOutfit?: boolean;
  label?: string;
  /** 상위 촬영 단계 표시 (예: ['환경','정면','측면','전신'], 3) */
  steps?: string[];
  currentStep?: number;
  onClose?: () => void;
  /** 첫 화면 (기본 'intro') */
  initialMode?: 'intro' | 'camera';
  poseModel?: 'full' | 'heavy';
  /** 인트로 화면 상단 헤더 표시 (기본 true) */
  showHeader?: boolean;
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'camera' }
  | { kind: 'analyzing'; previewUrl: string; message: string }
  | { kind: 'review'; analysis: BodyAnalysis; outfitColors: OutfitColors; previewUrl: string }
  | { kind: 'saving'; analysis: BodyAnalysis; outfitColors: OutfitColors; previewUrl: string };

const ACCEPT = 'image/jpeg,image/png,image/webp';

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `요청 실패 (${res.status})`;
  } catch {
    return `요청 실패 (${res.status})`;
  }
}

/** 어떤 값이 throw되어도 사람이 읽을 수 있는 사유 (MediaPipe 로드 실패는 Error가 아닌 값으로 reject되기도 함) */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' && (e as { message: string }).message) return (e as { message: string }).message;
  if (e && typeof e === 'object' && 'type' in e && (e as { type: unknown }).type === 'error') return fallback; // DOM Event (스크립트·wasm 로드 실패)
  return fallback;
}

const MODEL_LOAD_FALLBACK = '분석 모델을 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';

type ReturnPhase = 'intro' | 'camera';

function TipsFigure() {
  return (
    <svg viewBox="0 0 120 160" width="96" height="128" aria-hidden="true">
      <rect x="2" y="2" width="116" height="156" rx="10" fill="var(--cb-paper)" stroke="var(--cb-line)" />
      <rect x="34" y="10" width="52" height="140" rx="6" fill="none" stroke="var(--cb-iris)" strokeDasharray="3 2" />
      <circle cx="60" cy="27" r="8" fill="var(--cb-ink)" />
      <path d="M48 40 h24 l4 40 h-6 l-2 -24 l-2 30 h-16 l-2 -30 l-2 24 h-6 z" fill="var(--cb-ink)" />
      <path d="M52 86 h16 l-1 54 h-6 l-1 -40 l-1 40 h-6 z" fill="var(--cb-text-2)" />
      <line x1="20" y1="140" x2="100" y2="140" stroke="var(--cb-coral)" strokeWidth="1.5" />
      <line x1="20" y1="19" x2="100" y2="19" stroke="var(--cb-coral)" strokeWidth="1.5" />
    </svg>
  );
}

const noopSubscribe = () => () => {};
/** 서버 렌더·하이드레이션 중에는 false, 하이드레이션 후 true */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** 플로팅 '데모 데이터' 배지가 카메라 하단 버튼(건너뛰기 등)을 가리지 않게 카메라 화면에서만 숨긴다.
 *  카메라 화면 자체는 데모 데이터를 보여 주지 않으므로 숨겨도 정보가 사라지지 않는다. */
const CAMERA_BADGE_CSS = '.cb-mock-badge--floating{display:none !important}';

const FIELDSET_RESET = { border: 0, padding: 0, margin: 0, minWidth: 0 } as const;

export function BodyCaptureFlow(props: BodyCaptureFlowProps) {
  const { apiBase = '', onComplete, onSkip, allowSkip = true, persist = true, describeOutfit = true, label, steps, currentStep, onClose, initialMode = 'intro', poseModel, showHeader = true } = props;
  const [phase, setPhase] = useState<Phase>(initialMode === 'camera' ? { kind: 'camera' } : { kind: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  // 하이드레이션 전에는 업로드/촬영 버튼을 막는다 (그 사이 고른 파일은 change 핸들러가 없어 사라진다)
  const hydrated = useHydrated();
  // 로컬 미리보기 object URL — 새로 만들 때·서버 저장본으로 바뀔 때·언마운트 시 해제
  const objectUrlRef = useRef<string | null>(null);
  const releasePreview = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);
  useEffect(() => releasePreview, [releasePreview]);

  const save = useCallback(
    async (analysis: BodyAnalysis, outfitColors: OutfitColors): Promise<BodyFlowResult> => {
      if (!persist) return { analysis, session: null, outfit: null };
      const res = await fetch(`${apiBase}/api/body/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysis, outfitColors, label, describeOutfit }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const j = (await res.json()) as AnalyzeResponse;
      return { analysis: j.session.analysis, session: j.session, outfit: j.outfit };
    },
    [apiBase, persist, label, describeOutfit],
  );

  const runAnalysis = useCallback(
    async (record: UploadRecord, fromUpload: boolean, localPreview: string, returnTo: ReturnPhase) => {
      setError(null);
      setPhase({ kind: 'analyzing', previewUrl: localPreview, message: '관절점을 찾는 중' });
      try {
        const image: ImageRef = { uploadId: record.id, url: record.url, width: record.width ?? undefined, height: record.height ?? undefined };
        // 서버가 회전/정규화한 저장본으로 분석해야 오버레이 좌표가 저장 이미지와 맞는다
        const img = await loadImage(`${apiBase}${record.url}`);
        if (!image.width || !image.height) {
          image.width = img.naturalWidth;
          image.height = img.naturalHeight;
        }
        setPhase({ kind: 'analyzing', previewUrl: `${apiBase}${record.url}`, message: '비율을 계산하는 중' });
        releasePreview();
        const r = await analyzeBodyImage(img, { image, fromUpload, poseModel });
        setPhase({ kind: 'review', analysis: r.analysis, outfitColors: r.outfitColors, previewUrl: `${apiBase}${record.url}` });
      } catch (e) {
        setError(`분석에 실패했습니다: ${errorMessage(e, MODEL_LOAD_FALLBACK)}`);
        releasePreview();
        setPhase({ kind: returnTo });
      }
    },
    [apiBase, poseModel, releasePreview],
  );

  const uploadFile = useCallback(
    async (file: File, returnTo: ReturnPhase = 'intro') => {
      setError(null);
      const rejected = precheckBodyUpload(file);
      if (rejected) {
        setError(rejected);
        return;
      }
      releasePreview();
      const preview = URL.createObjectURL(file);
      objectUrlRef.current = preview;
      setPhase({ kind: 'analyzing', previewUrl: preview, message: '사진을 올리는 중' });
      try {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('kind', 'body');
        const res = await fetch(`${apiBase}/api/uploads`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(bodyUploadErrorMessage(res.status, await readError(res), file));
        await runAnalysis((await res.json()) as UploadRecord, true, preview, returnTo);
      } catch (e) {
        setError(errorMessage(e, '사진을 올리지 못했습니다. 다시 시도해 주세요.'));
        releasePreview();
        setPhase({ kind: returnTo });
      }
    },
    [apiBase, runAnalysis, releasePreview],
  );

  const uploadDataUrl = useCallback(
    async (dataUrl: string) => {
      setError(null);
      setPhase({ kind: 'analyzing', previewUrl: dataUrl, message: '사진을 저장하는 중' });
      try {
        const res = await fetch(`${apiBase}/api/uploads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl, kind: 'body' }) });
        if (!res.ok) throw new Error(await readError(res));
        await runAnalysis((await res.json()) as UploadRecord, false, dataUrl, 'camera');
      } catch (e) {
        setError(errorMessage(e, '촬영한 사진을 저장하지 못했습니다. 다시 촬영해 주세요.'));
        setPhase({ kind: 'camera' });
      }
    },
    [apiBase, runAnalysis],
  );

  const skip = useCallback(async () => {
    setSkipping(true);
    setError(null);
    try {
      const r = await save(createSkippedBodyAnalysis(), {});
      (onSkip ?? onComplete)(r);
    } catch (e) {
      setError(errorMessage(e, '건너뛰기를 저장하지 못했습니다.'));
    } finally {
      setSkipping(false);
    }
  }, [save, onSkip, onComplete]);

  const confirm = useCallback(async () => {
    if (phase.kind !== 'review') return;
    setPhase({ ...phase, kind: 'saving' });
    try {
      onComplete(await save(phase.analysis, phase.outfitColors));
    } catch (e) {
      setError(`저장에 실패했습니다: ${errorMessage(e, '네트워크를 확인해 주세요.')}`);
      setPhase({ ...phase, kind: 'review' });
    }
  }, [phase, save, onComplete]);

  if (phase.kind === 'camera') {
    return (
      <BodyCamera
        steps={steps}
        currentStep={currentStep}
        onClose={onClose ?? (() => setPhase({ kind: 'intro' }))}
        onCapture={uploadDataUrl}
        onUpload={(f) => void uploadFile(f, 'camera')}
        onSkip={allowSkip ? skip : undefined}
        error={error}
      />
    );
  }

  return (
    <>
      {showHeader ? <AppHeader title="전신 사진" right={onClose ? <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button> : undefined} /> : null}
      <PageContainer>
        <div className="cb-stack">
          {steps && currentStep !== undefined ? <div className="cb-caption cb-muted">{`${currentStep + 1} / ${steps.length} · ${steps[currentStep]}`}</div> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}

          {phase.kind === 'intro' ? (
            <>
              <div>
                <h1 className="cb-screen-title">전신 비율 측정</h1>
                <p className="cb-body cb-muted" style={{ marginTop: 8 }}>
                  머리부터 발끝까지 보이는 정면 사진 한 장으로 등신, 상·하체, 어깨·골반 비율을 잽니다.
                </p>
              </div>
              <Card tone="paper">
                <div className="cb-row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <TipsFigure />
                  <ul className="cb-list cb-body" style={{ margin: 0 }}>
                    <li>모자는 벗고, 정수리와 발바닥이 모두 보이게</li>
                    <li>정면으로 곧게, 팔은 몸에서 살짝 떼기</li>
                    <li>카메라는 허리 높이에서 수평으로</li>
                    <li>몸선이 보이는 옷일수록 정확</li>
                  </ul>
                </div>
              </Card>
              <fieldset className="cb-stack-sm" disabled={!hydrated} aria-busy={!hydrated} style={FIELDSET_RESET}>
                <legend className="cb-visually-hidden">전신 사진 입력 방법</legend>
                <FileButton onFile={(f) => void uploadFile(f, 'intro')} variant="primary" block accept={ACCEPT}>
                  전신 사진 업로드
                </FileButton>
                <Button variant="secondary" icon="camera" block onClick={() => setPhase({ kind: 'camera' })}>
                  카메라로 촬영
                </Button>
                {allowSkip ? (
                  <Button variant="ghost" icon="skip" block onClick={skip} loading={skipping}>
                    건너뛰기
                  </Button>
                ) : null}
              </fieldset>
              {allowSkip ? <p className="cb-caption cb-muted">건너뛰면 결과에서 몸 비율이 &lsquo;전신 사진 추가&rsquo; 상태로 남고, 나중에 추가할 수 있습니다.</p> : null}
            </>
          ) : null}

          {phase.kind === 'analyzing' ? (
            <div style={{ position: 'relative' }}>
              <PhotoFrame src={phase.previewUrl} alt="분석 중인 전신 사진" aspect="3 / 4" />
              <AnalyzingOverlay message={phase.message} sub={analyzingNote(describeOutfit, persist)} />
            </div>
          ) : null}

          {phase.kind === 'review' || phase.kind === 'saving' ? (
            <>
              <SectionHeader title={phase.analysis.status === 'complete' ? '측정 결과 확인' : '측정하지 못했습니다'} subtitle={phase.analysis.status === 'complete' ? '오버레이가 몸에 맞게 놓였는지 확인해 주세요.' : '아래 사유를 확인하고 다른 사진을 골라 주세요.'} />
              <div style={{ position: 'relative' }}>
                {phase.analysis.status === 'complete' ? (
                  <BodyResultView analysis={phase.analysis} apiBase={apiBase} compact />
                ) : (
                  <div className="cb-stack">
                    <PhotoFrame src={phase.previewUrl} alt="측정하지 못한 사진" aspect={phase.analysis.image?.width && phase.analysis.image.height ? `${phase.analysis.image.width} / ${phase.analysis.image.height}` : '3 / 4'} />
                    <BodyIssues analysis={phase.analysis} />
                  </div>
                )}
                {phase.kind === 'saving' ? <AnalyzingOverlay message="저장하는 중" sub={describeOutfit ? '코디 서술을 함께 만듭니다.' : undefined} /> : null}
              </div>
              <div className="cb-stack-sm">
                {phase.analysis.status === 'complete' ? (
                  <Button variant="primary" block onClick={confirm} loading={phase.kind === 'saving'}>
                    이 결과 사용
                  </Button>
                ) : null}
                <FileButton onFile={(f) => void uploadFile(f, 'intro')} variant={phase.analysis.status === 'complete' ? 'secondary' : 'primary'} block accept={ACCEPT}>
                  다른 사진 선택
                </FileButton>
                <Button variant="secondary" icon="camera" block onClick={() => setPhase({ kind: 'camera' })}>
                  카메라로 다시 촬영
                </Button>
                {phase.analysis.status === 'failed' ? (
                  <Button variant="ghost" block onClick={confirm} disabled={phase.kind === 'saving'}>
                    측정 실패 상태로 기록
                  </Button>
                ) : null}
                {allowSkip ? (
                  <Button variant="ghost" icon="skip" block onClick={skip} loading={skipping}>
                    건너뛰기
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </PageContainer>
    </>
  );
}

/* ------------------------------------------------------------------ 카메라 */

function BodyCamera({
  steps,
  currentStep,
  onClose,
  onCapture,
  onUpload,
  onSkip,
  error,
}: {
  steps?: string[];
  currentStep?: number;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  onUpload: (file: File) => void;
  onSkip?: () => void;
  error: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<FramingFeedback | null>(null);
  const [timer, setTimer] = useState<0 | 3 | 10>(3);
  const [countdown, setCountdown] = useState<number | null>(null);

  // 스트림 시작/정리
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      setReady(false);
      setCamError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError('이 브라우저에서는 카메라를 쓸 수 없습니다. 사진 업로드를 이용해 주세요.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
          setReady(true);
        }
      } catch (e) {
        setCamError(`카메라를 열 수 없습니다 (${(e as Error).name}). 권한을 허용하거나 사진을 업로드해 주세요.`);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  // 실시간 프레이밍 피드백 (약 5fps)
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let pose: Awaited<ReturnType<typeof createPoseLandmarker>>;
      try {
        pose = await createPoseLandmarker({ runningMode: 'VIDEO', model: 'full', numPoses: 1 });
      } catch {
        setFeedback({ state: 'idle', tone: 'info', message: '자세 인식을 불러오지 못했습니다. 프레임에 맞춰 직접 촬영해 주세요' });
        return;
      }
      let last = -1;
      const tick = () => {
        if (stop) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.currentTime !== last) {
          last = v.currentTime;
          try {
            const r = pose.detectForVideo(v, performance.now());
            setFeedback(framingFeedback(r.landmarks?.[0] ?? null));
          } catch {
            /* 프레임 하나 실패는 무시 */
          }
        }
        timerId = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => {
      stop = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [ready]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    onCapture(c.toDataURL('image/jpeg', 0.92));
  }, [onCapture]);

  // 셀프 타이머
  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        capture();
      } else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, capture]);

  const shutter = () => (timer ? setCountdown(timer) : capture());
  const guideState = feedback?.state ?? 'idle';

  return (
    <>
      <style>{CAMERA_BADGE_CSS}</style>
      <CameraShell
        title="전신 촬영"
        steps={steps}
        currentStep={currentStep}
        instruction={countdown !== null ? `${countdown}초 뒤 촬영합니다` : '머리부터 발끝까지 세로 프레임에 맞춰 주세요'}
        hint={camError ?? error ?? (feedback ? '휴대폰을 허리 높이에 두고 2~3m 떨어져 서면 잘 맞습니다.' : ready ? '자세 인식 준비 중' : '카메라 준비 중')}
        status={feedback && !camError ? { tone: feedback.tone, text: feedback.message } : null}
        guide={<BodyFrameGuide state={guideState} />}
        overlay={
          countdown !== null ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 96, fontWeight: 800, color: '#FFFDF8', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }} aria-live="assertive">
              {countdown}
            </div>
          ) : undefined
        }
        onShutter={shutter}
        shutterDisabled={!ready || countdown !== null}
        onUpload={onUpload}
        uploadLabel="업로드"
        secondaryAction={onSkip ? { label: '건너뛰기', onClick: onSkip, icon: 'skip' } : undefined}
        onClose={onClose}
        footer={
          <div className="cb-row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button type="button" className="cb-camera__side-btn" onClick={() => setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))} aria-label="셀프 타이머 변경">
              타이머 {timer ? `${timer}초` : '끔'}
            </button>
            <button type="button" className="cb-camera__side-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
              {facing === 'user' ? '후면 카메라' : '전면 카메라'}
            </button>
          </div>
        }
      >
        <video ref={videoRef} playsInline muted style={{ objectFit: 'contain', transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
      </CameraShell>
    </>
  );
}
