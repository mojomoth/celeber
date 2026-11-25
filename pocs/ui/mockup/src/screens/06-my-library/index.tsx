'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import type { LibraryData } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { Card, Dialog, Header, Icon, IconButton, ListRow, Photo, PhotoGrid, PhotoTile, Screen, SectionTitle, SwatchDots, TileCaption } from '@/ui';
import s from './screen.module.css';

type LibraryContent = Omit<LibraryData, 'personalColor' | 'muses' | 'reset'> & {
  personalColor: (Omit<LibraryData['personalColor'], 'photo'> & { photo?: string }) | null;
  muses: (Omit<LibraryData['muses'][number], 'photo'> & { photo?: string })[];
  reset: Pick<LibraryData['reset'], 'title' | 'sub'> & Partial<LibraryData['reset']>;
};

type LibraryActions = {
  guideHref: (id: string) => string;
  personalColorHref: string;
  analysisHref: string;
  onReset: () => void;
  resetDialog: ReactNode;
  guideStatus?: ReactNode;
  colorStatus?: ReactNode;
};

export function MyLibraryScreen({ data, actions }: { data: LibraryContent; actions?: LibraryActions }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setConfirming(false), []);
  const pc = data.personalColor;

  return (
    <Screen nav="library" className={s.root}>
      <Header title="내 기록" right={actions ? undefined : <IconButton icon="edit" label="편집" />} />

      <div className={s.sub}>
        <h2 className={s.count}>
          찾은 추구미{actions?.guideStatus ? null : <em>{data.muses.length}</em>}
        </h2>
        {data.muses.length ? <span className={s.sort}>{data.sortLabel}</span> : null}
      </div>

      {actions?.guideStatus ? <div className={s.status}>{actions.guideStatus}</div> : <PhotoGrid>
        {data.muses.map((m) => (
          <Link key={m.id} href={actions?.guideHref(m.id) ?? ROUTES.muse} className={s.item} aria-label={`${m.name} ${m.look} 가이드 보기`}>
            {m.photo ? <PhotoTile src={m.photo} label={m.name} height={300} position="50% 12%" /> : <div className={s.noPhoto}>{m.name}</div>}
            <TileCaption
              className={s.cta}
              title={
                <span className={s.go}>
                  가이드 보기
                  <Icon name="arrow" size={16} stroke={1.8} />
                </span>
              }
              meta={m.look}
            />
          </Link>
        ))}
      </PhotoGrid>}

      <section className={s.mine}>
        <SectionTitle className={s.mineTitle}>내 퍼스널컬러</SectionTitle>
        {pc ? <Link href={actions?.personalColorHref ?? ROUTES.personalColor} className={s.pcLink}>
          <Card className={s.pc}>
            {pc.photo ? <Photo src={pc.photo} position="50% 15%" className={s.pcPhoto} /> : <span className={s.pcPhoto} aria-hidden />}
            <span>
              <b className={s.pcType}>{pc.type}</b>
              <span className={s.pcMeta}>
                <SwatchDots colors={pc.dots} size={16} overlap />
                {pc.date}
              </span>
            </span>
            <Icon name="chev" size={20} stroke={1.8} className={s.chev} />
          </Card>
        </Link> : actions?.colorStatus}

        <div className={s.list}>
          <ListRow title={data.analysis.title} sub={data.analysis.sub} href={actions?.analysisHref ?? ROUTES.analysis} />
          <ListRow title={data.reset.title} sub={data.reset.sub} onClick={actions?.onReset ?? (() => setConfirming(true))} danger />
        </div>
      </section>

      {actions ? actions.resetDialog : <Dialog
        open={confirming}
        title={data.reset.confirmTitle ?? '내 정보를 모두 지울까요?'}
        confirmLabel={data.reset.confirmLabel ?? '모두 삭제'}
        danger
        onConfirm={() => {
          setConfirming(false);
          router.push(ROUTES.landing);
        }}
        onClose={close}
      >
        {data.reset.confirmBody}
      </Dialog>}
    </Screen>
  );
}
