/**
 * 가이드 화면 조각 (상태 없음, 서버/클라이언트 공용).
 */
import type { ReactNode } from 'react';
import type { ColorSubstitution, Gap, GuideItem, NamedColor, VibeGuide } from '@celeber/core/contracts';
import { OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { CompareBars, Icon, RadarChart, Swatch } from '@celeber/ui';
import { AREA_LABEL_KO, DIFFICULTY_LABEL_KO } from '../lib/rules';
import s from './guide.module.css';

export function Dot({ hex, size = 'md', title }: { hex: string; size?: 'md' | 'sm'; title?: string }) {
  return <span className={size === 'sm' ? s.dotSm : s.dot} style={{ background: hex }} role="img" aria-label={title ?? hex} title={title} />;
}

/** 팔레트 두 줄 비교 (레퍼런스 05: '한서도 가을 소프트' / '나 봄 웜 브라이트') */
export function PaletteCompare({ celebLabel, celebSub, celebColors, myLabel = '나', mySub, myColors }: { celebLabel: string; celebSub?: string; celebColors: NamedColor[]; myLabel?: string; mySub?: string; myColors: NamedColor[] }) {
  const row = (colors: NamedColor[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4 }}>
      {colors.slice(0, 5).map((c, i) => (
        <Swatch key={`${c.hex}-${i}`} hex={c.hex} name={c.name} size={40} />
      ))}
    </div>
  );
  return (
    <div className={s.palettePanel}>
      <div>
        <div className={s.paletteHead}>
          {celebLabel} {celebSub ? <span>{celebSub}</span> : null}
        </div>
        {row(celebColors)}
      </div>
      <div>
        <div className={s.paletteHead}>
          {myLabel} {mySub ? <span>{mySub}</span> : null}
        </div>
        {row(myColors)}
      </div>
    </div>
  );
}

