/**
 * 사진 위 SVG 오버레이: 관절점·골격선, 등신 눈금(머리 길이 단위), 상체/하체 분할선, 어깨·허리·골반 폭 선.
 * 사진과 같은 종횡비의 컨테이너 위에 absolute로 겹친다(PhotoFrame overlay 슬롯).
 */
import type { BodyAnalysis, Point2 } from '@celeber/core/contracts';
import { POSE, POSE_JOINTS, POSE_SEGMENTS } from '../lib/pose';

export interface OverlayLayers {
  skeleton?: boolean;
  ruler?: boolean;
  split?: boolean;
  widths?: boolean;
}

export const DEFAULT_LAYERS: Required<OverlayLayers> = { skeleton: true, ruler: true, split: true, widths: true };

const VW = 1000;
const INK = '#25222B';
const IVORY = '#FFFDF8';
const IRIS = '#7274E9';
const LIME = '#D6F36C';
const CORAL = '#FB603C';

/** 라벨 상자 폭 (viewBox 단위, 글자 폭 근사) */
export function labelWidth(text: string, size: number): number {
  return [...text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x1100 ? size * 0.98 : size * 0.6), 0) + 16;
}

/** 라벨 상자 세로 범위 (y는 글자 기준선) */
const labelBox = (y: number, size: number) => ({ top: y - size * 0.85, bottom: y + size * 0.4 });

