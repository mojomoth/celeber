import type { Metadata } from 'next';
import { personalColor } from '@/data/mock';
import { PersonalColorScreen } from '@/screens/04-personal-color';

export const metadata: Metadata = { title: '퍼스널컬러 · CELEBER' };

export default function Page() {
  return <PersonalColorScreen data={personalColor} />;
}
