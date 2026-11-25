import type { Metadata } from 'next';
import { AnalysisResults } from '../../src/self/Results';

export const metadata: Metadata = { title: '내 분석 · CELEBER' };

export default function Page() {
  return <AnalysisResults />;
}
