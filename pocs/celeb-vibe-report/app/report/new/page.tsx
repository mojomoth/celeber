import type { Metadata } from 'next';
import { ReportNewClient } from './ReportNewClient';

export const metadata: Metadata = { title: 'CELEBER · 퍼스널컬러 리포트 만들기' };
export const dynamic = 'force-dynamic';

/** personal-color-report 생성 플로우 임베드 (얼굴 촬영 → 전신(선택) → 리포트). 끝나면 추구미 찾기로 돌아온다. */
export default async function ReportNewPage({ searchParams }: { searchParams: Promise<{ face?: string; step?: string }> }) {
  const sp = await searchParams;
  const step = sp.step === 'capture' || sp.step === 'body' ? sp.step : 'choose';
  return <ReportNewClient faceSessionId={sp.face} step={step} />;
}
