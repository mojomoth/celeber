import type { Metadata } from 'next';
import { library } from '@/data/mock';
import { MyLibraryScreen } from '@/screens/06-my-library';

export const metadata: Metadata = { title: '내 기록 · CELEBER' };

export default function Page() {
  return <MyLibraryScreen data={library} />;
}
