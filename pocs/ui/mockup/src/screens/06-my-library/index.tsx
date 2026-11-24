'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { LibraryData } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { Card, Dialog, Header, Icon, IconButton, ListRow, Photo, PhotoGrid, PhotoTile, Screen, SectionTitle, SwatchDots, TileCaption } from '@/ui';
import s from './screen.module.css';

export function MyLibraryScreen({ data }: { data: LibraryData }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setConfirming(false), []);
  const pc = data.personalColor;

  return (
    <Screen nav="library" className={s.root}>
      <Header title="내 기록" right={<IconButton icon="edit" label="편집" />} />

      <div className={s.sub}>
        <h2 className={s.count}>
          찾은 추구미<em>{data.muses.length}</em>
        </h2>
        <span className={s.sort}>{data.sortLabel}</span>
      </div>

      <PhotoGrid>
        {data.muses.map((m) => (
          <Link key={m.id} href={ROUTES.muse} className={s.item} aria-label={`${m.name} ${m.look} 가이드 보기`}>
            <PhotoTile src={m.photo} label={m.name} height={300} position="50% 12%" />
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
      </PhotoGrid>

      <section className={s.mine}>
        <SectionTitle className={s.mineTitle}>내 퍼스널컬러</SectionTitle>
        <Link href={ROUTES.personalColor} className={s.pcLink}>
          <Card className={s.pc}>
            <Photo src={pc.photo} position="50% 15%" className={s.pcPhoto} />
            <span>
              <b className={s.pcType}>{pc.type}</b>
              <span className={s.pcMeta}>
                <SwatchDots colors={pc.dots} size={16} overlap />
                {pc.date}
              </span>
            </span>
            <Icon name="chev" size={20} stroke={1.8} className={s.chev} />
          </Card>
        </Link>

        <div className={s.list}>
          <ListRow title={data.analysis.title} sub={data.analysis.sub} href={ROUTES.analysis} />
          <ListRow title={data.reset.title} sub={data.reset.sub} onClick={() => setConfirming(true)} danger />
        </div>
      </section>

      <Dialog
        open={confirming}
        title={data.reset.confirmTitle}
        confirmLabel={data.reset.confirmLabel}
        danger
        onConfirm={() => {
          setConfirming(false);
          router.push(ROUTES.landing);
        }}
        onClose={close}
      >
        {data.reset.confirmBody}
      </Dialog>
    </Screen>
  );
}
