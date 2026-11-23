'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog } from '@celeber/ui';
import { deleteAllVibeApi, resetPreviewApi } from '../../src/flow';

/** 추구미 분석 기록 초기화 (확인 단계에서 지워지는 항목을 보여준다) */
export function ResetButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ analyses: number; referencedByGuides: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="danger"
        size="sm"
        icon="trash"
        disabled={count === 0}
        onClick={async () => {
          setError(null);
          setPreview(await resetPreviewApi().catch(() => ({ analyses: count, referencedByGuides: 0 })));
          setOpen(true);
        }}
      >
        기록 초기화
      </Button>
      {error ? <p className="cb-caption" style={{ color: 'var(--cb-danger)' }}>{error}</p> : null}
      <ConfirmDialog
        open={open}
        danger
        loading={loading}
        title="추구미 분석 기록을 모두 지울까요?"
        description="지운 기록은 되돌릴 수 없습니다. 업로드한 사진 파일은 다른 화면에서 쓰일 수 있어 남겨 둡니다."
        items={[
          `추구미 분석 ${preview?.analyses ?? count}건 (코디·퍼스널컬러·분위기 결과)`,
          ...(preview?.referencedByGuides ? [`이 중 ${preview.referencedByGuides}건은 추구미 가이드에서 참조 중입니다. 가이드의 원본 분석 링크가 끊깁니다.`] : []),
        ]}
        confirmLabel="모두 지우기"
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setLoading(true);
          try {
            await deleteAllVibeApi();
            setOpen(false);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      />
    </>
  );
}
