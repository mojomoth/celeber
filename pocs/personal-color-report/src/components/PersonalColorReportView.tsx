'use client';
/**
 * 퍼스널컬러 리포트 뷰. 레퍼런스 카드(navy-men-personal-color-report-card.jpeg)의 섹션 순서와 시각 언어를
 * 390pt 모바일 세로 스크롤로 재배치했다:
 *   헤더(제목·한 줄 설명·메타) → 업로드한 사진 → ①첫인상 → ②타입 → ③웜/쿨 → ④주요 특징 → ⑤드레이핑
 *   → ⑥상의 → ⑦수트/아우터 → ⑧포인트·악세서리 → ⑨헤어 → ⑩그루밍 → ⑪비추천 → 전신 코디(또는 '전신 사진 추가')
 *   → 12 오늘 바로 → 13 주의사항 → 14 신뢰도 → 면책
 * 다른 앱: import { PersonalColorReportView } from '@celeber/personal-color-report/components'
 */
import type { ReactNode } from 'react';
import type { Gender, PersonalColorReport } from '@celeber/core/contracts';
import { getToneProfile, SEASON_LABEL_KO, TONE_PROTOTYPES } from '@celeber/core/personal-color';
import { AxisBars, Card, CheckList, Chips, Gauge, Icon, MockBadge, Notice, PhotoFrame, ReportRow, ReportTable, SectionHeader, Swatch, SwatchRow, Tabs, WarmCoolBars } from '@celeber/ui';
import { BodyAddPlaceholder } from '@celeber/camera-body/components';
import { BODY_ADD_DESCRIPTION, GENDER_LABEL_KO } from '../lib/api';
import { variantUsesTemplateNarrative } from '../lib/narrative';
import { AccessoryIcon } from './AccessoryIcon';
import { DrapeCompare } from './DrapeCompare';
import { ReportStyles } from './styles';

export interface PersonalColorReportViewProps {
  report: PersonalColorReport;
  /** 생성 시 경고 (AI 폴백 사유 등) */
  warning?: string;
  /** 지정하면 헤더 아래에 성별/스타일 변형 선택을 표시 */
  onGenderChange?: (g: Gender) => void;
  genderBusy?: boolean;
  /** 전신이 없을 때 '전신 사진 추가' 링크 */
  bodyAddHref?: string;
  /** 하단 동작 (다시 만들기, 삭제 등) */
  actions?: ReactNode;
}

function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.42 ? '#25222B' : '#FFFDF8';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function Tip({ children, label = 'TIP' }: { children: ReactNode; label?: string }) {
  return (
    <div className="pcr-tip">
      <Icon name="check-circle" size={15} style={{ flex: 'none', marginTop: 1 }} />
      <span>
        <b>{label}</b> {children}
      </span>
    </div>
  );
}

function Dots({ colors }: { colors: { hex: string; name: string }[] }) {
  return (
    <span className="pcr-dots">
      {colors.map((c, i) => (
        <span key={`${c.hex}-${i}`} className="pcr-dot" style={{ background: c.hex }} title={c.name} />
      ))}
    </span>
  );
}

const AXIS_POLES: Record<string, [string, string]> = {
  warmth: ['쿨', '웜'],
  value: ['딥', '라이트'],
  chroma: ['뮤트', '비비드'],
  contrast: ['낮음', '높음'],
  clarity: ['탁함', '맑음'],
};
const AXIS_LABEL: Record<string, string> = { warmth: '웜/쿨', value: '명도', chroma: '채도', contrast: '대비', clarity: '청탁' };
const AXIS_INDEX = { warmth: 0, value: 1, chroma: 2, contrast: 3, clarity: 4 } as const;

