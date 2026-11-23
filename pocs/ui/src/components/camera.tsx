'use client';
/**
 * 카메라 셸: 어두운 촬영 바탕 + 단계 표시 + 한 줄 지시 + 프레이밍 가이드 슬롯 + 고정 셔터 + 업로드 대체.
 * 카메라 스트림(getUserMedia)·검출 로직은 각 PoC가 children으로 넣는다 (<video>, <canvas> 등).
 */
import clsx from 'clsx';
import { useRef, type ReactNode } from 'react';
import { StepIndicator } from './basic';
import { Icon } from './icons';

export interface CameraShellProps {
  /** 상단 제목 (예: '정면 촬영') */
  title: ReactNode;
  /** 단계 이름들과 현재 단계 (예: ['환경','정면','측면','전신'], 1) */
  steps?: string[];
  currentStep?: number;
  /** 한 줄 지시 (예: '정면을 보고 얼굴을 윤곽선에 맞춰 주세요') */
  instruction: ReactNode;
  /** 보조 힌트 (예: '밝기 적정 · 얼굴 크기 OK') */
  hint?: ReactNode;
  /** 미디어 상단 상태 pill */
  status?: { tone: 'ok' | 'warn' | 'danger' | 'info'; text: ReactNode } | null;
  /** 프리뷰 미디어 (<video>/<img>/<canvas>) */
  children?: ReactNode;
  /** 프레이밍 가이드 오버레이 (FaceOvalGuide 등) */
  guide?: ReactNode;
  /** 미디어 위 임의 오버레이 (AnalyzingOverlay 등) */
  overlay?: ReactNode;
  onShutter?: () => void;
  shutterDisabled?: boolean;
  shutterLabel?: string;
  /** 업로드 대체 경로 (데스크톱/테스트). 지정하면 좌측 버튼 표시 */
  onUpload?: (file: File) => void;
  uploadLabel?: string;
  /** 우측 보조 동작 (예: 건너뛰기, 재촬영) */
  secondaryAction?: { label: string; onClick: () => void; icon?: 'skip' | 'refresh' | 'swap' };
  onClose?: () => void;
  /** 하단 추가 영역 (결과 미리보기/다음 버튼 등) — 셔터 대신 표시하려면 hideShutter */
  footer?: ReactNode;
  hideShutter?: boolean;
  /** 미디어 영역 종횡비 (기본 3/4) */
  aspect?: string;
}

