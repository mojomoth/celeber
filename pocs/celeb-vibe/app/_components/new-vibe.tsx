'use client';
import { useRouter } from 'next/navigation';
import { VibeFlow } from '../../src/flow';

/** 새 분석: 플로우 완료 → 상세 화면으로 이동 */
export function NewVibe() {
  const router = useRouter();
  return (
    <VibeFlow
      onComplete={({ analysis, warning }) => {
        const q = warning ? `?warning=${encodeURIComponent(warning.slice(0, 300))}` : '';
        router.push(`/analyses/${analysis.id}${q}`);
      }}
    />
  );
}
