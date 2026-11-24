#!/usr/bin/env node
// UI 목업 전체 흐름 검증: 실제 마우스·키 입력으로 화면을 넘기며 단계마다 상태를 확인하고 스크린샷을 남긴다.
//   랜딩 → 시작하기 → 촬영 4단계 → 내 분석 → 퍼스널컬러 → 추구미(검색 · 분석 불가 · 다시 고르기) → 내 기록(초기화 대화상자) → 하단 내비 왕복
// 두 화면에서 돈다: mobile 390×844 DPR 2 (?chrome=sim), desktop 1440×900 (목업 프레임 안)
// 누를 때마다 요소 가운데 점에 다른 요소가 덮여 있지 않은지(elementFromPoint), 가로 넘침이 없는지, 콘솔 오류가 없는지 본다.
//
// 사용: node pocs/ui/mockup/scripts/flow.mjs [--base URL] [--out 폴더] [--only mobile,desktop]
//   기본 out docs/dev-v1/logs/gate1-ui/flow (<viewport>/NN-이름.png). 실패가 하나라도 있으면 종료 코드 1.
import path from 'node:path';
import { ROOT, openChrome, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const base = opt('base', 'http://localhost:3107').replace(/\/$/, '');
const outDir = path.resolve(opt('out', path.join(ROOT, 'docs/dev-v1/logs/gate1-ui/flow')));
const viewports = opt('only', 'mobile,desktop').split(',');
const UPLOAD = path.join(ROOT, 'pocs/ui/mockup/public/photos/lib-yuna.jpg');

const consoleLines = [];
const b = await openChrome({ onConsole: (l) => consoleLines.push(l) });
const results = [];
let vp = '';
let shotNo = 0;

const check = (name, ok, detail = '') => {
  results.push({ vp, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${vp}] ${name}${detail ? `  (${detail})` : ''}`);
};

// spec: { sel?: CSS 선택자(기본 a,button,label,input), text?: 포함 글자, label?: aria-label }
const FIND = `(spec) => [...document.querySelectorAll(spec.sel || 'a,button,label,input')].find((e) => {
  if (spec.label && e.getAttribute('aria-label') !== spec.label) return false;
  if (spec.text && !(e.textContent || '').replace(/\\s+/g, ' ').includes(spec.text)) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
})`;
const q = (spec, body) => b.evaluate(`(() => { const el = (${FIND})(${JSON.stringify(spec)}); ${body} })()`);
const describe = (spec) => spec.label ?? spec.text ?? spec.sel;

async function click(spec) {
  const at = await q(
    spec,
    `if (!el) return null;
     el.scrollIntoView({ block: 'center', behavior: 'instant' });
     const r = el.getBoundingClientRect();
     const x = r.left + r.width / 2, y = r.top + r.height / 2;
     const top = document.elementFromPoint(x, y);
     return { x, y, hit: !!top && (top === el || el.contains(top)), top: top ? top.tagName + '.' + top.className : '' };`,
  );
  if (!at) {
    check(`누를 요소 찾기: ${describe(spec)}`, false, '없음');
    return false;
  }
  if (!at.hit) check(`가려지지 않음: ${describe(spec)}`, false, `위에 ${at.top}`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  return true;
}

async function key(k, code, vk) {
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
}

async function waitFor(expr, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await b.evaluate(expr)) return true;
    await sleep(100);
  }
  return false;
}

const waitPath = async (p) => {
  const ok = await waitFor(`location.pathname === ${JSON.stringify(p)}`);
  check(`이동 → ${p}`, ok, ok ? '' : `지금 ${await b.evaluate('location.pathname + location.search')}`);
  await b.settle();
  return ok;
};

// 모바일은 문서, 데스크톱은 프레임 안 #app-scroll이 스크롤된다
const SCROLLER = `(document.getElementById('app-scroll') && getComputedStyle(document.getElementById('app-scroll')).overflowY !== 'visible' ? document.getElementById('app-scroll') : document.scrollingElement)`;

async function shot(name) {
  const noOverflow = await b.evaluate(`(() => { const s = ${SCROLLER}; return s.scrollWidth <= s.clientWidth + 1; })()`);
  if (!noOverflow) check(`가로 넘침 없음: ${name}`, false);
  const file = path.join(outDir, vp, `${String(++shotNo).padStart(2, '0')}-${name}.png`);
  await b.save(file);
  return file;
}

const activeTab = () => b.evaluate(`document.querySelector('nav[aria-label="주 메뉴"] a[aria-current="page"]')?.textContent.trim() ?? ''`);
const text = (sel) => b.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`);
const dialogOpen = () => b.evaluate(`!!document.querySelector('[role="dialog"]')`);
const scrollDown = () => b.evaluate(`(() => { const s = ${SCROLLER}; s.scrollTop = 900; return s.scrollTop; })()`);
const scrollTop = () => b.evaluate(`${SCROLLER}.scrollTop`);
const stepCount = () => text('header span[aria-label$="단계"]');

async function run() {
  shotNo = 0;
  const url = (p) => `${base}${p}${vp === 'mobile' ? `${p.includes('?') ? '&' : '?'}chrome=sim` : ''}`;
  if (vp === 'mobile') await b.metrics(390, 844, 2, true);
  else await b.metrics(1440, 900, 1, false);

  // 01 랜딩 → 시작하기
  await b.go(url('/'));
  if (vp === 'desktop') check('목업 프레임 표시', await b.evaluate(`getComputedStyle(document.querySelector('.device__bezel')).display !== 'none'`));
  else check('모바일: 프레임 없음', await b.evaluate(`!document.querySelector('.device__bezel') || getComputedStyle(document.querySelector('.device__bezel')).display === 'none'`));
  await shot('landing');
  await click({ text: '시작하기' });
  await waitPath('/capture');
  check('촬영 시작 단계 2/4', (await stepCount()) === '2/4', await stepCount());
  await shot('capture-2-front');

  // 02 촬영 4단계: 환경(1/4)부터 셔터로 넘기고 전신(4/4)은 건너뛴다
  await b.go(url('/capture?step=1'));
  check('1/4 환경', (await stepCount()) === '1/4', await stepCount());
  await shot('capture-1-environment');
  for (const [n, name] of [
    ['2/4', 'front'],
    ['3/4', 'side'],
    ['4/4', 'body'],
  ]) {
    await click({ label: '촬영' });
    const ok = await waitFor(`document.querySelector('header span[aria-label$="단계"]')?.textContent.trim() === '${n}'`);
    check(`셔터 → ${n}`, ok, ok ? '' : await stepCount());
    await b.settle();
    if (n !== '2/4') await shot(`capture-${n[0]}-${name}`);
  }
  check('4/4 건너뛰기·올리기 표시', await b.evaluate(`!!document.querySelector('input[type=file][aria-label="사진 올리기"]')`));
  await click({ text: '건너뛰기' });

  // 03 내 분석
  await waitPath('/analysis');
  check('내비 활성: 내 분석', (await activeTab()) === '내 분석');
  await shot('analysis');
  await click({ text: '퍼스널컬러 보기' });

  // 04 퍼스널컬러: 의상색 선택
  await waitPath('/personal-color');
  check('내비 활성: 퍼스널컬러', (await activeTab()) === '퍼스널컬러');
  await shot('personal-color');
  const second = await b.evaluate(`document.querySelectorAll('button[aria-pressed]')[1]?.textContent.trim()`);
  await click({ sel: 'button[aria-pressed]', text: second });
  check(`의상색 선택: ${second}`, await b.evaluate(`document.querySelectorAll('button[aria-pressed]')[1]?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('button[aria-pressed="true"]').length === 1`));
  await shot('personal-color-palette');
  await click({ text: '추구미 찾기' });

  // 05 추구미: 검색 시트 → 사진 올리기(분석 불가) → 다른 사진 고르기
  await waitPath('/muse');
  check('내비 활성: 추구미', (await activeTab()) === '추구미');
  await shot('muse');
  await click({ label: '연예인 검색' });
  check('검색 시트 열림', await waitFor(`!!document.querySelector('[role="dialog"]')`, 3000));
  check('검색 입력란에 초점', await b.evaluate(`document.activeElement?.getAttribute('aria-label') === '연예인 이름'`));
  await b.send('Input.insertText', { text: '한서도' });
  check('검색 결과: 한서도', await waitFor(`[...document.querySelectorAll('[role="dialog"] button')].some(e => e.textContent.includes('한서도') && !e.textContent.includes('사진으로 찾기'))`, 3000));
  await shot('muse-search');
  await b.evaluate(`document.activeElement.select()`);
  await b.send('Input.insertText', { text: '없는사람' });
  check('검색 결과 없음 안내', await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('검색 결과가 없어요')`, 3000));
  await shot('muse-search-empty');
  await key('Escape', 'Escape', 27);
  check('Esc로 검색 시트 닫힘', await waitFor(`!document.querySelector('[role="dialog"]')`, 3000));

  const { root } = await b.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await b.send('DOM.setFileInputFiles', { nodeId, files: [UPLOAD] });
  check('올린 사진: 분석 불가 안내에 표시', await waitFor(`!!document.querySelector('[role="status"] img[src^="blob:"]')`, 3000), await text('[role="status"] p'));
  await sleep(700); // 시트로 부드럽게 스크롤
  await shot('muse-unanalyzable');
  await click({ sel: 'button[aria-pressed]', text: '최근 룩' });
  check('다른 사진 고르기: 최근 룩', await waitFor(`[...document.querySelectorAll('p')].some(p => p.textContent.includes('최근 룩으로 분석했어요'))`, 3000));
  await shot('muse-reselect');
  await click({ text: '다른 룩 보기' });
  check('다른 룩 보기: 다음 룩 선택', await waitFor(`[...document.querySelectorAll('button[aria-pressed="true"]')].some(e => !e.textContent.includes('최근 룩') && e.textContent.includes('룩'))`, 3000));
  await click({ text: '가이드 저장' });
  check('가이드 저장 → 저장했어요', await waitFor(`[...document.querySelectorAll('button')].some(e => e.textContent.trim() === '저장했어요')`, 3000));

  // 06 내 기록: 초기화 대화상자 (Esc 취소 → 다시 열어 지우기)
  await scrollDown();
  await click({ sel: 'nav[aria-label="주 메뉴"] a', text: '내 기록' });
  await waitPath('/library');
  check('경로 바뀌면 맨 위부터', (await scrollTop()) === 0, `scrollTop ${await scrollTop()}`);
  check('내비 활성: 내 기록', (await activeTab()) === '내 기록');
  await shot('library');
  await click({ text: '분석 정보 초기화' });
  check('초기화 대화상자 열림', await waitFor(`!!document.querySelector('[role="dialog"]')`, 3000));
  check('대화상자 초점: 취소', await b.evaluate(`document.activeElement?.textContent.trim() === '취소'`));
  check('대화상자 뒤 하단 내비 inert', await b.evaluate(`!!document.querySelector('nav[aria-label="주 메뉴"]').closest('[inert]')`));
  await key('Tab', 'Tab', 9);
  check('Tab이 대화상자 안에서 돈다', await b.evaluate(`!!document.activeElement?.closest('[role="dialog"]')`), await b.evaluate(`document.activeElement?.textContent.trim()`));
  await shot('library-reset-dialog');
  await key('Escape', 'Escape', 27);
  check('Esc로 대화상자 닫힘', !(await dialogOpen()) || (await waitFor(`!document.querySelector('[role="dialog"]')`, 3000)));
  check('닫으면 초점이 연 버튼으로', await b.evaluate(`document.activeElement?.textContent.includes('분석 정보 초기화') && !document.querySelector('[inert]')`));
  await click({ text: '분석 정보 초기화' });
  await waitFor(`!!document.querySelector('[role="dialog"]')`, 3000);
  await click({ sel: '[role="dialog"] button', text: '지우기' });
  await waitPath('/');
  await shot('reset-landing');

  // 06 내 기록의 링크들
  await b.go(url('/library'));
  await click({ text: '가이드 보기' });
  await waitPath('/muse');
  await click({ sel: 'nav[aria-label="주 메뉴"] a', text: '내 기록' });
  await waitPath('/library');
  await click({ sel: 'section a[href="/personal-color"]' });
  await waitPath('/personal-color');
  await click({ sel: 'nav[aria-label="주 메뉴"] a', text: '내 기록' });
  await waitPath('/library');
  await click({ text: '내 분석 결과 다시 보기' });
  await waitPath('/analysis');

  // 하단 내비 왕복: 내려 둔 채 누르고, 활성 탭과 스크롤 초기화를 본다
  for (const [tab, p] of [
    ['퍼스널컬러', '/personal-color'],
    ['추구미', '/muse'],
    ['내 기록', '/library'],
    ['내 분석', '/analysis'],
  ]) {
    await scrollDown();
    await click({ sel: 'nav[aria-label="주 메뉴"] a', text: tab });
    await waitPath(p);
    check(`내비 ${tab}: 활성·맨 위`, (await activeTab()) === tab && (await scrollTop()) === 0, `active ${await activeTab()}, scrollTop ${await scrollTop()}`);
  }
  await shot('nav-roundtrip-analysis');
}

try {
  for (vp of viewports) {
    consoleLines.length = 0;
    await run();
    check('콘솔 오류·경고 없음', consoleLines.length === 0, consoleLines.join(' | ').slice(0, 400));
  }
} finally {
  await b.close();
}
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} PASS · 스크린샷 ${path.relative(ROOT, outDir)}/{${viewports.join(',')}}/`);
process.exit(fails.length ? 1 : 0);
