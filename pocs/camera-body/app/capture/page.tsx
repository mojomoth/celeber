'use client';
import { useRouter } from 'next/navigation';
import { BodyCaptureFlow } from '../../src/flow';

export default function CapturePage() {
  const router = useRouter();
  return (
    <BodyCaptureFlow
      onClose={() => router.push('/')}
      onComplete={(r) => router.push(r.session ? `/sessions/${r.session.id}` : '/')}
    />
  );
}
