import { POCS, type PocKey, pocByKey, pocUrl } from '../../src/pocs';
import type { PocStatus } from '../../src/status';

/** 노드 배치 (342 × 300, 390 화면의 콘텐츠 폭) */
const W = 342;
const NODE_W = 160;
const NODE_H = 48;
const POS: Record<PocKey, { x: number; y: number }> = {
  'camera-face': { x: 0, y: 0 },
  'camera-body': { x: W - NODE_W, y: 0 },
  'personal-color-report': { x: (W - NODE_W) / 2, y: 84 },
  'search-celeb': { x: 0, y: 168 },
  'celeb-vibe': { x: W - NODE_W, y: 168 },
  'celeb-vibe-report': { x: (W - NODE_W) / 2, y: 252 },
};
const H = 252 + NODE_H + 2;

function edgePath(from: PocKey, to: PocKey): string {
  const a = POS[from];
  const b = POS[to];
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  // 같은 열이면 직선, 아니면 아래로 내려가며 꺾는 곡선
  if (Math.abs(x1 - x2) < 1) return `M${x1} ${y1} L${x2} ${y2 - 6}`;
  const my = (y1 + y2) / 2;
  return `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 6}`;
}

export function FlowDiagram({ statuses, host }: { statuses: PocStatus[]; host: string | null }) {
  const running = new Set(statuses.filter((s) => s.running).map((s) => s.key));
  const edges = POCS.flatMap((p) => p.requires.map((r) => ({ from: r, to: p.key, optional: r === 'camera-body' })));
  return (
    <svg className="hub-flow" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="PoC 선행관계: 얼굴·환경 촬영과 전신 비율이 퍼스널컬러 리포트로, 리포트와 연예인 검색, 추구미 추출이 추구미 가이드로 이어진다">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--cb-text-2)" />
        </marker>
      </defs>
      {edges.map((e) => (
        <path
          key={`${e.from}-${e.to}`}
          d={edgePath(e.from, e.to)}
          fill="none"
          stroke="var(--cb-text-2)"
          strokeWidth={1.4}
          strokeDasharray={e.optional ? '4 4' : undefined}
          markerEnd="url(#arrow)"
        />
      ))}
      {POCS.map((p) => {
        const { x, y } = POS[p.key];
        const on = running.has(p.key);
        const info = pocByKey(p.key);
        const node = (
          <g>
            <rect x={x + 0.5} y={y + 0.5} width={NODE_W - 1} height={NODE_H - 1} rx={12} fill={p.key === 'celeb-vibe-report' || p.key === 'personal-color-report' ? 'var(--cb-iris-soft)' : 'var(--cb-card)'} stroke={on ? 'var(--cb-iris-deep)' : 'var(--cb-line)'} strokeWidth={on ? 1.5 : 1} />
            <circle cx={x + 18} cy={y + NODE_H / 2} r={10} fill="var(--cb-ink)" />
            <text x={x + 18} y={y + NODE_H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--cb-ivory)">
              {info.no}
            </text>
            <text x={x + 36} y={y + 21} fontSize={13} fontWeight={700} fill="var(--cb-ink)">
              {info.title}
            </text>
            <circle cx={x + 40} cy={y + 33} r={3} fill={on ? 'var(--cb-ok)' : 'var(--cb-line)'} />
            <text x={x + 47} y={y + 37} fontSize={11} fill="var(--cb-text-2)">
              :{info.port} {on ? '실행 중' : '중지'}
            </text>
          </g>
        );
        return on ? (
          <a key={p.key} href={pocUrl(p, host)} aria-label={`${info.title} 열기`}>
            {node}
          </a>
        ) : (
          <g key={p.key}>{node}</g>
        );
      })}
    </svg>
  );
}
