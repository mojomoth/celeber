'use client';
import { useRouter } from 'next/navigation';
import { FaceCaptureFlow } from '../../src/flow';

export function CaptureClient() {
  const router = useRouter();
  return <FaceCaptureFlow onComplete={(r) => router.push(`/sessions/${r.sessionId}`)} onCancel={() => router.push('/')} />;
}
