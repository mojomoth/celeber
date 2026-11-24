import type { SelfAnalysisData } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { ButtonPair, Card, Header, IconButton, PhotoGrid, PhotoTile, Row, Rows, Screen, SectionTitle, Swatch } from '@/ui';
import s from './screen.module.css';

/** 03 내 분석: 촬영 사진 그리드 → 요약 → 피부색 견본 → 관찰한 특징 → 퍼스널컬러·추구미로 이동 */
export function SelfAnalysisScreen({ data }: { data: SelfAnalysisData }) {
  return (
    <Screen nav="analysis">
      <Header title="내 분석" right={<IconButton icon="share" label="공유" />} />

      <PhotoGrid className={s.hero}>
        <PhotoTile src={data.photos.full} alt="전신 사진" label="전신" position="50% 0" className={s.full} imgClassName={s.fullImg} />
        <div className={s.stack}>
          <PhotoTile src={data.photos.front} alt="정면 사진" label="정면" position="50% 14%" />
          <PhotoTile src={data.photos.side} alt="측면 사진" label="측면" position="40% 18%" />
        </div>
      </PhotoGrid>

      <section className={s.summary}>
        <p className="t-eyebrow">{data.meta}</p>
        <h2 className={`t-h1 ${s.headline}`}>
          {data.headline.map((line, i) => (
            <span key={i}>
              {i > 0 ? ' ' : null}
              {line}
            </span>
          ))}
        </h2>
        <p className={`t-body ${s.body}`}>
          {data.summary.map((line, i) => (
            <span key={i}>
              {i > 0 ? ' ' : null}
              {line}
            </span>
          ))}
        </p>
      </section>

      <Card className={s.skin}>
        <h3 className={s.skinK}>
          피부색
          <small>{data.skin.caption}</small>
        </h3>
        <div className={s.samples}>
          {data.skin.samples.map((c) => (
            <Swatch key={c.name} color={c.hex} label={c.name} labelTone="muted" />
          ))}
        </div>
      </Card>

      <section className={s.features}>
        <SectionTitle className={s.featuresTitle}>관찰한 특징</SectionTitle>
        <Rows>
          {data.features.map((f) => (
            <Row key={f.k} k={f.k} v={f.v} />
          ))}
        </Rows>
      </section>

      <ButtonPair primary={{ label: '퍼스널컬러 보기', href: ROUTES.personalColor }} secondary={{ label: '추구미 찾기', href: ROUTES.muse }} />
    </Screen>
  );
}
