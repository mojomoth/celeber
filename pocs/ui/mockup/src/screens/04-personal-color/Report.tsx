import type { NamedColor, PersonalColorReport } from '@/data/types';
import { Card, Icon, Row, Rows, SectionTitle, Swatch } from '@/ui';
import s from './screen.module.css';

/** 리포트 가이드 카드의 나머지 섹션: 헤어·액세서리, 그루밍, 피할 스타일, 오늘 해 볼 것, 진단 신뢰도 */
export function Report({ report, confidence }: { report: PersonalColorReport; confidence: number }) {
  const { hair, accessories, grooming, avoid, today, accuracy } = report;
  return (
    <>
      <section className={s.block}>
        <SectionTitle>헤어와 액세서리</SectionTitle>
        <SwatchGroup title="헤어 컬러" colors={hair.colors} note={hair.note} />
        <SwatchGroup title="액세서리" colors={accessories.colors} note={accessories.note} />
      </section>

      <section className={s.block}>
        <SectionTitle>그루밍</SectionTitle>
        <Rows className={s.guideRows}>
          {grooming.map((g) => (
            <Row key={g.k} k={g.k} v={g.v} />
          ))}
        </Rows>
      </section>

      <section className={s.block}>
        <SectionTitle>피하면 좋은 스타일</SectionTitle>
        <ul className={s.avoid}>
          {avoid.map((a) => (
            <li key={a.color.name}>
              <Swatch color={a.color.hex} size={40} />
              <span className={s.avoidText}>
                <b>{a.color.name}</b>
                <span>{a.note}</span>
              </span>
              <Icon name="x" size={18} stroke={2} className={s.bad} />
            </li>
          ))}
        </ul>
      </section>

      <section className={s.block}>
        <SectionTitle>오늘 바로 해 볼 것</SectionTitle>
        <Card className={s.today}>
          <ul>
            {today.map((t) => (
              <li key={t}>
                <Icon name="check" size={18} stroke={2.2} className={s.good} />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className={s.block}>
        <div className={s.accHead}>
          <SectionTitle>진단 신뢰도</SectionTitle>
          <span>
            <b>{confidence}%</b> {accuracy.level}
          </span>
        </div>
        <div className={s.accBar} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidence} aria-label="진단 신뢰도">
          <i style={{ width: `${confidence}%` }} />
        </div>
        <Rows className={s.guideRows}>
          {accuracy.factors.map((f) => (
            <Row key={f.k} k={f.k} v={f.v} right={<span className={`${s.status} ${f.ok ? s.good : s.warn}`}>{f.ok ? '확인' : '주의'}</span>} />
          ))}
        </Rows>
        <p className={s.caution}>{accuracy.caution}</p>
      </section>
    </>
  );
}

function SwatchGroup({ title, colors, note }: { title: string; colors: NamedColor[]; note: string }) {
  return (
    <div className={s.group}>
      <h3 className={s.groupTitle}>{title}</h3>
      <div className={s.groupSwatches}>
        {colors.map((c) => (
          <Swatch key={c.name} color={c.hex} size={46} label={c.name} />
        ))}
      </div>
      <p className={s.groupNote}>{note}</p>
    </div>
  );
}
