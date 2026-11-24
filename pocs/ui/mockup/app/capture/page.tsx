import type { Metadata } from 'next';
import { capture } from '@/data/mock';
import { SelfCaptureScreen } from '@/screens/02-self-capture';

export const metadata: Metadata = { title: '나를 분석 · CELEBER' };

export default function Page() {
  return <SelfCaptureScreen data={capture} />;
}
