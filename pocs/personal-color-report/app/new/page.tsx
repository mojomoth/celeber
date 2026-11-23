import type { Metadata } from 'next';
import { NewReportClient } from './NewReportClient';

export const metadata: Metadata = { title: 'CELEBER · 퍼스널컬러 리포트 만들기' };
export const dynamic = 'force-dynamic';

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ face?: string; step?: string }> }) {
  const sp = await searchParams;
  const step = sp.step === 'capture' || sp.step === 'body' ? sp.step : 'choose';
  return <NewReportClient faceSessionId={sp.face} step={step} />;
}
