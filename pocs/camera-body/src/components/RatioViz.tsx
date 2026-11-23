/**
 * 비율 시각화: 참조 범위 대비 막대(RatioBars), 등신 비교 도식(ProportionDiagram), 실루엣 도식(SilhouetteDiagram).
 * 상태 없음 — 서버/클라이언트 컴포넌트 양쪽에서 사용 가능.
 */
import { BODY_FRAME_LABEL_KO, type BodyAnalysis, type BodyFrame, type RatioInsight } from '@celeber/core/contracts';
import { widthMethodOf } from '../lib/analyze';
import { insightDomain, rangeVerdict } from '../lib/interpret';

const INK = 'var(--cb-ink)';
const LINE = 'var(--cb-line)';
const IRIS = 'var(--cb-iris)';
const IRIS_DEEP = 'var(--cb-iris-deep)';
const IRIS_SOFT = 'var(--cb-iris-soft)';
const MUTED = 'var(--cb-text-2)';

/** 한 수치: 라벨/값 + 참조 범위 띠 + 마커 + 한 줄 해석 */
export function RatioBar({ insight, domain }: { insight: RatioInsight; domain?: [number, number] }) {
  const [d0, d1] = domain ?? [Math.min(insight.value, insight.reference?.min ?? insight.value) * 0.8, Math.max(insight.value, insight.reference?.max ?? insight.value) * 1.2];
  const pos = (v: number) => `${Math.max(0, Math.min(1, (v - d0) / (d1 - d0))) * 100}%`;
  const ref = insight.reference;
  const verdict = ref ? rangeVerdict(insight.key, insight.value, ref) : 'in';
  const inRange = verdict === 'in';
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="cb-row-title">{insight.label}</span>
        <span style={{ fontWeight: 800, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{insight.display}</span>
      </div>
      <div
        role="img"
        aria-label={`${insight.label} ${insight.display}${ref ? `, 참조 범위 ${ref.label}` : ''}`}
        style={{ position: 'relative', height: 26, marginTop: 8 }}
      >
        <span style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 6, borderRadius: 3, background: LINE }} />
        {ref ? <span style={{ position: 'absolute', left: pos(ref.min), width: `calc(${pos(ref.max)} - ${pos(ref.min)})`, top: 8, height: 10, borderRadius: 5, background: IRIS_SOFT, border: `1px solid ${IRIS}` }} /> : null}
        {ref?.ideal !== undefined ? <span title="기준값" style={{ position: 'absolute', left: pos(ref.ideal), top: 4, width: 2, height: 18, marginLeft: -1, background: IRIS_DEEP }} /> : null}
        <span
          style={{
            position: 'absolute',
            left: pos(insight.value),
            top: 3,
            width: 20,
            height: 20,
            marginLeft: -10,
            borderRadius: '50%',
            background: inRange ? INK : 'var(--cb-coral)',
            border: '3px solid var(--cb-ivory)',
            boxShadow: '0 0 0 1px rgba(37,34,43,0.25)',
          }}
        />
      </div>
      {ref ? (
        <div className="cb-caption cb-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>참조 {ref.label}</span>
          <span>{inRange ? '범위 안' : verdict === 'low' ? '범위보다 낮음' : '범위보다 높음'}</span>
        </div>
      ) : null}
      <p className="cb-body" style={{ marginTop: 6 }}>
        {insight.comment}
      </p>
    </div>
  );
}

export function RatioBars({ analysis }: { analysis: BodyAnalysis }) {
  const method = widthMethodOf(analysis);
  return (
    <div>
      {analysis.insights.map((i) => (
        <RatioBar key={i.key} insight={i} domain={insightDomain(i.key, method)} />
      ))}
    </div>
  );
}

