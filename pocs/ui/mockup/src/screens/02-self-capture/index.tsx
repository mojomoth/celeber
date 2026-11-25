'use client';

// 02 나를 분석(촬영). 실제 카메라 대신 단계별 프리뷰 사진을 보여 주고, 셔터로 환경 → 정면 → 측면 → 전신(선택) 단계를 넘긴다.
// 단계는 ?step=1..4 로도 열 수 있다 (없으면 data.startIndex).
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ChangeEvent, type ReactNode } from 'react';
import type { CaptureData } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { Chip, Header, Icon, IconButton, Photo, Screen } from '@/ui';
import s from './screen.module.css';

const LIGHT_OK = '#7AD9B4';

export function SelfCaptureScreen({ data }: { data: CaptureData }) {
  return (
    <Suspense fallback={<CaptureView data={data} index={data.startIndex} />}>
      <CaptureFromQuery data={data} />
    </Suspense>
  );
}

function CaptureFromQuery({ data }: { data: CaptureData }) {
  const n = Number(useSearchParams().get('step'));
  const index = Number.isInteger(n) && n >= 1 && n <= data.steps.length ? n - 1 : data.startIndex;
  return <CaptureView data={data} index={index} />;
}

function CaptureView({ data, index }: { data: CaptureData; index: number }) {
  const router = useRouter();
  const [shots, setShots] = useState(0);
  const step = data.steps[index];
  const last = index === data.steps.length - 1;

  function goTo(next: number) {
    const q = new URLSearchParams(window.location.search);
    q.set('step', String(next + 1));
    router.replace(`${ROUTES.capture}?${q}`, { scroll: false });
  }

  function shoot() {
    setShots((v) => v + 1);
    if (last) router.push(ROUTES.analysis);
    else goTo(index + 1);
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) router.push(ROUTES.analysis);
  }

  return (
    <CaptureStage data={data} index={index} shots={shots} onShoot={shoot} onUpload={step.optional ? upload : undefined}
      onSkip={step.optional ? () => router.push(ROUTES.analysis) : undefined} />
  );
}

export function CaptureStage({ data, index, shots = 0, preview, guideLabel, status, review, onShoot, onUpload, onSkip, disabled = false, shootDisabled = false }: {
  data: CaptureData;
  index: number;
  shots?: number;
  preview?: ReactNode;
  guideLabel?: string;
  status?: ReactNode;
  review?: { confirm: string; onConfirm: () => void; onRetake: () => void; disabled?: boolean };
  onShoot: () => void;
  onUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  onSkip?: () => void;
  disabled?: boolean;
  shootDisabled?: boolean;
}) {
  const step = data.steps[index];
  return (
    <Screen tone="dark" className={s.root}>
      <Header
        tone="dark"
        title={step.title}
        left={<IconButton icon="x" label="촬영 닫기" href={ROUTES.landing} />}
        right={
          <span className={s.count} aria-label={`${data.steps.length}단계 중 ${index + 1}단계`}>
            {index + 1}/{data.steps.length}
          </span>
        }
      />

      <div className={s.stage}>
        <div className={s.pose}>
          <Photo src={step.guide} alt={guideLabel ? '' : '자세 예시'} position="50% 20%" />
          {guideLabel ? <span className={s.poseLabel}>{guideLabel}</span> : null}
        </div>
        <div className={`${s.card} ${step.id === 'body' ? s.cardBody : ''}`}>
          {preview ?? <>
            {step.id === 'body' ? <Photo src={step.preview} className={s.backdrop} /> : null}
            <Photo key={step.id} src={step.preview} alt="카메라 미리보기" className={s.preview} position={step.id === 'body' ? undefined : '50% 8%'} />
          </>}
          {!review && (step.id === 'front' || step.id === 'side') ? <div className={s.oval} aria-hidden /> : null}
          {shots > 0 ? <div key={shots} className={s.flash} aria-hidden /> : null}
        </div>
      </div>

      <div className={s.cond}>
        <Chip items={data.light.items} dot={data.light.ok ? LIGHT_OK : undefined} />
      </div>
      {status ? <div className={s.status}>{status}</div> : null}

      {review ? (
        <div className={s.review}>
          <button type="button" onClick={review.onRetake} disabled={disabled}>다시 찍기</button>
          <button type="button" onClick={review.onConfirm} disabled={disabled || review.disabled}>{review.confirm}</button>
        </div>
      ) : <div className={s.controls}>
        {onUpload ? (
          <label className={s.side}>
            <Icon name="upload" size={22} />
            <input type="file" accept="image/*" className="sr-only" aria-label="사진 올리기" onChange={onUpload} disabled={disabled} />
          </label>
        ) : null}
        <button type="button" className={s.shutter} aria-label="촬영" onClick={onShoot} disabled={disabled || shootDisabled}>
          <i />
        </button>
        {onSkip ? (
          <button type="button" className={s.skip} onClick={onSkip} disabled={disabled}>
            건너뛰기
          </button>
        ) : null}
      </div>}
    </Screen>
  );
}
