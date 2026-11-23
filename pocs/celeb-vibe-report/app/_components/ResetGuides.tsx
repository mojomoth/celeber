'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog, Notice } from '@celeber/ui';
import { createGuideApi, type GuideResetPreview } from '../../src/lib/api';
import s from '../../src/components/guide.module.css';

/** 가이드 초기화: 지워질 항목을 먼저 보여주고 확인 후 vibe_guides만 삭제한다 */
export function ResetGuides({ count }: { count: number }) {
  const router = useRouter();
  const api = useMemo(() => createGuideApi(''), []);
  const [preview, setPreview] = useState<GuideResetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const open = async () => {
    setError(null);
    try {
      setPreview(await api.resetPreview());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <button type="button" className={s.linkRow} onClick={() => void open()} disabled={!count}>
        <span>
          <span className={`${s.linkRowTitle} ${s.danger}`} style={{ display: 'block' }}>
            추구미 가이드 초기화
          </span>
          <span className={s.linkRowSub}>{count ? `가이드 ${count}개를 지웁니다. 퍼스널컬러 리포트와 사진은 남습니다.` : '지울 가이드가 없습니다.'}</span>
        </span>
        <span aria-hidden>›</span>
      </button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done !== null ? <Notice tone="ok">가이드 {done}개를 지웠습니다.</Notice> : null}
      <ConfirmDialog
        open={!!preview}
        title={`추구미 가이드 ${preview?.count ?? 0}개를 지울까요?`}
        description="되돌릴 수 없습니다. 지워지는 것은 아래 가이드뿐이며 내 퍼스널컬러 리포트, 얼굴·전신 분석, 연예인 사진 분석은 남습니다."
        items={preview?.items.slice(0, 8).concat(preview.items.length > 8 ? [`외 ${preview.items.length - 8}개`] : [])}
        confirmLabel="모두 삭제"
        cancelLabel="취소"
        danger
        loading={loading}
        onCancel={() => setPreview(null)}
        onConfirm={async () => {
          setLoading(true);
          try {
            const r = await api.resetAll();
            setDone(r.deleted);
            setPreview(null);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
            setPreview(null);
          } finally {
            setLoading(false);
          }
        }}
      />
    </>
  );
}
