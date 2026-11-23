import type { Metadata } from 'next';
import { CaptureClient } from './CaptureClient';

export const metadata: Metadata = { title: 'CELEBER · 얼굴 촬영 중' };

export default function CapturePage() {
  return <CaptureClient />;
}
