'use client';
/**
 * 얼굴 촬영 플로우: 안내 → 환경 → (환경 결과) → 정면 → 측면 → 분석.
 * - 각 촬영 단계: 단계 표시, 한 줄 지시, 프레이밍 가이드, 고정 셔터, 재촬영, 업로드 대체.
 * - 정면/측면은 FaceLandmarker로 실시간 품질 체크(검출·yaw·크기·밝기). 조건 미충족이면 셔터 비활성(8초 후 허용, 정면에서 얼굴이 없으면 계속 비활성).
 * - 확인 화면: 품질 오류가 있으면 '그래도 사용'으로 바꾸고 영향을 알린다. 측면이 정면에 가까우면 옆선을 그리지 않는다.
 * - 촬영 사진은 /api/uploads에 저장하고, 랜드마크·품질·세그멘테이션 마스크를 /api/face/analyze로 보내
 *   서버가 저장 이미지 픽셀로 피부색/윤곽을 계산해 face_sessions에 저장한다.
 * 다른 앱: import { FaceCaptureFlow } from '@celeber/camera-face/flow' — 호스트는 /api/face/*, /api/uploads를 재노출해야 한다.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { FaceAnalysis, Point2, UploadRecord } from '@celeber/core/contracts';
import { FACE_OVAL } from '@celeber/core/face';
import {
  AnalyzingOverlay,
  Button,
  CameraShell,
  Card,
  CornerFrameGuide,
  FaceOvalGuide,
  Icon,
  Notice,
  ProfileGuide,
  SectionHeader,
  StepIndicator,
} from '@celeber/ui';
import { type EnvironmentResponse, analyzeProfile, canForceShutter, encodeMask, isProfileUsable, reviewAction } from '../lib';
import { AnnotatedPhoto } from '../components/AnnotatedPhoto';
import { EnvironmentSummary } from '../components/EnvironmentSummary';
import { postAnalyze, postEnvironment } from './api';
import { type Facing, useCamera, useLiveBrightness, useLiveFace } from './hooks';
import { type CaptureDraft, type CapturePose, buildDraft, captureVideoFrame, fileToCanvas, uploadCanvas } from './vision';

export interface FaceCaptureResult {
  sessionId: string;
  analysis: FaceAnalysis;
  aiSource: 'ai' | 'mock' | 'skipped';
  warning?: string;
}

export interface FaceCaptureFlowProps {
  /** API 경로 접두사 (기본 '': 같은 앱의 /api/face/*) */
  apiBase?: string;
  onComplete: (result: FaceCaptureResult) => void;
  onCancel?: () => void;
  /** 단계 표시 라벨. 호스트가 뒤에 '전신(선택)'을 붙일 수 있다 */
  steps?: string[];
  skipIntro?: boolean;
  allowSkipSide?: boolean;
  allowSkipEnvironment?: boolean;
}

type Phase = 'intro' | 'environment' | 'env-result' | 'front' | 'side' | 'analyzing' | 'error';
interface Stored {
  draft: CaptureDraft;
  upload: UploadRecord;
}

const DEFAULT_STEPS = ['환경', '정면', '측면'];
const STEP_INDEX: Record<CapturePose, number> = { environment: 0, front: 1, side: 2 };
const FORCE_AFTER_MS = 8000;

