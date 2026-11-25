import type { PersonalColorData } from '@/data/types';
import type { ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';
import { ButtonPair, Header, Icon, IconButton, Photo, PhotoGrid, PhotoTile, Rows, Row, Screen, SectionTitle, Sheet, Slider, SwatchDots, Tags } from '@/ui';
import { Palette } from './Palette';
import { Report } from './Report';
import s from './screen.module.css';

export function PersonalColorScreen({ data, renderDrape, features, integrated, heroForeground }: {
  data: PersonalColorData;
  renderDrape?: (drape: PersonalColorData['drapes'][number]) => ReactNode;
  features?: { label: string; value: string }[];
  integrated?: boolean;
  heroForeground?: string;
}) {
  const { type } = data;
  return (
    <Screen nav="personalColor">
      <Header title="퍼스널컬러" right={integrated ? undefined : <IconButton icon="share" label="공유" />} />

      <div className={s.hero} style={{ background: type.color }}>
        <Photo src={data.hero} alt={integrated ? '분석에 사용한 정면 사진' : '드레이프를 두른 정면 사진'} className={s.heroImg} />
        <div className={s.heroFade} style={{ background: `linear-gradient(to bottom, transparent 0%, ${type.color} 52%)` }} aria-hidden />
        <div className={s.heroCopy} style={heroForeground ? { color: heroForeground } : undefined}>
          <div>
            <p className={s.heroType}>
              {type.ko.map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
            <p className={s.heroEn}>{type.en}</p>
          </div>
          <p className={s.heroConf}>
            진단 신뢰도<b>{type.confidence}%</b>
          </p>
        </div>
      </div>

      <Sheet overlap={28} bg="paper" className={s.sheet}>
        <div className={s.sheetHead}>
          <h2>추천 의상색</h2>
          <span>{data.paletteNote}</span>
        </div>
        <Palette colors={data.palette} />
        <div className={s.sliders}>
          {data.sliders.map((sl) => (
            <Slider key={sl.label} value={sl.value} label={sl.label} ends={sl.ends} />
          ))}
        </div>
      </Sheet>

      <section className={s.block}>
        <SectionTitle>첫인상</SectionTitle>
        <p className={`t-body ${s.body}`}>{data.firstImpression.body}</p>
        <Tags items={data.firstImpression.tags} className={s.tags} />
      </section>

      {features?.length ? (
        <section className={s.block}>
          <SectionTitle>주요 특징</SectionTitle>
          <Rows className={s.guideRows}>{features.map((feature) => <Row key={feature.label} k={feature.label} v={feature.value} />)}</Rows>
        </section>
      ) : null}

      <section className={s.block}>
        <SectionTitle>얼굴 주변 컬러 비교</SectionTitle>
        <div className={s.split}>
          <div className={s.splitLab}>
            <span>웜톤 {data.warmCool.warm}%</span>
            <span className={s.splitCool}>쿨톤 {data.warmCool.cool}%</span>
          </div>
          <div className={s.splitBar} style={{ gridTemplateColumns: `${data.warmCool.warm}fr ${data.warmCool.cool}fr` }} aria-hidden>
            <i />
            <i />
          </div>
        </div>
      </section>
      <PhotoGrid className={s.drapes}>
        {data.drapes.map((d) => (
          <figure key={d.color.name} className={renderDrape ? s.liveDrape : undefined}>
            {renderDrape ? renderDrape(d) : <PhotoTile src={d.photo} alt={`${d.color.name} 천을 두른 사진`} height={226} position="50% 0" />}
            <figcaption className={s.drapeCap}>
              <b className={s.drapeName}>
                <i className={s.drapeDot} style={{ background: d.color.hex }} aria-hidden />
                {d.color.name}
              </b>
              <span className={`${s.verdict} ${d.good ? s.good : s.bad}`}>
                <Icon name={d.good ? 'check' : 'x'} size={16} stroke={2.2} />
                {d.good ? '잘 어울려요' : '피해 주세요'}
              </span>
              <span className={s.meta}>{d.note}</span>
            </figcaption>
          </figure>
        ))}
      </PhotoGrid>

      <section className={`${s.block} ${s.guideBlock}`}>
        <SectionTitle>스타일 가이드</SectionTitle>
        <Rows className={s.guideRows}>
          {data.guide.map((g) => (
            <Row key={g.k} k={g.k} v={g.v} avoid={g.avoid} right={g.dots ? <SwatchDots colors={g.dots} size={20} /> : null} />
          ))}
        </Rows>
      </section>

      {data.report ? <Report report={data.report} confidence={type.confidence} /> : null}

      <ButtonPair primary={{ label: '추구미 찾기', href: ROUTES.muse }} secondary={integrated ? { label: '내 기록', href: ROUTES.library } : { label: '리포트 저장' }} />
    </Screen>
  );
}
