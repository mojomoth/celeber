'use client';
import { Button, ConfirmDialog, Notice } from '@celeber/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `요청 실패 (${res.status})`;
  } catch {
    return `요청 실패 (${res.status})`;
  }
}

/** 데모(Mock) 세션 만들기 → 상세로 이동 */
export function DemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        block
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const res = await fetch('/api/body/demo', { method: 'POST' });
          if (!res.ok) {
            setError(await errorText(res));
            setLoading(false);
            return;
          }
          const j = (await res.json()) as { session: { id: string } };
          router.push(`/sessions/${j.session.id}`);
        }}
      >
        데모 데이터로 결과 보기
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </>
  );
}

/** 전신 측정 기록 전체 삭제 (확인 단계) */
export function DeleteAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!count) return null;
  return (
    <>
      <Button variant="danger" size="sm" icon="trash" onClick={() => setOpen(true)}>
        기록 초기화
      </Button>
      <ConfirmDialog
        open={open}
        danger
        title="전신 측정 기록을 모두 지울까요?"
        description="이 PoC의 전신 측정 기록만 지웁니다. 얼굴·퍼스널컬러 기록은 그대로 남습니다."
        items={[`전신 측정 기록 ${count}건 (비율, 체형, 코디 서술)`, '기록에 연결된 사진 참조']}
        confirmLabel="모두 지우기"
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setLoading(true);
          await fetch('/api/body/sessions?confirm=1', { method: 'DELETE' });
          setLoading(false);
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

/** 기록 1건 삭제 (확인 단계) */
export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon="trash" onClick={() => setOpen(true)}>
        이 기록 삭제
      </Button>
      <ConfirmDialog
        open={open}
        danger
        title="이 전신 측정 기록을 지울까요?"
        items={['측정 비율과 체형 분류', '코디 서술']}
        confirmLabel="삭제"
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setLoading(true);
          await fetch(`/api/body/sessions/${id}`, { method: 'DELETE' });
          router.push('/sessions');
          router.refresh();
        }}
      />
    </>
  );
}
