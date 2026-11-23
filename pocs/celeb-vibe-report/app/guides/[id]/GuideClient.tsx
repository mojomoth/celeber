'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuideViewer, type GuideViewerProps } from '../../../src/flow';
import { takeGuideWarning } from '../../../src/lib/warning-handoff';

export function GuideClient(props: Omit<GuideViewerProps, 'onDeleted'>) {
  const router = useRouter();
  // 방금 만든 가이드의 경고(AI 폴백 사유)는 URL이 아니라 sessionStorage로 받는다
  const [handoff, setHandoff] = useState<string | undefined>();
  useEffect(() => {
    const w = takeGuideWarning(props.guide.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 한 번 브라우저 저장소에서 읽는다
    if (w) setHandoff(w);
  }, [props.guide.id]);
  return <GuideViewer {...props} warning={handoff ?? props.warning} onDeleted={() => router.push('/guides')} />;
}
