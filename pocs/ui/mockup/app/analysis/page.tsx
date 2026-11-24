import type { Metadata } from 'next';
import { selfAnalysis } from '@/data/mock';
import { SelfAnalysisScreen } from '@/screens/03-self-analysis';

export const metadata: Metadata = { title: '내 분석 · CELEBER' };

export default function Page() {
  return <SelfAnalysisScreen data={selfAnalysis} />;
}
