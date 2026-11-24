'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { StyleMuseData } from '@/data/types';
import { ButtonPair, CheckMark, Card, Header, IconButton, Photo, PhotoGrid, PhotoTile, RadioMark, Row, Rows, Screen, SectionTitle, Sheet, Swatch, TileCaption } from '@/ui';
import { SearchSheet } from './SearchSheet';
import s from './screen.module.css';

/**
 * 05 추구미. 인물 사진 위 시트(분석 불가 안내 · 사진 선택 · 썸네일) → 가이드 · 팔레트 비교 → 원본/적용 룩 → 스타일링 포인트.
 * 목업 상호작용
 * - 사진 카드·썸네일을 누르면 분석할 사진이 바뀐다 (역광 사진은 고를 수 없다)
 * - 검색 아이콘: 이름 검색 · 사진으로 찾기 시트
 * - 시트의 사진 추가 아이콘·사진으로 찾기: 올린 사진을 역광으로 판정해 안내를 띄우고 같은 인물의 다른 사진을 고르게 한다
 * - 가이드 저장: 저장 상태 표시, 다른 룩 보기: 다음 룩을 고르고 사진 선택으로 올라간다
 */
export function StyleMuseScreen({ data }: { data: StyleMuseData }) {
  const defaultPhoto = data.looks.find((l) => l.id === data.selectedLookId)?.photo ?? data.looks[0]?.photo;
  const [selected, setSelected] = useState(defaultPhoto);
  const [rejectedPhoto, setRejectedPhoto] = useState(data.rejected.photo);
  const [saved, setSaved] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const topRef = useRef<HTMLSpanElement>(null);
  const sheetRef = useRef<HTMLSpanElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<string | null>(null);

  // 올린 사진의 blob URL은 새 사진으로 바뀔 때와 화면을 떠날 때 해제한다
  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    [],
  );

  const look = data.looks.find((l) => l.photo === selected);
  const isDefault = selected === defaultPhoto;

  function pick(photo: string) {
    setSelected(photo);
    setSaved(false);
  }

  function nextLook() {
    const i = data.looks.findIndex((l) => l.photo === selected);
    pick(data.looks[(i + 1) % data.looks.length].photo);
    sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 목업: 올린 사진은 늘 역광으로 판정한다. 대표 룩을 다시 골라 두고 시트로 올라간다.
  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = URL.createObjectURL(file);
    setRejectedPhoto(blobRef.current);
    pick(defaultPhoto);
    setSearchOpen(false);
    requestAnimationFrame(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const upload = () => fileRef.current?.click();
  const compare = data.compare.map((c, i) => (i === 0 && !isDefault ? { ...c, photo: selected, title: look?.title ?? '고른 사진', meta: look?.outfit } : c));

  return (
    <Screen nav="muse">
      <span ref={topRef} aria-hidden />
      <Header title="추구미" right={<IconButton icon="search" label="연예인 검색" onClick={() => setSearchOpen(true)} />} />

      <div className={s.top}>
        <Photo src={data.hero} alt={`${data.name} 인물 사진`} className={s.topImg} />
      </div>

      <Sheet bg="white" overlap={24} corners="top" className={s.sheet}>
        <span ref={sheetRef} className={s.anchor} aria-hidden />
        <div className={s.sheetHead}>
          <span />
          <h2 className={s.sheetTitle}>
            {data.name}
            <small>사진 {data.photoCount}장</small>
          </h2>
          <IconButton icon="imgplus" label={`${data.name} 사진 올리기`} onClick={upload} />
        </div>

        <div className={s.notice} role="status">
          <Photo src={rejectedPhoto} alt="" position="50% 20%" />
          <p>
            <b>{data.rejected.title}</b>
            {data.rejected.body}
          </p>
        </div>

        <PhotoGrid>
          {data.looks.map((l) => {
            const on = l.photo === selected;
            return (
              <button key={l.id} type="button" className={s.lookCard} aria-pressed={on} onClick={() => pick(l.photo)}>
                <span className={s.lookPh}>
                  <Photo src={l.photo} alt="" position="50% 30%" />
                  <span className={s.mark}>{on ? <CheckMark /> : <RadioMark />}</span>
                </span>
                <span className={s.lookCap}>
                  <b>{l.title}</b>
                  <span>{l.outfit}</span>
                  <em>{l.source}</em>
                </span>
              </button>
            );
          })}
        </PhotoGrid>

        <div className={s.strip} role="group" aria-label={`${data.name} 사진`}>
          <span className={`${s.thumb} ${s.thumbNo}`} title={data.rejected.title}>
            <Photo src={rejectedPhoto} alt="올린 사진" />
            <span>{data.rejected.badge}</span>
          </span>
          <span className={s.stripGap} aria-hidden />
          {data.thumbs.map((t, i) => (
            <button key={t} type="button" className={[s.thumb, t === selected ? s.thumbOn : ''].join(' ')} aria-pressed={t === selected} aria-label={`사진 ${i + 1}`} onClick={() => pick(t)}>
              <Photo src={t} alt="" />
            </button>
          ))}
        </div>
      </Sheet>

      <div className={s.band} aria-hidden />

      <div className={s.guide}>
        <p className="t-eyebrow">{isDefault ? data.guide.eyebrow : `${look?.title ?? '고른 사진'}으로 분석했어요`}</p>
        <h2 className={`t-h1 ${s.guideTitle}`}>{data.guide.title}</h2>
        <p className={`t-body ${s.guideBody}`}>
          {data.guide.body.map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      </div>

      <Card className={s.pal}>
        {data.palettes.map((p) => (
          <div key={p.who} className={s.palRow}>
            <b>
              {p.who}
              <small>{p.type}</small>
            </b>
            <ul className={s.swatches}>
              {p.colors.map((c) => (
                <li key={c.name}>
                  <Swatch color={c.hex} size={36} />
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <PhotoGrid className={s.compare}>
        {compare.map((c) => (
          <div key={c.label}>
            <PhotoTile src={c.photo} alt={`${c.label} ${c.title}`} label={c.label} labelTone="ink" height={330} position="50% 0" imgClassName={s.compareImg} style={{ background: c.bg }} />
            <TileCaption title={c.title} meta={c.meta} />
          </div>
        ))}
      </PhotoGrid>

      <section className={s.points}>
        <SectionTitle className={s.pointsTitle}>스타일링 포인트</SectionTitle>
        <Rows>
          {data.points.map((p) => (
            <Row
              key={p.k}
              k={p.k}
              alignTop
              v={p.v.map((line, i) => (
                <span key={i}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            />
          ))}
        </Rows>
      </section>

      <ButtonPair primary={{ label: saved ? '저장했어요' : '가이드 저장', onClick: () => setSaved(true) }} secondary={{ label: '다른 룩 보기', onClick: nextLook }} />

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
      <SearchSheet open={searchOpen} name={data.name} photo={data.hero} photoCount={data.photoCount} onClose={() => setSearchOpen(false)} onPick={() => {
          setSearchOpen(false);
          topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }} onUpload={upload} />
    </Screen>
  );
}