export interface Box {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/**
 * 폭선 라벨(어깨·허리·골반)이 상·하체 비율 칩과 겹치면 라벨을 세로로 비켜 놓는다.
 * 후보는 원래 자리와 각 칩의 바로 위·아래이고, 어떤 칩과도 겹치지 않는 후보 중 원래 자리에 가장 가까운 것을 고른다.
 * (칩 두 개가 붙어 있어도 한 칩을 피하다 다른 칩에 올라앉지 않는다.) 반환값은 라벨 기준선 y.
 */
export function placeWidthLabelY(x0: number, baseline: number, text: string, size: number, obstacles: Box[], gap = 14): number {
  const w = labelWidth(text, size);
  const inX = obstacles.filter((o) => x0 < o.x1 && x0 + w > o.x0);
  const clear = (y: number) => {
    const b = labelBox(y, size);
    return inX.every((o) => b.top >= o.bottom || b.bottom <= o.top);
  };
  if (clear(baseline)) return baseline;
  const candidates = inX.flatMap((o) => [o.top - gap - size * 0.4, o.bottom + gap + size * 0.85]).sort((a, b) => Math.abs(a - baseline) - Math.abs(b - baseline));
  return candidates.find(clear) ?? baseline;
}

/**
 * 폭선 라벨의 왼쪽 x. 기본은 선 오른쪽 끝 바깥이고, 사진 오른쪽 경계를 넘으면 선 왼쪽 끝 바깥,
 * 그것도 넘으면 선 안쪽(오른쪽 끝 안)에 둔다. 어느 경우든 [margin, vw - margin] 안에 들어오게 자른다.
 */
export function placeWidthLabelX(xa: number, xb: number, text: string, size: number, vw = VW, gap = 14, margin = 4): number {
  const w = labelWidth(text, size);
  const [l, r] = xa <= xb ? [xa, xb] : [xb, xa];
  if (r + gap + w <= vw - margin) return r + gap;
  if (l - gap - w >= margin) return l - gap - w;
  return Math.max(margin, Math.min(vw - margin - w, r - gap - w));
}

function Label({ x, y, text, anchor = 'start', fill = IVORY, bg = 'rgba(37,34,43,0.78)', size = 34 }: { x: number; y: number; text: string; anchor?: 'start' | 'end' | 'middle'; fill?: string; bg?: string; size?: number }) {
  const w = labelWidth(text, size);
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return (
    <g>
      <rect x={x0} y={y - size * 0.85} width={w} height={size * 1.25} rx={size * 0.35} fill={bg} />
      <text x={x0 + 8} y={y} fontSize={size} fontWeight={700} fill={fill} fontFamily="var(--cb-font, sans-serif)">
        {text}
      </text>
    </g>
  );
}

function WidthLabel({ xa, xb, y, text, chips }: { xa: number; xb: number; y: number; text: string; chips: Box[] }) {
  const x = placeWidthLabelX(xa, xb, text, 30);
  return <Label x={x} y={placeWidthLabelY(x, y, text, 30, chips)} text={text} size={30} bg="rgba(76,69,173,0.88)" />;
}

/** 등신 눈금 최대 개수 (등신 범위 3~13 + 여유) */
const MAX_RULER_TICKS = 20;

export function BodyOverlay({ analysis, aspect, layers = DEFAULT_LAYERS }: { analysis: BodyAnalysis; /** 이미지 높이/너비 */ aspect: number; layers?: OverlayLayers }) {
  const VH = VW * aspect;
  const L = analysis.landmarks;
  const k = analysis.keypoints ?? {};
  const X = (p: Point2) => p.x * VW;
  const Y = (p: Point2) => p.y * VH;
  const r = analysis.ratios;
  const show = { ...DEFAULT_LAYERS, ...layers };
  const vis = (i: number) => (L?.[i]?.visibility ?? 1) >= 0.5;

  const top = k.headTop;
  const chin = k.chin;
  const sole = k.sole;
  const hip = k.hipMid;
  const headUnit = top && chin ? Y(chin) - Y(top) : 0;
  const ticks: number[] = [];
  // 눈금 수는 등신(사람이면 3~13)만큼이다. 좌표가 비정상이면(저장된 거대값 등) 눈금자를 그리지 않는다.
  const tickCount = top && sole && headUnit > 4 ? (Y(sole) - Y(top)) / headUnit : NaN;
  if (top && Number.isFinite(tickCount) && tickCount >= 0 && tickCount <= MAX_RULER_TICKS) {
    for (let n = 0; n <= Math.floor(tickCount + 0.5 / headUnit); n++) ticks.push(Y(top) + n * headUnit);
  }
  // 눈금자는 몸 왼쪽(화면) 바깥에 둔다
  const bodyLeft = L ? Math.min(...[11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].filter((i) => L[i]).map((i) => L[i].x * VW)) : VW * 0.3;
  const rulerX = Math.max(34, bodyLeft - 70);

  const widthRows: { key: string; label: string; a?: Point2; b?: Point2 }[] = [
    { key: 'shoulder', label: '어깨', a: k.silShoulderL ?? (L && { x: L[POSE.rightShoulder].x, y: L[POSE.rightShoulder].y }), b: k.silShoulderR ?? (L && { x: L[POSE.leftShoulder].x, y: L[POSE.leftShoulder].y }) },
    { key: 'waist', label: '허리', a: k.silWaistL, b: k.silWaistR },
    { key: 'hip', label: '골반', a: k.silHipL ?? (L && { x: L[POSE.rightHip].x, y: L[POSE.rightHip].y }), b: k.silHipR ?? (L && { x: L[POSE.leftHip].x, y: L[POSE.leftHip].y }) },
  ];

  // 상·하체 칩 (오른쪽 끝). 폭선 라벨이 겹치면 라벨을 세로로 비켜 놓는다
  const upperPct = r ? Math.round((r.upperToLower / (1 + r.upperToLower)) * 100) : 0;
  const splitChips = show.split && top && sole && hip && r ? [{ text: `상체 ${upperPct}%`, y: Y(hip) - 14 }, { text: `하체 ${100 - upperPct}%`, y: Y(hip) + 50 }] : [];
  const chipBoxes: Box[] = splitChips.map((c) => ({ x0: VW - 16 - labelWidth(c.text, 34), x1: VW - 16, ...labelBox(c.y, 34) }));

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" role="img" aria-label="관절점, 등신 눈금, 폭 측정선 오버레이">
      {show.split && top && sole && hip && r ? (
        <g>
          <line x1={0} x2={VW} y1={Y(top)} y2={Y(top)} stroke={IVORY} strokeWidth={1.5} strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={VW} y1={Y(sole)} y2={Y(sole)} stroke={IVORY} strokeWidth={1.5} strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={VW} y1={Y(hip)} y2={Y(hip)} stroke={CORAL} strokeWidth={2} strokeDasharray="14 8" vectorEffect="non-scaling-stroke" />
          {splitChips.map((c) => (
            <Label key={c.text} x={VW - 16} y={c.y} anchor="end" text={c.text} />
          ))}
        </g>
      ) : null}

      {show.ruler && ticks.length > 1 ? (
        <g>
          <line x1={rulerX} x2={rulerX} y1={ticks[0]} y2={Y(sole!)} stroke={LIME} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          {ticks.map((y, i) => (
            <line key={i} x1={rulerX - 14} x2={rulerX + 14} y1={y} y2={y} stroke={LIME} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          ))}
          {ticks.slice(0, -1).map((y, i) => (
            <text key={`t${i}`} x={rulerX + 22} y={y + headUnit / 2 + 12} fontSize={34} fontWeight={800} fill={LIME} stroke={INK} strokeWidth={5} paintOrder="stroke" fontFamily="var(--cb-font, sans-serif)">
              {i + 1}
            </text>
          ))}
          {r ? <Label x={Math.max(8, rulerX - 20)} y={Math.max(30, Y(top!) - 16)} text={`${r.headsTall.toFixed(1)}등신`} fill={INK} bg={LIME} /> : null}
        </g>
      ) : null}

      {show.widths
        ? widthRows.map((w) =>
            w.a && w.b ? (
              <g key={w.key}>
                <line x1={X(w.a)} x2={X(w.b)} y1={Y(w.a)} y2={Y(w.b)} stroke={INK} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.5} />
                <line x1={X(w.a)} x2={X(w.b)} y1={Y(w.a)} y2={Y(w.b)} stroke={IRIS} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <circle cx={X(w.a)} cy={Y(w.a)} r={8} fill={IRIS} stroke={IVORY} strokeWidth={3} />
                <circle cx={X(w.b)} cy={Y(w.b)} r={8} fill={IRIS} stroke={IVORY} strokeWidth={3} />
                <WidthLabel xa={X(w.a)} xb={X(w.b)} y={Y(w.b) + 9} text={w.label} chips={chipBoxes} />
              </g>
            ) : null,
          )
        : null}

