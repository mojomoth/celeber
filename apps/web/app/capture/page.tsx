import type { Metadata } from 'next';
import { Capture } from '../../src/self/Capture';

export const metadata: Metadata = { title: '나를 분석 · CELEBER' };

export default function Page() {
  return <Capture />;
}
