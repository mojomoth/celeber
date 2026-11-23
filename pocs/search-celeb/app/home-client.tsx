'use client';
/** 독립 실행용 래퍼: 플로우의 인물 열기를 URL(?celeb=)과 동기화하고, 완료 시 선택 결과를 보여준다 */
import { useCallback, useEffect, useState } from 'react';
import { Notice } from '@celeber/ui';
import { CelebSearchFlow, type CelebSearchResult } from '../src/flow';

export function HomeClient({ initialCelebId, initialQuery }: { initialCelebId: string | null; initialQuery?: string | null }) {
  const [celebId, setCelebId] = useState(initialCelebId);
  const [done, setDone] = useState<CelebSearchResult | null>(null);
  // 뒤로/앞으로 이동 시 플로우를 URL 상태로 다시 마운트
  const [nav, setNav] = useState(0);

  useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get('celeb');
      setCelebId(id);
      setNav((n) => n + 1);
      setDone(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const onCelebChange = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('celeb', id);
    else url.searchParams.delete('celeb');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    setDone(null);
  }, []);

  return (
    <div className="cb-stack" style={{ gap: 'var(--cb-s4)' }}>
      {done ? (
        <Notice tone="ok" title="선택을 저장했습니다">
          {done.celeb.name} · 사진 {done.selectedImages.length}장. 추구미 분석(celeb-vibe-report)에서 이 선택을 그대로 사용합니다.
        </Notice>
      ) : null}
      <CelebSearchFlow
        key={`${celebId ?? 'search'}:${nav}`}
        initialCelebId={celebId}
        initialQuery={nav === 0 ? initialQuery : null}
        onCelebChange={onCelebChange}
        onComplete={(r) => {
          setDone(r);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        completeLabel="선택 완료"
      />
    </div>
  );
}
