import type { Metadata } from 'next';
import { Library } from '../../src/muse/Library';

export const metadata: Metadata = { title: '내 기록 · CELEBER' };

export default function Page() {
  return <Library />;
}