export function CameraShell(p: CameraShellProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="cb-camera" role="region" aria-label={typeof p.title === 'string' ? p.title : '촬영'}>
      <div className="cb-camera__top">
        <div className="cb-camera__topbar">
          {p.onClose ? (
            <button type="button" className="cb-icon-btn" onClick={p.onClose} aria-label="닫기">
              <Icon name="close" size={22} />
            </button>
          ) : (
            <span style={{ width: 44 }} />
          )}
          <div className="cb-camera__title">{p.title}</div>
          <span className="cb-camera__count">{p.steps && p.currentStep !== undefined ? `${p.currentStep + 1} / ${p.steps.length}` : ''}</span>
        </div>
        {p.steps && p.currentStep !== undefined ? (
          <div style={{ marginTop: 6 }}>
            <StepIndicator steps={p.steps} current={p.currentStep} dark />
          </div>
        ) : null}
      </div>

      <div className="cb-camera__stage" style={p.aspect ? { aspectRatio: p.aspect, flex: 'none' } : undefined}>
        <div className="cb-camera__media">{p.children}</div>
        {p.guide ? <div className="cb-camera__guide">{p.guide}</div> : null}
        {p.status ? (
          <div className={clsx('cb-camera__status', p.status.tone !== 'info' && `cb-camera__status--${p.status.tone}`)} aria-live="polite">
            {p.status.text}
          </div>
        ) : null}
        {p.overlay}
      </div>

      <div className="cb-camera__bottom">
        <div className="cb-camera__instruction" aria-live="polite">
          {p.instruction}
        </div>
        <div className="cb-camera__hint">{p.hint}</div>
        {p.footer}
        {!p.hideShutter ? (
          <div className="cb-camera__controls">
            <div className="cb-camera__side">
              {p.onUpload ? (
                <>
                  <button type="button" className="cb-camera__side-btn" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={16} />
                    {p.uploadLabel ?? '업로드'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="cb-visually-hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) p.onUpload?.(f);
                      e.target.value = '';
                    }}
                  />
                </>
              ) : null}
            </div>
            <button type="button" className="cb-shutter" onClick={p.onShutter} disabled={p.shutterDisabled || !p.onShutter} aria-label={p.shutterLabel ?? '촬영'} />
            <div className="cb-camera__side cb-camera__side--right">
              {p.secondaryAction ? (
                <button type="button" className="cb-camera__side-btn" onClick={p.secondaryAction.onClick}>
                  {p.secondaryAction.icon ? <Icon name={p.secondaryAction.icon} size={16} /> : null}
                  {p.secondaryAction.label}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type GuideState = 'idle' | 'ok' | 'warn';
/** DESIGN: 프레이밍 가이드는 흰색. 상태 색(통과·경고)은 상태 알약(status pill)에만 쓰고, 가이드는 밝기만 바꾼다. */
const guideColor = (s: GuideState) => (s === 'ok' ? '#FFFDF8' : s === 'warn' ? 'rgba(255,253,248,0.6)' : 'rgba(255,253,248,0.92)');

/** 얼굴 정면: 흰 타원 윤곽 + 바깥 어둡게 */
export function FaceOvalGuide({ state = 'idle', rx = 0.3, ry = 0.29, cy = 0.45 }: { state?: GuideState; rx?: number; ry?: number; cy?: number }) {
  // viewBox 100×133 (3:4)
  const W = 100;
  const H = 133.3;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <mask id="cb-face-mask">
          <rect width={W} height={H} fill="white" />
          <ellipse cx={W / 2} cy={H * cy} rx={W * rx} ry={H * ry} fill="black" />
        </mask>
      </defs>
      <rect width={W} height={H} fill="rgba(29,27,35,0.45)" mask="url(#cb-face-mask)" />
      <ellipse cx={W / 2} cy={H * cy} rx={W * rx} ry={H * ry} fill="none" stroke={guideColor(state)} strokeWidth="0.8" />
    </svg>
  );
}

/** 얼굴 측면: 옆얼굴 프로필 실루엣 가이드 */
export function ProfileGuide({ state = 'idle', facing = 'left' }: { state?: GuideState; facing?: 'left' | 'right' }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 133.3" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g transform={facing === 'right' ? 'translate(100 0) scale(-1 1)' : undefined}>
        <path
          d="M58 26 C40 24 30 38 31 56 C32 66 30 70 27 75 C25 78 27 80 30 80 L31 86 C30 89 32 91 34 92 C33 95 35 98 39 98 C44 99 47 101 48 106 L70 106 C68 95 72 82 72 66 C73 42 68 28 58 26 Z"
          fill="none"
          stroke={guideColor(state)}
          strokeWidth="0.8"
          strokeDasharray="2 1.5"
        />
      </g>
    </svg>
  );
}

/** 환경 촬영: 프레임 모서리 */
export function CornerFrameGuide({ state = 'idle', inset = 0.08 }: { state?: GuideState; inset?: number }) {
  const W = 100;
  const H = 133.3;
  const x0 = W * inset;
  const y0 = H * inset;
  const x1 = W - x0;
  const y1 = H - y0;
  const L = 12;
  const c = guideColor(state);
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path
        d={`M${x0} ${y0 + L}V${y0}H${x0 + L} M${x1 - L} ${y0}H${x1}V${y0 + L} M${x1} ${y1 - L}V${y1}H${x1 - L} M${x0 + L} ${y1}H${x0}V${y1 - L}`}
        fill="none"
        stroke={c}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        style={{ strokeWidth: 3 }}
      />
    </svg>
  );
}

/** 전신: 머리부터 발까지 들어오는 세로 프레임 + 머리/발 기준선 */
export function BodyFrameGuide({ state = 'idle' }: { state?: GuideState }) {
  const c = guideColor(state);
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 133.3" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="26" y="8" width="48" height="117" rx="6" fill="none" stroke={c} strokeWidth="0.7" strokeDasharray="2 1.5" />
      <line x1="20" y1="10" x2="80" y2="10" stroke={c} strokeWidth="0.5" />
      <line x1="20" y1="123" x2="80" y2="123" stroke={c} strokeWidth="0.5" />
      <text x="82" y="11.5" fontSize="3.4" fill={c}>
        머리
      </text>
      <text x="82" y="124.5" fontSize="3.4" fill={c}>
        발
      </text>
    </svg>
  );
}