/** 나 vs 기준(7.5등신) 세로 막대: 머리 / 몸통 / 다리 구간과 머리 단위 눈금 */
export function ProportionDiagram({ analysis, referenceHeads = 7.5 }: { analysis: BodyAnalysis; referenceHeads?: number }) {
  const r = analysis.ratios;
  if (!r) return null;
  const H = 240;
  const colW = 54;
  // 저장된 값이 비정상이어도(음수·무한대·거대값) 렌더링이 서버를 멈추지 않게 범위를 고정한다.
  const heads = Number.isFinite(r.headsTall) ? Math.min(Math.max(r.headsTall, 1), 15) : referenceHeads;
  const leg = Number.isFinite(r.legToHeight) ? Math.min(Math.max(r.legToHeight, 0), 0.9) : 0.52;
  const cols = [
    { label: '나', heads, leg, color: INK },
    { label: `기준 ${referenceHeads}등신`, heads: referenceHeads, leg: 0.52, color: MUTED },
  ];
  const width = 330;
  return (
    <svg viewBox={`0 0 ${width} ${H + 56}`} width="100%" role="img" aria-label={`등신 비교: 나 ${r.headsTall.toFixed(1)}등신, 기준 ${referenceHeads}등신`}>
      {cols.map((c, ci) => {
        const x = 60 + ci * 120;
        const unit = H / c.heads;
        const head = unit;
        const legH = H * c.leg;
        const torso = H - head - legH;
        const y0 = 16;
        const ticks = Array.from({ length: Math.floor(c.heads) + 1 }, (_, i) => y0 + i * unit);
        return (
          <g key={c.label}>
            <rect x={x} y={y0} width={colW} height={head} rx={6} fill={ci === 0 ? 'var(--cb-lime)' : IRIS_SOFT} stroke={c.color} strokeWidth={1.2} />
            <rect x={x} y={y0 + head} width={colW} height={torso} fill={ci === 0 ? 'var(--cb-paper)' : 'var(--cb-ivory)'} stroke={c.color} strokeWidth={1.2} />
            <rect x={x} y={y0 + head + torso} width={colW} height={legH} rx={4} fill={ci === 0 ? IRIS_SOFT : 'var(--cb-paper)'} stroke={c.color} strokeWidth={1.2} />
            {ticks.map((ty, i) => (
              <line key={i} x1={x - 8} x2={x} y1={ty} y2={ty} stroke={c.color} strokeWidth={1} />
            ))}
            <text x={x + colW / 2} y={y0 + head / 2 + 4} fontSize={11} textAnchor="middle" fill={INK} fontWeight={700}>
              머리
            </text>
            <text x={x + colW / 2} y={y0 + head + torso / 2 + 4} fontSize={11} textAnchor="middle" fill={INK}>
              몸통
            </text>
            <text x={x + colW / 2} y={y0 + head + torso + legH / 2 + 4} fontSize={11} textAnchor="middle" fill={INK}>
              다리 {Math.round(c.leg * 100)}%
            </text>
            <text x={x + colW / 2} y={H + 36} fontSize={12} textAnchor="middle" fill={c.color} fontWeight={700}>
              {c.label}
            </text>
            {ci === 0 ? (
              <text x={x + colW / 2} y={H + 52} fontSize={12} textAnchor="middle" fill={INK} fontWeight={800}>
                {r.headsTall.toFixed(1)}등신
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={36} x2={width - 20} y1={16} y2={16} stroke={LINE} />
      <line x1={36} x2={width - 20} y1={16 + H} y2={16 + H} stroke={LINE} />
      <text x={300} y={20} fontSize={10} textAnchor="end" fill={MUTED}>
        정수리
      </text>
      <text x={300} y={H + 12} fontSize={10} textAnchor="end" fill={MUTED}>
        발바닥
      </text>
    </svg>
  );
}

/** 어깨-허리-골반 실루엣 도식 + 체형 점수 막대 */
export function SilhouetteDiagram({ analysis }: { analysis: BodyAnalysis }) {
  const s = analysis.silhouette;
  const f = analysis.frame;
  if (!s && !f) return null;
  const W = 330;
  const cx = 90;
  const scale = 300; // 키 대비 폭 → px
  const sh = s ? s.shoulder * scale : 70;
  const hp = s ? s.hip * scale : 60;
  const ws = s?.waist !== undefined ? s.waist * scale : (sh + hp) / 2 - 4;
  const y = { sh: 16, wa: 86, hp: 140, end: 168 };
  const path = `M${cx - sh / 2} ${y.sh} L${cx + sh / 2} ${y.sh} Q${cx + sh / 2} ${y.sh + 20} ${cx + ws / 2} ${y.wa} L${cx + hp / 2} ${y.hp} L${cx + hp / 2 - 6} ${y.end} L${cx - hp / 2 + 6} ${y.end} L${cx - hp / 2} ${y.hp} L${cx - ws / 2} ${y.wa} Q${cx - sh / 2} ${y.sh + 20} ${cx - sh / 2} ${y.sh} Z`;
  const order: BodyFrame[] = ['inverted-triangle', 'rectangle', 'hourglass', 'triangle', 'oval'];
  return (
    <svg viewBox={`0 0 ${W} 184`} width="100%" role="img" aria-label={`실루엣 도식${f ? `: ${f.label}` : ''}`}>
      <path d={path} fill={IRIS_SOFT} stroke={IRIS_DEEP} strokeWidth={1.5} />
      {[
        { yy: y.sh, w: sh, t: '어깨' },
        { yy: y.wa, w: ws, t: '허리' },
        { yy: y.hp, w: hp, t: '골반' },
      ].map((r) => (
        <g key={r.t}>
          <line x1={cx - r.w / 2} x2={cx + r.w / 2} y1={r.yy} y2={r.yy} stroke={INK} strokeWidth={1.2} strokeDasharray={r.t === '허리' && s?.waist === undefined ? '3 3' : undefined} />
          <text x={cx - Math.max(sh, hp) / 2 - 8} y={r.yy + 4} fontSize={11} textAnchor="end" fill={MUTED}>
            {r.t}
          </text>
        </g>
      ))}
      {f ? (
        <g>
          {order.map((k, i) => {
            const v = f.scores[k] ?? 0;
            const yy = 22 + i * 30;
            const active = k === f.type;
            return (
              <g key={k}>
                <text x={180} y={yy} fontSize={12} fill={active ? INK : MUTED} fontWeight={active ? 800 : 500}>
                  {BODY_FRAME_LABEL_KO[k]}
                </text>
                <rect x={180} y={yy + 5} width={130} height={6} rx={3} fill={LINE} />
                <rect x={180} y={yy + 5} width={Math.max(2, 130 * v)} height={6} rx={3} fill={active ? IRIS_DEEP : '#B9B4C0'} />
                <text x={318} y={yy} fontSize={11} textAnchor="end" fill={MUTED}>
                  {Math.round(v * 100)}%
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
