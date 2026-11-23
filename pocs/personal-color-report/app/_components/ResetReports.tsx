'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, Notice } from '@celeber/ui';

/** 리포트 전체 초기화 (확인 단계 포함). personal_color_reports만 지우고 얼굴·전신 분석과 사진은 남긴다. */
export function ResetReports({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button variant="danger" block icon="trash" onClick={() => setOpen(true)}>
        리포트 전체 초기화
      </Button>
      <ConfirmDialog
        open={open}
        danger
        title="리포트를 모두 지울까요?"
        description="지운 리포트는 되돌릴 수 없습니다. 얼굴·전신 분석과 촬영한 사진은 남아 있어 다시 리포트를 만들 수 있습니다."
        items={[`퍼스널컬러 리포트 ${count}개`, '리포트별 타입 판정 · 서술 · 스타일 설정']}
        confirmLabel="모두 삭제"
        loading={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const res = await fetch('/api/report/reports?confirm=1', { method: 'DELETE' });
            if (!res.ok) throw new Error(`삭제하지 못했습니다 (${res.status})`);
            setOpen(false);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
