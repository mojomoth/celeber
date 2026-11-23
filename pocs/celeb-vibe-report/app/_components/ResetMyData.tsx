'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog, Notice } from '@celeber/ui';
import { createGuideApi } from '../../src/lib/api';
import s from '../../src/components/guide.module.css';

type Preview = Awaited<ReturnType<ReturnType<typeof createGuideApi>['myDataPreview']>>;

/**
 * 내 정보 전체 초기화: 얼굴·전신 분석, 퍼스널컬러 리포트, 추구미 가이드와 내 사진 파일.
 * 지워질 항목(건수·사진 수)을 먼저 보여 주고 확인 뒤 삭제한다. 연예인 검색·분석은 남는다.
 */
export function ResetMyData() {
  const router = useRouter();
  const api = useMemo(() => createGuideApi(''), []);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = async () => {
    setError(null);
    setDone(null);
    try {
      setPreview(await api.myDataPreview());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const empty = !!preview && !preview.items.length;

  return (
    <>
      <button type="button" className={s.linkRow} onClick={() => void open()}>
        <span>
          <span className={`${s.linkRowTitle} ${s.danger}`} style={{ display: 'block' }}>
            내 정보 전체 초기화
          </span>
          <span className={s.linkRowSub}>얼굴·전신 분석, 퍼스널컬러 리포트, 가이드와 내 사진 파일을 모두 지웁니다.</span>
        </span>
        <span aria-hidden>›</span>
      </button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      <ConfirmDialog
        open={!!preview}
        title={empty ? '지울 내 정보가 없습니다' : '내 정보를 모두 지울까요?'}
        description={empty ? preview?.kept : `되돌릴 수 없습니다. 아래 항목과 사진 파일이 삭제됩니다. ${preview?.kept ?? ''}`}
        items={preview?.items}
        confirmLabel={empty ? '닫기' : '모두 삭제'}
        cancelLabel="취소"
        danger={!empty}
        loading={loading}
        onCancel={() => setPreview(null)}
        onConfirm={async () => {
          if (empty) return setPreview(null);
          setLoading(true);
          try {
            const r = await api.resetMyData();
            const n = Object.values(r.deleted).reduce((a, b) => a + b, 0);
            setDone(`기록 ${n}개와 사진 ${r.photos}장을 지웠습니다.`);
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
