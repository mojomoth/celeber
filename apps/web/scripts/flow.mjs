// 격리된 데이터로 실행한 통합 앱을 브라우저에서 확인한다.
// node apps/web/scripts/flow.mjs [--base URL] [--only mobile|desktop] [--out 경로] [--name 이름]
// 이미지 픽스처는 Gate 1의 생성 사진만 사용한다. 데스크톱 카메라 입력은 같은 픽스처를 스트리밍한다.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, openChrome, sleep } from '../../../pocs/ui/mockup/scripts/cdp.mjs';

const { values } = parseArgs({ options: { base: { type: 'string', default: 'http://localhost:3108' }, only: { type: 'string' }, out: { type: 'string' }, name: { type: 'string', default: '아이유' } } });
const base = new URL(values.base).origin;
const viewports = { mobile: [390, 844, 2, true], desktop: [1440, 900, 1, false] };
const fixtures = path.join(ROOT, 'pocs/ui/mockup/public/photos');
const sharp = createRequire(path.join(ROOT, 'pocs/core/package.json'))('sharp');

const findVisible = (selector, label) => [...document.querySelectorAll(selector)].find((element) => {
  const text = element.textContent.replace(/\s+/g, ' ').trim();
  return (!label || text.includes(label) || element.getAttribute('aria-label') === label) && element.getClientRects().length && !element.disabled && !element.closest('[inert]');
});

async function polling(browser, expression, label, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await browser.evaluate(expression);
    if (value) return value;
    await sleep(100);
  }
  const current = await browser.evaluate("location.pathname + ' · ' + document.body.innerText.slice(-500)");
  throw new Error(`${label}: ${current}`);
}

function controls(browser) {
  const element = (label, selector = 'a,button') => `(${findVisible})(${JSON.stringify(selector)}, ${JSON.stringify(label)})`;
  const exists = (label, selector, timeout) => polling(browser, `!!${element(label, selector)}`, `${label}: 화면 표시`, timeout);
  const text = (label, timeout) => polling(browser, `document.body.innerText.includes(${JSON.stringify(label)})`, `${label}: 본문 표시`, timeout);
  const route = (pathname, timeout) => polling(browser, `location.pathname === ${JSON.stringify(pathname)}`, `${pathname}: 화면 이동`, timeout);
  const fill = async (selector, value) => {
    await exists('', selector);
    await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await browser.send('Input.insertText', { text: value });
  };
  const click = async (label, selector, timeout) => {
    const expression = `(() => {
      const el = ${element(label, selector)};
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const {left, top, width, height} = el.getBoundingClientRect();
      const at = {x: left + width / 2, y: top + height / 2};
      return el.contains(document.elementFromPoint(at.x, at.y)) ? at : null;
    })()`;
    const at = await polling(browser, expression, `${label}: 누를 요소`, timeout);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await browser.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 });
    }
  };
  const upload = async (file, selector = 'input[type="file"]') => {
    await polling(browser, `!!document.querySelector(${JSON.stringify(selector)})`, `${file}: 파일 입력란`);
    const { root } = await browser.send('DOM.getDocument');
    const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert(nodeId, `${file}: 파일 입력란`);
    await browser.send('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  return { click, exists, fill, route, text, upload };
}

// 실제 비디오·캔버스·MediaPipe 경로를 타되 브라우저에 들어오는 장면만 고정한다.
function installCameraFixture() {
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(10);
    const track = stream.getVideoTracks()[0];
    const draw = () => {
      const image = window.celeberQaFrame;
      if (!image?.naturalWidth) return;
      context.fillStyle = '#bcbcbc';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    const timer = setInterval(() => track.readyState === 'ended' ? clearInterval(timer) : draw(), 100);
    draw();
    return stream;
  } });
}

