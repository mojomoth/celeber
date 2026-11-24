import type { Metadata } from 'next';
import { styleMuse } from '@/data/mock';
import { StyleMuseScreen } from '@/screens/05-style-muse';

export const metadata: Metadata = { title: '추구미 · CELEBER' };

export default function Page() {
  return <StyleMuseScreen data={styleMuse} />;
}
