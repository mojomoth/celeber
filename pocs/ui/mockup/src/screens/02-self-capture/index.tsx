'use client';

// 02 나를 분석(촬영). 실제 카메라 대신 단계별 프리뷰 사진을 보여 주고, 셔터로 환경 → 정면 → 측면 → 전신(선택) 단계를 넘긴다.
// 단계는 ?step=1..4 로도 열 수 있다 (없으면 data.startIndex).
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ChangeEvent } from 'react';
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
          <Photo src={step.guide} alt="자세 예시" position="50% 20%" />
        </div>
        <div className={`${s.card} ${step.id === 'body' ? s.cardBody : ''}`}>
          {step.id === 'body' ? <Photo src={step.preview} className={s.backdrop} /> : null}
          <Photo key={step.id} src={step.preview} alt="카메라 미리보기" className={s.preview} position={step.id === 'body' ? undefined : '50% 8%'} />
          {step.id === 'front' || step.id === 'side' ? <div className={s.oval} aria-hidden /> : null}
          {shots > 0 ? <div key={shots} className={s.flash} aria-hidden /> : null}
        </div>
      </div>

      <div className={s.cond}>
        <Chip items={data.light.items} dot={data.light.ok ? LIGHT_OK : undefined} />
      </div>

      <div className={s.controls}>
        {step.optional ? (
          <label className={s.side}>
            <Icon name="upload" size={22} />
            <input type="file" accept="image/*" className="sr-only" aria-label="사진 올리기" onChange={upload} />
          </label>
        ) : null}
        <button type="button" className={s.shutter} aria-label="촬영" onClick={shoot}>
          <i />
        </button>
        {step.optional ? (
          <button type="button" className={s.skip} onClick={() => router.push(ROUTES.analysis)}>
            건너뛰기
          </button>
        ) : null}
      </div>
    </Screen>
  );
}
