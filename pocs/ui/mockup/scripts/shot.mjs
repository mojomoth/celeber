#!/usr/bin/env node
// UI 목업 스크린샷: Chrome 헤드리스(scripts/cdp.mjs)로 화면마다 세 장을 찍는다. 흐름 전체는 flow.mjs.
//   <id>-mobile.png   390×844 뷰포트, DPR 2 → 780×1688   (?chrome=sim: 9:41 상태 표시줄·홈 인디케이터, 안전 영역 54/34)
//   <id>-full.png     390×(문서 높이), DPR 2 → 780×(2×H)  시안 PNG(docs/ui/drafts/v4/NN-*.png)와 같은 방식. 하단 내비는 맨 아래
//   <id>-desktop.png  1440×900, DPR 1                    목업 프레임 안 표시
//
// 사용: node pocs/ui/mockup/scripts/shot.mjs [화면...] [--base URL] [--out 폴더] [--only mobile,full,desktop]
//   화면: all(기본) | 01 | 02-self-capture | /capture | landing ...  (번호·이름·경로 모두 됨)
//   기본 base http://localhost:3107, 기본 out docs/dev-v1/logs/gate1-ui/shots (png는 .gitignore로 로컬 전용)
//   CHROME 환경변수로 브라우저 경로를 바꿀 수 있다. 콘솔 오류·예외는 터미널에 [console] 로 찍힌다.
import path from 'node:path';
import { ROOT, openChrome } from './cdp.mjs';

const SCREENS = [
  { id: '01-landing', path: '/' },
  { id: '02-self-capture', path: '/capture' },
  { id: '03-self-analysis', path: '/analysis' },
  { id: '04-personal-color', path: '/personal-color' },
  { id: '05-style-muse', path: '/muse' },
  { id: '06-my-library', path: '/library' },
];

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const base = opt('base', 'http://localhost:3107').replace(/\/$/, '');
const outDir = path.resolve(opt('out', path.join(ROOT, 'docs/dev-v1/logs/gate1-ui/shots')));
const only = new Set(opt('only', 'mobile,full,desktop').split(','));
for (const o of only) {
  if (!['mobile', 'full', 'desktop'].includes(o)) {
    console.error(`--only 값이 잘못됐다: ${o} (mobile, full, desktop 중에서)`);
    process.exit(2);
  }
}
const wanted = args.length === 0 || args.includes('all') ? SCREENS : args.map(pick);

function pick(q) {
  const s = SCREENS.find((x) => x.path === q || x.id === q || x.id.startsWith(`${q}-`) || x.id.slice(3) === q);
  if (s) return s;
  if (q.startsWith('/')) return { id: q.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root', path: q };
  console.error(`알 수 없는 화면: ${q} (예: all, 03, 03-self-analysis, /analysis)`);
  process.exit(2);
}

const { evaluate: evalNum, settle, metrics, go, save, close } = await openChrome();

const withSim = (p) => `${base}${p}${p.includes('?') ? '&' : '?'}chrome=sim`;
try {
  for (const s of wanted) {
    const done = [];
    if (only.has('mobile') || only.has('full')) {
      await metrics(390, 844, 2, true);
      await go(withSim(s.path));
      if (only.has('mobile')) done.push(await save(path.join(outDir, `${s.id}-mobile.png`)));
      if (only.has('full')) {
        const h = await evalNum('Math.ceil(document.documentElement.scrollHeight)');
        await metrics(390, Math.max(844, h), 2, true);
        await settle();
        const h2 = await evalNum('Math.ceil(document.documentElement.scrollHeight)');
        if (h2 !== h) {
          await metrics(390, Math.max(844, h2), 2, true);
          await settle();
        }
        done.push(await save(path.join(outDir, `${s.id}-full.png`)));
      }
    }
    if (only.has('desktop')) {
      await metrics(1440, 900, 1, false);
      await go(`${base}${s.path}`);
      done.push(await save(path.join(outDir, `${s.id}-desktop.png`)));
    }
    console.log(`${s.id}  ${done.map((f) => path.relative(ROOT, f)).join('  ')}`);
  }
} finally {
  await close();
}