export function VariantSwitch({ value, onChange, busy, userSelected, templateNote }: { value: Gender; onChange: (g: Gender) => void; busy?: boolean; userSelected?: boolean; templateNote?: boolean }) {
  return (
    <div className="pcr-variant" aria-busy={busy || undefined}>
      <Tabs
        label="리포트 스타일"
        value={value}
        onChange={(g) => {
          if (!busy && g !== value) onChange(g);
        }}
        items={(['male', 'female', 'unspecified'] as const).map((g) => ({ value: g, label: GENDER_LABEL_KO[g] }))}
      />
      <span className="pcr-variant__note">
        {userSelected ? '직접 고른 스타일입니다.' : '사진 기반 기본값입니다.'} 상의·아우터·악세서리·그루밍 항목이 바뀌며 퍼스널컬러 판정은 같습니다.
      </span>
      {templateNote ? (
        <Notice tone="info">AI 서술은 리포트를 만들 때의 스타일 기준입니다. 지금 스타일의 상의·아우터 TIP, 그루밍, 오늘 바로 적용할 포인트는 측정 기반 템플릿 문구이며, 원래 스타일로 되돌리면 AI 서술이 다시 표시됩니다.</Notice>
      ) : null}
    </div>
  );
}

export function PersonalColorReportView({ report: r, warning, onGenderChange, genderBusy, bodyAddHref, actions }: PersonalColorReportViewProps) {
  const front = r.photos.front;
  const frontAspect = front.width && front.height ? `${front.width} / ${front.height}` : '4 / 5';
  const scores = Object.entries(r.classification.toneScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const m = r.measurements;
  const measured = [
    { label: '피부 (보정 전)', c: m.skinRaw },
    { label: '피부 (보정 후)', c: m.skin },
    { label: '헤어', c: m.hair },
    { label: '눈동자', c: m.eyes },
    { label: '입술', c: m.lips },
  ].filter((x) => x.c);
  const isFemale = r.variant.gender === 'female';

  return (
    <div className="pcr">
      <ReportStyles />

      {/* 헤더 */}
      <header className="pcr-head">
        <div className="pcr-head__row">
          <h1 className="pcr-head__title">{r.header.title}</h1>
          {r.isMock ? <MockBadge title="AI 서술 대신 측정 기반 템플릿을 사용했습니다. 피부색 측정과 타입 판정은 실제 사진에서 계산했습니다." /> : null}
        </div>
        <p className="cb-body cb-muted" style={{ margin: 0 }}>
          {r.header.subtitle}
        </p>
        <dl className="pcr-meta">
          <dt>분석일</dt>
          <dd>{fmtDate(r.header.analyzedAt)}</dd>
          <dt>분석기반</dt>
          <dd>{r.header.basis.join(', ')}</dd>
          <dt>분석도구</dt>
          <dd>{r.header.tool}</dd>
        </dl>
        {onGenderChange ? <VariantSwitch value={r.variant.gender} onChange={onGenderChange} busy={genderBusy} userSelected={r.variant.userSelected} templateNote={variantUsesTemplateNarrative(r)} /> : null}
        {warning ? <Notice tone="warn">{warning}</Notice> : null}
      </header>

      {/* 업로드한 사진 */}
      <section className="pcr-photos" aria-label="업로드한 사진">
        <PhotoFrame src={front.url} alt="퍼스널컬러 분석에 사용한 정면 사진" label="업로드한 사진" aspect={frontAspect} />
        {r.photos.side || r.photos.body || r.photos.environment ? (
          <div className="pcr-photos__more">
            {r.photos.side ? (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photos.side.url} alt="측면 사진" />
                <figcaption>측면</figcaption>
              </figure>
            ) : null}
            {r.photos.body ? (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photos.body.url} alt="전신 사진" />
                <figcaption>전신</figcaption>
              </figure>
            ) : null}
            {r.photos.environment ? (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photos.environment.url} alt="환경(조명) 사진" />
                <figcaption>{m.environment ? `${m.environment.lightSourceLabel}` : '환경'}</figcaption>
              </figure>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ① 첫인상 브리핑 */}
      <Card className="pcr-card">
        <SectionHeader no={r.firstImpression.no} title={r.firstImpression.title} />
        <CheckList items={r.firstImpression.bullets} />
        <Chips items={r.firstImpression.hashtags} />
      </Card>

      {/* ② 퍼스널컬러 타입 */}
      <Card className="pcr-card">
        <SectionHeader no={r.type.no} title={r.type.title} />
        <div className="pcr-type" style={{ background: r.type.accentHex, color: textOn(r.type.accentHex) }}>
          <div className="pcr-type__ko">{r.type.nameKo}</div>
          <div className="pcr-type__en">{r.type.nameEn}</div>
        </div>
        <p className="cb-body" style={{ margin: 0 }}>
          {r.type.description}
        </p>
        {r.confidence.grade === 'low' || r.cautions.items.some((c) => c.startsWith('조명 확인 필요')) ? (
          <Notice tone="warn" title={`${r.confidence.gradeLabel} (${r.confidence.score}%)`}>
            {r.cautions.items.find((c) => c.startsWith('재촬영 권장') || c.startsWith('조명 확인 필요')) ??
              '촬영 조건 때문에 이번 판정은 참고용으로 보세요. 자연광 정면 사진으로 다시 분석하면 더 정확합니다.'}
          </Notice>
        ) : null}
        <div className="pcr-secondary">
          <span>보조 가능 타입</span>
          <strong>{r.type.secondary.nameKo}</strong>
        </div>
        <div className="pcr-scores" aria-label="12톤 적합도 상위 3">
          {scores.map(([t, v]) => (
            <div key={t} className="pcr-score">
              <span>{getToneProfile(t as never).nameKo}</span>
              <span className="pcr-score__track">
                <span className="pcr-score__fill" style={{ width: `${Math.round(v * 100)}%`, background: t === r.type.tone ? 'var(--cb-ink)' : 'var(--cb-text-2)' }} />
              </span>
              <span style={{ textAlign: 'right' }}>{Math.round(v * 100)}%</span>
            </div>
          ))}
          {/* 막대 %를 판정 신뢰도로 읽지 않도록 (재촬영 권장 45% 옆에 85%가 나란히 보이는 문제) */}
          <p className="pcr-scores__note">12톤 사이의 상대 적합도입니다. 촬영 조건까지 반영한 판정 신뢰도는 {r.confidence.score}%입니다.</p>
        </div>
        {r.aiOpinion ? (
          <div className="pcr-tip">
            <Icon name="info" size={15} style={{ flex: 'none', marginTop: 1 }} />
            <span>
              <b>AI 독립 판정</b> {getToneProfile(r.aiOpinion.tone).nameKo}
              {r.aiOpinion.agreesWithRules ? ' · 측정 판정과 일치.' : ` · 측정 판정과 다름(${SEASON_LABEL_KO[r.aiOpinion.tone.split('-')[0] as 'spring']} 계열).`} {r.aiOpinion.rationale}
            </span>
          </div>
        ) : null}
      </Card>

      {/* ③ 웜톤 vs 쿨톤 분석 */}
      <Card className="pcr-card">
        <SectionHeader no={r.warmCool.no} title={r.warmCool.title} />
        <WarmCoolBars
          warmPercent={r.warmCool.warmPercent}
          coolPercent={r.warmCool.coolPercent}
          warmColors={r.warmCool.warmGradient}
          coolColors={r.warmCool.coolGradient}
          warmMarker={r.warmCool.warmMarker}
          coolMarker={r.warmCool.coolMarker}
        />
        <div className="pcr-point">
          <div className="pcr-point__title">분석 포인트</div>
          {r.warmCool.analysisPoint}
        </div>
        <div className="pcr-compare">
          <div className="pcr-compare__row">
            <span className="pcr-compare__tag" style={{ color: '#B5651D' }}>
              웜 계열
            </span>
            <Dots colors={r.warmCool.comparison.warm.colors} />
            <span>{r.warmCool.comparison.warm.text}</span>
          </div>
          <div className="pcr-compare__row">
            <span className="pcr-compare__tag" style={{ color: 'var(--cb-iris-deep)' }}>
              쿨 계열
            </span>
            <Dots colors={r.warmCool.comparison.cool.colors} />
            <span>{r.warmCool.comparison.cool.text}</span>
          </div>
        </div>
      </Card>

      {/* ④ 주요 특징 분석 */}
      <Card className="pcr-card">
        <SectionHeader no={r.features.no} title={r.features.title} />
        <ReportTable>
          {r.features.rows.map((row) => (
            <ReportRow key={row.key} icon={row.icon === 'check' ? 'check' : row.icon} label={row.label} value={row.value} />
          ))}
        </ReportTable>
        <AxisBars
          axes={(['warmth', 'value', 'chroma', 'contrast', 'clarity'] as const).map((k) => ({
            key: k,
            label: AXIS_LABEL[k],
            value: r.features.axes[k],
            compare: Math.round(TONE_PROTOTYPES[r.type.tone][AXIS_INDEX[k]] * 100),
            poles: AXIS_POLES[k],
          }))}
        />
        <div className="pcr-legend" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--cb-ink)' }} /> 내 측정값
          </span>
          <span>
            <i style={{ background: 'var(--cb-coral)' }} /> {r.type.nameKo} 기준
          </span>
        </div>
        <div>
          <p className="pcr-sub" style={{ marginBottom: 8 }}>
            측정한 색
          </p>
          <div className="pcr-measured">
            {measured.map((x) => (
              <div key={x.label} className="pcr-measured__item">
                <span className="pcr-measured__chip" style={{ background: x.c!.hex }} />
                <span>{x.label}</span>
                <span className="cb-mono">{x.c!.hex}</span>
              </div>
            ))}
          </div>
          <p className="cb-caption cb-muted" style={{ margin: '8px 0 0' }}>
            피부 L* {m.skin.lab.l.toFixed(1)} · a* {m.skin.lab.a.toFixed(1)} · b* {m.skin.lab.b.toFixed(1)} · ITA {m.skin.ita.toFixed(0)}° · 색상각 {m.skin.lch.h.toFixed(0)}° · 채도 {m.skin.lch.c.toFixed(1)}
            {m.environment ? ` · ${m.environment.lightSourceLabel} ${m.environment.cctK.toLocaleString('en-US')}K` : ''}
          </p>
        </div>
      </Card>

      {/* ⑤ 톤 컬러 적용 예시 */}
      <Card className="pcr-card">
        <SectionHeader no={r.draping.no} title={r.draping.title} subtitle="얼굴 주변 비교" />
        <DrapeCompare report={r} />
      </Card>

      {/* ⑥ 추천 셔츠(상의) 색상 */}
      <Card className="pcr-card">
        <SectionHeader no={r.tops.no} title={r.tops.title} />
        <div className="pcr-swatches-1line">
          <SwatchRow items={r.tops.items.map((i) => ({ hex: i.color.hex, name: i.color.name, shape: i.shape }))} columns={3} size={56} />
        </div>
        <Tip>{r.tops.tip}</Tip>
      </Card>

      {/* ⑦ 추천 수트(아우터·하의) 컬러 */}
      <Card className="pcr-card">
        <SectionHeader no={r.outer.no} title={r.outer.title} />
        <div className="pcr-swatches-1line">
          <SwatchRow items={r.outer.items.map((i) => ({ hex: i.color.hex, name: i.color.name, shape: i.shape }))} columns={3} size={56} />
        </div>
        <Tip>{r.outer.tip}</Tip>
      </Card>

      {/* ⑧ 넥타이(스카프) & 악세서리 */}
      <Card className="pcr-card">
        <SectionHeader no={r.accessories.no} title={r.accessories.title} />
        <p className="pcr-sub">{r.accessories.pointLabel}</p>
        <SwatchRow items={r.accessories.pointColors.map((i) => ({ hex: i.color.hex, name: i.color.name, shape: i.shape }))} columns={4} size={48} />
        <p className="pcr-sub">{r.accessories.itemsLabel}</p>
        <div className="pcr-metals">
          {r.accessories.items.map((it, i) => (
            <div key={`${it.kind}-${i}`} className="pcr-metal">
              <AccessoryIcon kind={it.kind} metal={it.metal} />
              <span>{it.label}</span>
            </div>
          ))}
        </div>
        <Tip label="금속 톤">{r.accessories.metalSummary}</Tip>
      </Card>

      {/* ⑨ 추천 헤어 컬러 */}
      <Card className="pcr-card">
        <SectionHeader no={r.hair.no} title={r.hair.title} />
        <p className="cb-body cb-muted" style={{ margin: 0 }}>
          {r.hair.intro}
        </p>
        <div className="pcr-hair">
          {r.hair.items.map((h) => (
            <Swatch key={h.color.hex} hex={h.color.hex} name={h.color.name} shape="hair" size={52} caption={h.description} />
          ))}
        </div>
        <Tip>{r.hair.tip}</Tip>
      </Card>

      {/* ⑩ 그루밍 제안 */}
      <Card className="pcr-card">
        <SectionHeader no={r.grooming.no} title={r.grooming.title} />
        <ReportTable>
          {r.grooming.items.map((g) => (
            <ReportRow
              key={g.key}
              icon={g.icon === 'check' ? 'check' : g.icon}
              label={g.label}
              value={
                <>
                  {g.suggestion}
                  {g.colors?.length ? (
                    <span className="pcr-grooming-colors">
                      <Dots colors={g.colors} />
                    </span>
                  ) : null}
                </>
              }
            />
          ))}
        </ReportTable>
      </Card>

      {/* ⑪ 비추천 스타일 */}
      <Card className="pcr-card">
        <SectionHeader no={r.avoidStyles.no} title={r.avoidStyles.title} />
        <p className="cb-body cb-muted" style={{ margin: 0 }}>
          {r.avoidStyles.intro}
        </p>
        <div className="pcr-styles">
          {r.avoidStyles.items.map((s) => (
            <div key={s.label} className="pcr-style">
              <Swatch hex={s.colors[0].hex} shape={s.shape} size={48} />
              <div>
                <div className="pcr-style__label">{s.label}</div>
                <div className="pcr-style__reason">{s.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 전신: 체형 비율 기반 코디 실루엣 */}
      {r.bodyStyling ? (
        <Card className="pcr-card">
          <SectionHeader title="체형 비율 코디 실루엣" subtitle={`${r.bodyStyling.frameLabel}${r.bodyStyling.headsTall ? ` · ${r.bodyStyling.headsTall.toFixed(1)}등신` : ''}`} />
          <ReportTable>
            {r.bodyStyling.suggestions.map((s) => (
              <ReportRow key={s.title} icon="body" label={s.title} value={s.detail} />
            ))}
          </ReportTable>
          {r.bodyStyling.avoid.length ? <Tip label="피할 실루엣">{r.bodyStyling.avoid.join(' / ')}</Tip> : null}
          <p className="cb-caption cb-muted" style={{ margin: 0 }}>
            실루엣 제안의 색은 ⑥⑦의 추천 색을 사용하세요{isFemale ? '. 하의는 아우터 팔레트와 같은 계열이 무난합니다.' : '.'}
          </p>
        </Card>
      ) : (
        <BodyAddPlaceholder href={bodyAddHref} description={BODY_ADD_DESCRIPTION} />
      )}

      {/* 12 오늘 바로 적용할 포인트 */}
      <Card className="pcr-card">
        <SectionHeader no={r.todayActions.no} title={r.todayActions.title} />
        <CheckList items={r.todayActions.items} icon="check" />
      </Card>

      {/* 13 정확도 주의사항 */}
      <Card className="pcr-card">
        <SectionHeader no={r.cautions.no} title={r.cautions.title} />
        <div className="pcr-caution">
          <span className="pcr-caution__icon">
            <Icon name="clipboard" size={22} />
          </span>
          <ul className="cb-list" style={{ margin: 0 }}>
            {r.cautions.items.map((c) => (
              <li key={c} className="cb-body">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 14 분석 신뢰도 */}
      <Card className="pcr-card">
        <SectionHeader no={r.confidence.no} title={r.confidence.title} />
        <div className="pcr-conf">
          <Gauge value={r.confidence.score} label={r.confidence.gradeLabel} size={104} color={r.confidence.grade === 'high' ? 'var(--cb-iris-deep)' : r.confidence.grade === 'medium' ? 'var(--cb-warn)' : 'var(--cb-danger)'} />
          <div className="pcr-factors">
            {r.confidence.factors.map((f) => (
              <div key={f.key} className="pcr-factor">
                <div className="pcr-factor__top">
                  <span>{f.label}</span>
                  <span>{Math.round(f.score * 100)}</span>
                </div>
                <span className="pcr-score__track">
                  <span className="pcr-score__fill" style={{ width: `${Math.round(f.score * 100)}%` }} />
                </span>
                <span className="pcr-factor__detail">{f.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {actions}

      <p className="pcr-disclaimer">{r.disclaimer}</p>
    </div>
  );
}