async function cameraFrame(browser, file) {
  const data = await readFile(file, 'base64');
  await browser.evaluate(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/jpeg;base64,${data}`)};
    await image.decode();
    window.celeberQaFrame = image;
  })()`);
  await polling(browser, "[...document.querySelectorAll('video')].some(video => video.readyState >= 2 && video.videoWidth)", `${file}: 카메라 미리보기`);
  await sleep(230);
}

async function picture(browser, viewport, name) {
  await browser.settle();
  const expectedFrame = viewport === 'desktop';
  const frameVisible = await browser.evaluate("!!document.querySelector('.device__bezel')?.getClientRects().length");
  assert.equal(frameVisible, expectedFrame, `${name}: 기기 프레임 표시`);
  assert(await browser.evaluate(`(() => {
    const scroll = document.getElementById('app-scroll');
    const area = scroll && getComputedStyle(scroll).overflowY !== 'visible' ? scroll : document.scrollingElement;
    return area.scrollWidth <= area.clientWidth + 1;
  })()`), `${name}: 가로 넘침`);
  if (values.out) await browser.save(path.join(values.out, viewport, `${name}.png`));
  console.log(`PASS [${viewport}] ${name}`);
}

async function run(viewport, environment) {
  const consoleErrors = [];
  const browser = await openChrome({ onConsole: (line) => { if (!line.startsWith('[console] warning:')) consoleErrors.push(line); } });
  const ui = controls(browser);
  const desktop = viewport === 'desktop';
  try {
    await browser.metrics(...viewports[viewport]);
    if (desktop) await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installCameraFixture})()` });
    await browser.go(`${base}/`);
    await ui.route('/');
    assert.equal(await browser.evaluate("!!document.querySelector('input[name=code]')"), false, '접속 코드 화면이 나타남');
    const starting = await browser.evaluate("fetch('/api/guide/my-data').then(async response => response.ok ? response.json() : null)");
    assert(starting?.photos === 0 && starting?.counts?.every(({ count }) => count === 0), '사진과 기록이 없는 독립 데이터 디렉터리에서 확인해 주세요.');
    await picture(browser, viewport, '01-랜딩');
    await ui.click('시작하기');
    await ui.route('/capture');
    const captureSteps = [
      [environment, '02-환경'],
      [path.join(fixtures, 'u-front.jpg'), '03-정면'],
      [path.join(fixtures, 'u-side.jpg'), '04-측면'],
      [path.join(fixtures, 'u-full.jpg'), '05-전신'],
    ];
    for (const [index, [fixture, label]] of captureSteps.entries()) {
      await ui.text(`${index + 1}/4`, 45_000);
      if (desktop) {
        await cameraFrame(browser, fixture);
        await ui.click('촬영', 'button[aria-label="촬영"]');
      } else {
        await ui.upload(fixture, 'input[aria-label="사진 올리기"]');
      }
      await ui.exists('다시 찍기', 'button', 60_000);
      await picture(browser, viewport, label);
      await ui.click('사용', 'button', 45_000);
    }
    await ui.route('/analysis', 90_000);
    await ui.text('피부 톤');
    for (const pose of ['정면', '측면', '전신']) {
      await polling(browser, `document.querySelector('img[alt="${pose} 사진"]')?.naturalWidth`, `${pose} 분석 사진`);
    }
    await picture(browser, viewport, '06-내-분석');

    await ui.click('퍼스널컬러 보기');
    await ui.route('/personal-color', 90_000);
    await ui.text('얼굴 주변 컬러 비교', 90_000);
    await picture(browser, viewport, '07-퍼스널컬러');
    await ui.click('추구미 찾기');
    await ui.route('/muse');
    await ui.click('사진 올리기', 'button[role="tab"]');
    await ui.fill('#cvr-upload-name', values.name);
    await ui.upload(environment);
    await ui.text('이 사진은 분석하기 어렵습니다', 75_000);
    await picture(browser, viewport, '08-추구미-사진-업로드');
    await ui.click('다른 사진 고르기');
    await ui.text(`${values.name}의 대표·최근·평소 사진에서 다시 골라 주세요.`);
    const personSource = `a[aria-label=${JSON.stringify(`${values.name} 사진 출처`)}]`;
    await ui.exists('', personSource, 90_000);
    await ui.click(values.name, 'section button', 90_000);
    await ui.click('평소', 'button[role="tab"]', 90_000);
    const pictureGroup = '[role="group"][aria-label="평소 사진"]';
    await ui.exists('', `${pictureGroup} a[href^="https://"]`, 180_000);
    await ui.click('', `${pictureGroup} button[aria-pressed="false"]`, 180_000);
    await picture(browser, viewport, '09-추구미-검색-재선택');
    await ui.click('이 사진으로 분석');
    await ui.click('추구미 분석하기', 'button', 75_000);
    await ui.click('가이드 만들기', 'button', 180_000);
    await ui.text(`${values.name} 추구미 가이드`, 180_000);
    const savedGuideId = await browser.evaluate("new URLSearchParams(location.search).get('guide')");
    assert(savedGuideId, '가이드 고유 링크가 없음');
    await ui.click('가이드 저장', 'button', 90_000);
    await ui.exists('저장했어요');
    await browser.evaluate("document.getElementById('app-scroll')?.scrollTo(0, 0); window.scrollTo(0, 0)");
    await picture(browser, viewport, '10-추구미-가이드');

    const libraryLink = 'nav[aria-label="주 메뉴"] a[href="/library"]';
    await ui.click('내 기록', libraryLink);
    await ui.route('/library');
    await ui.exists(values.name, 'a[href*="/muse"]');
    await ui.click('가이드 보기', 'a[href*="/muse"]');
    await ui.route('/muse');
    assert.equal(await browser.evaluate("new URLSearchParams(location.search).get('guide')"), savedGuideId, '같은 가이드가 다시 열리지 않음');
    await ui.text(`${values.name} 추구미 가이드`);
    await ui.exists('저장했어요', 'a', 45_000);
    await ui.click('내 기록', libraryLink);
    await ui.route('/library');
    await ui.click('', 'section a[href*="/personal-color"]');
    await ui.route('/personal-color');
    await ui.text('얼굴 주변 컬러 비교');
    await ui.click('내 기록', libraryLink);
    await ui.route('/library');
    await picture(browser, viewport, '11-내-기록');

    await ui.click('내 정보 초기화');
    await ui.exists('취소', '[role="dialog"] button');
    await ui.click('취소', '[role="dialog"] button');
    await ui.exists(values.name, 'a[href*="/muse"]');
    await ui.click('내 정보 초기화');
    await ui.click('모두 삭제', '[role="dialog"] button');
    await ui.text('삭제했어요');
    await ui.text('아직 저장한 가이드가 없어요.');
    await ui.text('아직 퍼스널컬러 리포트가 없어요.');
    const remaining = await browser.evaluate("fetch('/api/guide/my-data').then(response => response.json())");
    assert(remaining.photos === 0 && remaining.counts.every(({ count }) => count === 0), '초기화 뒤 서버에 내 사진 또는 기록이 남음');
    await picture(browser, viewport, '12-초기화');
    assert.deepEqual(consoleErrors, [], `${viewport}: 브라우저 콘솔 오류`);
  } catch (error) {
    if (values.out) await browser.save(path.join(values.out, viewport, 'failure.png')).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'celeber-flow-'));
try {
  const environment = path.join(temp, 'environment.jpg');
  const scene = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024"><defs><linearGradient id="daylight" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cecdca"/><stop offset="1" stop-color="#93908a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#daylight)"/><rect x="450" y="80" width="250" height="320" fill="#eeeae4"/></svg>');
  await sharp(scene).jpeg().toFile(environment);
  const selectedViewports = values.only ? [values.only] : Object.keys(viewports);
  for (const viewport of selectedViewports) {
    assert(Object.hasOwn(viewports, viewport), '--only은 mobile 또는 desktop입니다.');
    await run(viewport, environment);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