      {show.skeleton && L ? (
        <g>
          {POSE_SEGMENTS.filter(([a, b]) => vis(a) && vis(b)).map(([a, b]) => (
            <g key={`${a}-${b}`}>
              <line x1={L[a].x * VW} y1={L[a].y * VH} x2={L[b].x * VW} y2={L[b].y * VH} stroke={INK} strokeWidth={4} opacity={0.45} vectorEffect="non-scaling-stroke" />
              <line x1={L[a].x * VW} y1={L[a].y * VH} x2={L[b].x * VW} y2={L[b].y * VH} stroke={IVORY} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {POSE_JOINTS.filter(vis).map((i) => (
            <circle key={i} cx={L[i].x * VW} cy={L[i].y * VH} r={7} fill={IVORY} stroke={INK} strokeWidth={2.5} />
          ))}
          {top ? <circle cx={X(top)} cy={Y(top)} r={9} fill={LIME} stroke={INK} strokeWidth={2.5} /> : null}
          {chin ? <circle cx={X(chin)} cy={Y(chin)} r={7} fill={LIME} stroke={INK} strokeWidth={2.5} /> : null}
          {sole ? <circle cx={X(sole)} cy={Y(sole)} r={9} fill={LIME} stroke={INK} strokeWidth={2.5} /> : null}
        </g>
      ) : null}
    </svg>
  );
}