export function FaceCaptureFlow({ apiBase = '', onComplete, onCancel, steps = DEFAULT_STEPS, skipIntro, allowSkipSide = true, allowSkipEnvironment = true }: FaceCaptureFlowProps) {
  const [phase, setPhase] = useState<Phase>(skipIntro ? 'environment' : 'intro');
  const [facing, setFacing] = useState<Facing>('user');
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [envResp, setEnvResp] = useState<EnvironmentResponse | null>(null);
  const [envUpload, setEnvUpload] = useState<UploadRecord | null>(null);
  const [whitePoint, setWhitePoint] = useState<Point2 | null>(null);
  const [front, setFront] = useState<Stored | null>(null);

  const pose: CapturePose | null = phase === 'environment' || phase === 'front' || phase === 'side' ? phase : null;
  const cameraActive = pose !== null && !draft;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cam = useCamera(videoRef, cameraActive, pose === 'environment' ? facing : 'user');
  const live = useLiveFace(videoRef, cameraActive && (pose === 'front' || pose === 'side') && cam.ready, pose === 'side' ? 'side' : 'front');
  const bright = useLiveBrightness(videoRef, cameraActive && pose === 'environment' && cam.ready);

  const process = useCallback(
    async (getCanvas: () => Promise<HTMLCanvasElement> | HTMLCanvasElement, fromUpload: boolean) => {
      if (!pose) return;
      setBusy('사진 확인 중');
      setError(null);
      try {
        const canvas = await getCanvas();
        setDraft(await buildDraft(canvas, pose, fromUpload));
      } catch (e) {
        setError((e as Error).message || '사진을 처리하지 못했습니다.');
      } finally {
        setBusy(null);
      }
    },
    [pose],
  );

  const shutter = () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    void process(() => captureVideoFrame(v), false);
  };
  const upload = (file: File) => void process(() => fileToCanvas(file), true);

  const runAnalyze = useCallback(
    async (f: Stored, s: Stored | null, sessionId: string | undefined) => {
      setPhase('analyzing');
      setError(null);
      try {
        const cap = (st: Stored) => ({
          uploadId: st.upload.id,
          capturedAt: st.draft.capturedAt,
          yawDeg: st.draft.yawDeg,
          pitchDeg: st.draft.pitchDeg,
          rollDeg: st.draft.rollDeg,
          quality: st.draft.quality!.quality,
          fromUpload: st.draft.fromUpload,
          ...(st.draft.mask ? { mask: encodeMask(st.draft.mask) } : {}),
        });
        const res = await postAnalyze(apiBase, {
          ...(sessionId ? { sessionId } : {}),
          front: { ...cap(f), landmarks: f.draft.landmarks! },
          side: s ? { ...cap(s), landmarks: s.draft.landmarks } : null,
        });
        onComplete({ sessionId: res.sessionId, analysis: res.analysis, aiSource: res.aiSource, ...(res.warning ? { warning: res.warning } : {}) });
      } catch (e) {
        setError((e as Error).message);
        setPhase('error');
      }
    },
    [apiBase, onComplete],
  );

  const [pendingSide, setPendingSide] = useState<Stored | null | undefined>(undefined);

  const confirmDraft = async () => {
    if (!draft || !pose) return;
    setBusy(pose === 'environment' ? '조명을 분석하고 있습니다' : '사진을 저장하고 있습니다');
    setError(null);
    try {
      const kind = pose === 'environment' ? 'environment' : pose === 'front' ? 'face-front' : 'face-side';
      const rec = await uploadCanvas(apiBase, draft.canvas, kind);
      if (pose === 'environment') {
        const r = await postEnvironment(apiBase, { uploadId: rec.id, ...(envResp?.sessionId ? { sessionId: envResp.sessionId } : {}), fromUpload: draft.fromUpload });
        setEnvUpload(rec);
        setEnvResp(r);
        setWhitePoint(null);
        setDraft(null);
        setPhase('env-result');
      } else if (pose === 'front') {
        setFront({ draft, upload: rec });
        setDraft(null);
        setPhase('side');
      } else {
        const s = { draft, upload: rec };
        setPendingSide(s);
        setDraft(null);
        await runAnalyze(front!, s, envResp?.sessionId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pickWhite = async (p: Point2) => {
    if (!envResp || !envUpload) return;
    setWhitePoint(p);
    setBusy('흰 종이 기준으로 다시 계산 중');
    setError(null);
    try {
      setEnvResp(await postEnvironment(apiBase, { uploadId: envUpload.id, sessionId: envResp.sessionId, whitePoint: p, skipAi: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const clearWhite = async () => {
    if (!envResp || !envUpload) return;
    setWhitePoint(null);
    setBusy('다시 계산 중');
    try {
      setEnvResp(await postEnvironment(apiBase, { uploadId: envUpload.id, sessionId: envResp.sessionId, whitePoint: null, skipAi: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reviewOverlay = useMemo(() => {
    if (!draft?.landmarks) return { contour: null, profile: null };
    if (draft.pose === 'side') {
      if (!isProfileUsable({ landmarks: draft.landmarks, yawDeg: draft.yawDeg, quality: draft.quality?.quality })) return { contour: null, profile: null };
      return { contour: null, profile: analyzeProfile({ landmarks: draft.landmarks, width: draft.width, height: draft.height, yawDeg: draft.yawDeg, mask: draft.mask }) };
    }
    return { contour: FACE_OVAL.map((i) => ({ x: draft.landmarks![i].x, y: draft.landmarks![i].y })), profile: null };
  }, [draft]);

  /* ------------------------------------------------------------ 안내 */
  if (phase === 'intro') {
    return (
      <div className="cb-camera" role="region" aria-label="촬영 안내">
        <div className="cb-camera__top">
          <div className="cb-camera__topbar">
            {onCancel ? (
              <button type="button" className="cb-icon-btn" onClick={onCancel} aria-label="닫기">
                <Icon name="close" size={22} />
              </button>
            ) : (
              <span style={{ width: 44 }} />
            )}
            <div className="cb-camera__title">얼굴 촬영</div>
            <span className="cb-camera__count">0 / {steps.length}</span>
          </div>
          <StepIndicator steps={steps} current={-1} dark />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 24px', gap: 18 }}>
          <div className="cb-caption" style={{ color: 'var(--cb-camera-text)' }}>
            촬영 전에
          </div>
          <p style={{ fontSize: 21, lineHeight: '28px', fontWeight: 650, margin: 0 }}>밝고 고른 빛을 마주 보고 서기</p>
          <p style={{ fontSize: 21, lineHeight: '28px', fontWeight: 650, margin: 0 }}>안경·모자 벗고 앞머리 정리하기</p>
          <p style={{ fontSize: 21, lineHeight: '28px', fontWeight: 650, margin: 0 }}>카메라는 눈높이에, 팔 길이만큼</p>
          <p className="cb-caption" style={{ color: 'var(--cb-camera-text)', maxWidth: 300, margin: 0 }}>
            흰 종이가 있으면 환경 촬영 때 화면에 함께 담아 주세요. 종이를 눌러 피부색 보정 기준으로 쓸 수 있습니다.
          </p>
        </div>
        <div className="cb-camera__bottom cb-stack-sm">
          <Button variant="dark" block onClick={() => setPhase('environment')}>
            준비됐어요
          </Button>
          {allowSkipEnvironment ? (
            <Button variant="dark-outline" block onClick={() => setPhase('front')}>
              환경 촬영 건너뛰기
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ 분석 중 / 오류 */
  if (phase === 'analyzing' || phase === 'error') {
    return (
      <div className="cb-page" style={{ paddingTop: 24 }}>
        <div className="cb-stack">
          <StepIndicator steps={steps} current={steps.length - 1} />
          <div style={{ position: 'relative' }}>
            {front ? <AnnotatedPhoto src={front.draft.previewUrl} width={front.draft.width} height={front.draft.height} alt="정면 사진" label="정면" /> : null}
            {phase === 'analyzing' ? <AnalyzingOverlay message="피부색과 윤곽을 계산하고 있습니다" sub="화이트밸런스 보정 · 피부 ROI · 얼굴 비율 · 옆선" /> : null}
          </div>
          {phase === 'error' ? (
            <>
              <Notice tone="danger" title="분석하지 못했습니다">
                {error}
              </Notice>
              <Button block onClick={() => front && void runAnalyze(front, pendingSide ?? null, envResp?.sessionId)}>
                다시 시도
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => {
                  setFront(null);
                  setPendingSide(undefined);
                  setPhase('front');
                }}
              >
                정면부터 다시 촬영
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ 환경 결과 */
  if (phase === 'env-result' && envResp && envUpload) {
    const e = envResp.environment;
    return (
      <div className="cb-page" style={{ paddingTop: 16 }}>
        <div className="cb-stack">
          <StepIndicator steps={steps} current={0} />
          <SectionHeader title="환경 분석" subtitle={e.retakeRecommended ? '조명 때문에 피부색이 왜곡될 수 있습니다' : '이 조명에서 얼굴을 촬영합니다'} />
          <div style={{ position: 'relative' }}>
            <AnnotatedPhoto src={envUpload.url} width={envUpload.width ?? 900} height={envUpload.height ?? 1200} alt="환경 사진. 흰 종이를 눌러 기준 백색 지정" label="흰 종이를 눌러 기준 지정(선택)" onPick={pickWhite} marker={whitePoint} />
            {busy ? <AnalyzingOverlay message={busy} /> : null}
          </div>
          {envResp.whiteReference ? <Notice tone={envResp.whiteReference.ok ? 'ok' : 'warn'}>{envResp.whiteReference.message}</Notice> : null}
          {whitePoint ? (
            <Button variant="ghost" size="sm" onClick={() => void clearWhite()}>
              기준 백색 지정 취소
            </Button>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {envResp.warning ? <Notice tone="info">{envResp.warning}</Notice> : null}
          <Card>
            <EnvironmentSummary environment={e} />
          </Card>
          <div className="cb-stack-sm">
            {e.retakeRecommended ? (
              <>
                <Button block icon="refresh" onClick={() => setPhase('environment')}>
                  조명을 바꾸고 다시 촬영
                </Button>
                <Button variant="secondary" block onClick={() => setPhase('front')}>
                  그래도 정면 촬영으로
                </Button>
              </>
            ) : (
              <>
                <Button block onClick={() => setPhase('front')}>
                  다음: 정면 촬영
                </Button>
                <Button variant="secondary" block icon="refresh" onClick={() => setPhase('environment')}>
                  환경 다시 촬영
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ 촬영 단계 */
  const p = pose ?? 'environment';
  const title = p === 'environment' ? '환경 촬영' : p === 'front' ? '정면 촬영' : '측면 촬영';
  const q = live.result;
  const faceStep = p !== 'environment';
  const forceAllowed = faceStep && canForceShutter(p === 'side' ? 'side' : 'front', live.failingMs, !!q?.quality.faceDetected, FORCE_AFTER_MS);
  const noFaceStuck = p === 'front' && !forceAllowed && live.failingMs > FORCE_AFTER_MS && !q?.quality.faceDetected;
  const shutterDisabled = !!busy || !cam.ready || (faceStep && !live.stableReady && !forceAllowed);

  let instruction: string;
  let hint: string | null = null;
  let status: { tone: 'ok' | 'warn' | 'danger' | 'info'; text: string } | null = null;
  let guide = null;
  if (draft) {
    const dq = draft.quality;
    instruction = p === 'environment' ? '이 사진으로 조명을 분석할까요?' : dq?.quality.faceDetected ? (dq.ready ? '이 사진을 사용할까요?' : dq.message) : dq?.message ?? '얼굴을 찾지 못했습니다.';
    hint = dq?.quality.issues.filter((i) => i.severity !== 'error').map((i) => i.message).join(' · ') || (draft.fromUpload ? '업로드한 사진' : null);
    status = p === 'environment' ? null : dq?.quality.faceDetected ? { tone: dq.ready ? 'ok' : 'warn', text: `좌우 ${Math.round(Math.abs(draft.yawDeg))}° · 얼굴 크기 ${Math.round(dq.quality.faceSizeRatio * 100)}%` } : { tone: 'danger', text: '얼굴 미검출' };
  } else if (p === 'environment') {
    instruction = '주변과 빛이 보이게 찍어 주세요';
    hint = bright ? `밝기 ${bright.meanLuma}/255` : '카메라 준비 중';
    status = bright ? { tone: bright.level === 'normal' || bright.level === 'bright' ? 'ok' : bright.level === 'dim' ? 'warn' : 'danger', text: `밝기 ${bright.level === 'normal' ? '적정' : bright.level === 'bright' ? '밝음' : bright.level === 'dim' ? '조금 어두움' : bright.level === 'too-dark' ? '너무 어두움' : '과다 노출'}` } : null;
    guide = <CornerFrameGuide state={bright && (bright.level === 'too-dark' || bright.level === 'too-bright') ? 'warn' : 'idle'} />;
  } else {
    instruction = q ? q.message : p === 'front' ? '정면을 보고 얼굴을 윤곽선에 맞춰 주세요' : '고개를 옆으로 돌려 옆얼굴을 보여 주세요';
    if (live.loading) status = { tone: 'info', text: '얼굴 인식 준비 중' };
    else if (live.error) status = { tone: 'danger', text: live.error };
    else if (q) status = { tone: live.stableReady ? 'ok' : q.quality.faceDetected ? 'warn' : 'danger', text: q.quality.faceDetected ? `좌우 ${Math.round(Math.abs(live.yawDeg ?? 0))}° · 크기 ${Math.round(q.quality.faceSizeRatio * 100)}% · 밝기 ${Math.round(q.quality.faceBrightness)}` : '얼굴 미검출' };
    hint = forceAllowed
      ? '조건이 맞지 않아도 촬영할 수 있습니다. 결과 신뢰도가 낮아질 수 있어요.'
      : noFaceStuck
        ? '얼굴이 보여야 촬영할 수 있습니다. 카메라에 얼굴이 잡히지 않으면 사진을 업로드해 주세요.'
        : p === 'side' ? '왼쪽·오른쪽 어느 쪽이든 괜찮습니다. 60~80°가 좋습니다.' : '안경을 벗고 앞머리가 이마를 가리지 않게 해 주세요.';
    const gs = q ? (live.stableReady ? 'ok' : q.quality.faceDetected ? 'warn' : 'idle') : 'idle';
    guide = p === 'front' ? <FaceOvalGuide state={gs} /> : <ProfileGuide state={gs} />;
  }
  if (cam.error && !draft) hint = cam.error;

  const action = draft ? reviewAction(p, draft) : null;
  const reviewFooter = draft ? (
    <div className="cb-stack-sm" style={{ marginTop: 16 }}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {action?.note ? <Notice tone="warn">{action.note}</Notice> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Button variant="dark-outline" icon="refresh" onClick={() => setDraft(null)} disabled={!!busy}>
          다시 촬영
        </Button>
        <Button variant="dark" onClick={() => void confirmDraft()} loading={!!busy} disabled={action?.disabled}>
          {action?.label ?? '사용하기'}
        </Button>
      </div>
    </div>
  ) : error ? (
    <div style={{ marginTop: 12 }}>
      <Notice tone="danger">{error}</Notice>
    </div>
  ) : null;

  const secondary = draft
    ? undefined
    : p === 'environment'
      ? { label: '카메라 전환', icon: 'swap' as const, onClick: () => setFacing((f) => (f === 'user' ? 'environment' : 'user')) }
      : p === 'side' && allowSkipSide
        ? {
            label: '건너뛰기',
            icon: 'skip' as const,
            onClick: () => {
              setPendingSide(null);
              void runAnalyze(front!, null, envResp?.sessionId);
            },
          }
        : undefined;

  return (
    <CameraShell
      title={title}
      steps={steps}
      currentStep={STEP_INDEX[p]}
      instruction={instruction}
      hint={hint}
      status={status}
      guide={draft ? null : guide}
      overlay={busy ? <AnalyzingOverlay message={busy} /> : null}
      onShutter={draft ? undefined : shutter}
      shutterDisabled={shutterDisabled}
      onUpload={draft ? undefined : upload}
      uploadLabel="업로드"
      secondaryAction={secondary}
      onClose={onCancel}
      hideShutter={!!draft}
      footer={reviewFooter}
    >
      {draft ? (
        <AnnotatedPhoto fit="contain" src={draft.previewUrl} width={draft.width} height={draft.height} alt={`${title} 미리보기`} contour={reviewOverlay.contour} profile={reviewOverlay.profile} />
      ) : (
        <video ref={videoRef} playsInline muted autoPlay style={{ transform: p !== 'environment' || facing === 'user' ? 'scaleX(-1)' : undefined }} />
      )}
      {cam.error && !draft ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'var(--cb-camera-text)', fontSize: 14 }}>{cam.error}</div>
      ) : null}
    </CameraShell>
  );
}