/** 연예인 팔레트 ↔ 내 팔레트 매핑 행 */
export function PaletteMapping({ mapping }: { mapping: VibeGuide['paletteMapping'] }) {
  return (
    <ul className={s.mapList}>
      {mapping.map((m, i) => (
        <li key={`${m.celeb.hex}-${i}`} className={s.mapRow}>
          <span className={s.mapCell}>
            <Dot hex={m.celeb.hex} title={m.celeb.name} />
            <span style={{ minWidth: 0 }}>
              <span className={s.mapName} style={{ display: 'block' }}>{m.celeb.name}</span>
              <span className={s.mapSub}>{m.celeb.hex.toUpperCase()}</span>
            </span>
          </span>
          <span className={s.arrow} aria-hidden>
            <Icon name="chevron-right" size={18} />
          </span>
          <span className={s.mapCell}>
            <Dot hex={m.mine.hex} title={m.mine.name} />
            <span style={{ minWidth: 0 }}>
              <span className={s.mapName} style={{ display: 'block' }}>{m.mine.name}</span>
              <span className={s.mapSub}>{m.deltaE === 0 ? '그대로 사용' : `ΔE ${m.deltaE}`}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 코디 색 치환표 */
export function SubstitutionTable({ substitutions, emptyText = '사진에서 코디 아이템을 찾지 못했습니다.' }: { substitutions: ColorSubstitution[]; emptyText?: string }) {
  if (!substitutions.length) return <p className="cb-body cb-muted">{emptyText}</p>;
  return (
    <div>
      {substitutions.map((x, i) => (
        <div key={`${x.category}-${i}`} className={s.subRow}>
          <span className={s.subLabel}>{OUTFIT_CATEGORY_LABEL_KO[x.category]}</span>
          <div>
            <div className={s.subColors}>
              <Dot hex={x.celebColor.hex} size="sm" title={x.celebColor.name} />
              <span>{x.celebColor.name}</span>
              {x.keepOriginal ? (
                <span className={s.keep}>그대로</span>
              ) : (
                <>
                  <Icon name="chevron-right" size={14} />
                  <Dot hex={x.myColor.hex} size="sm" title={x.myColor.name} />
                  <span>{x.myColor.name}</span>
                  <span className={s.swap}>ΔE {x.deltaE}</span>
                </>
              )}
            </div>
            <div className={s.subReason}>
              {x.itemName} · {x.reason}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 레퍼런스 05 '스타일링 포인트': 영역 + 한 줄 결론 */
export function StylingPoints({ rows }: { rows: { key: string; value: ReactNode }[] }) {
  return (
    <div>
      {rows.map((r) => (
        <div key={r.key} className={s.pointRow}>
          <span className={s.pointKey}>{r.key}</span>
          <span className={s.pointVal}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function GuideItems({ items }: { items: GuideItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      {items.map((it, i) => (
        <div key={`${it.title}-${i}`} className={s.item}>
          <div className={s.itemTitle}>
            <span>{it.title}</span>
            {it.colors?.length ? (
              <span className={s.itemDots}>
                {it.colors.slice(0, 4).map((c, j) => (
                  <Dot key={`${c.hex}-${j}`} hex={c.hex} size="sm" title={c.name} />
                ))}
              </span>
            ) : null}
          </div>
          <p className={s.itemDetail}>{it.detail}</p>
        </div>
      ))}
    </div>
  );
}

const DIFF_CLASS = { easy: s.diffEasy, medium: s.diffMedium, hard: s.diffHard } as const;

export function ActionList({ actions }: { actions: VibeGuide['actions'] }) {
  return (
    <ol className={s.actions}>
      {actions.map((a) => (
        <li key={a.priority} className={s.action}>
          <span className={s.actionNo}>{a.priority}</span>
          <div>
            <div className={s.actionMeta}>
              <span className={`${s.diff} ${DIFF_CLASS[a.difficulty]}`}>{DIFFICULTY_LABEL_KO[a.difficulty]}</span>
              <span className={s.area}>{AREA_LABEL_KO[a.area]}</span>
            </div>
            <div className="cb-row-title" style={{ fontSize: 15 }}>
              {a.title}
            </div>
            <p className={s.itemDetail}>{a.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DoNotCopyList({ items }: { items: VibeGuide['doNotCopy'] }) {
  return (
    <div>
      {items.map((d, i) => (
        <div key={`${d.element}-${i}`} className={s.dont}>
          <div className={s.dontEl}>{d.element}</div>
          <p className={s.itemDetail}>{d.reason}</p>
          <div className={s.dontAlt}>
            <b>대신</b>
            {d.alternative}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 갭 시각화: 레이더(비교 가능한 축) + 나란히 비교 바 + 비교 불가 축 안내 */
export function GapSection({ gaps, celebName, bodyAddHref }: { gaps: Gap[]; celebName: string; bodyAddHref?: string }) {
  const ok = gaps.filter((g) => !g.unavailable);
  const na = gaps.filter((g) => g.unavailable);
  return (
    <div>
      {ok.length >= 3 ? (
        <RadarChart
          axes={ok.map((g) => g.label)}
          series={[
            { label: '나', values: ok.map((g) => g.me), color: 'var(--cb-ink)' },
            { label: celebName, values: ok.map((g) => g.celeb), color: 'var(--cb-coral)' },
          ]}
          size={280}
        />
      ) : null}
      <div style={{ marginTop: 16 }}>
        <CompareBars
          aLabel="나"
          bLabel={celebName}
          rows={ok.map((g) => ({
            key: g.axis,
            label: `${g.label} (${g.poles[0]} ↔ ${g.poles[1]})`,
            a: g.me,
            b: g.celeb,
            comment: g.comment,
          }))}
        />
      </div>
      {na.length ? (
        <div className={s.gapNote}>
          {na.map((g) => (
            <div key={g.axis} className={s.gapUnavailable}>
              <span>
                <b>{g.label}</b> · {g.comment}
              </span>
              {g.axis === 'body-ratio' && bodyAddHref && g.comment.startsWith('내 전신') ? (
                <a href={bodyAddHref} className="cb-caption" style={{ fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--cb-iris-deep)' }}>
                  전신 사진 추가
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
