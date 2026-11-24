// Chrome 헤드리스를 CDP로 직접 모는 최소 도구 (의존성 없음, Node 22+ 내장 WebSocket). shot.mjs · flow.mjs가 함께 쓴다.
// 띄운 Chrome 하나만 끄고, 프로필 폴더는 Chrome이 완전히 끝난 뒤 지운다. CHROME 환경변수로 브라우저 경로를 바꾼다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openChrome({ onConsole = (line) => console.log(line) } = {}) {
  const bin = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-shot-'));
  const chrome = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = new Promise((r) => chrome.on('exit', r));
  process.on('exit', () => chrome.kill());

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome이 DevTools 주소를 알려 주지 않았다')), 15000);
    chrome.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
    chrome.on('exit', (c) => reject(new Error(`Chrome 종료 (${c})`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) [...listeners].forEach((fn) => fn(msg));
  };
  // 연결이 끊기면 기다리던 요청을 모두 실패시켜 호출부의 finally까지 가게 한다
  ws.onclose = () => {
    for (const { reject } of pending.values()) reject(new Error('CDP 연결이 끊겼다'));
    pending.clear();
  };
  const rawSend = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method}: 60초 안에 응답 없음`));
      }, 60000);
      pending.set(id, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await rawSend('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await rawSend('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => rawSend(method, params, sid);
  await send('Page.enable');
  await send('Runtime.enable');
  listeners.push((m) => {
    if (m.sessionId !== sid) return;
    if (m.method === 'Runtime.exceptionThrown') onConsole(`[console] 예외: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      onConsole(`[console] ${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
  });

  const once = (method, ms = 20000) =>
    new Promise((resolve) => {
      const done = (v) => {
        clearTimeout(t);
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
        resolve(v);
      };
      const t = setTimeout(done, ms);
      const fn = (m) => {
        if (m.method === method && m.sessionId === sid) done(m.params);
      };
      listeners.push(fn);
    });

  /** 페이지에서 식을 계산해 값으로 돌려준다 (Promise면 기다린다) */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate 실패: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };

  /** 폰트·이미지 로딩과 두 프레임을 기다린다. 깨진 빌드 등으로 끝내 안 오면 8초 뒤 그냥 넘어간다 */
  const settle = async () => {
    await evaluate(
      `Promise.race([(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })(), new Promise(r => setTimeout(() => { console.warn('settle: 8초 안에 이미지·폰트 로딩이 끝나지 않음'); r(); }, 8000))])`,
    );
    await sleep(250);
  };

  const metrics = (width, height, deviceScaleFactor, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile, screenWidth: width, screenHeight: height });

  const go = async (url) => {
    const loaded = once('Page.loadEventFired');
    const r = await send('Page.navigate', { url });
    if (r.errorText) throw new Error(`${url} 열기 실패: ${r.errorText} (서버가 떠 있는지 확인)`);
    await loaded;
    await settle();
  };

  const save = async (file) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };

  const close = async () => {
    ws.close();
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };

  return { send, once, evaluate, settle, metrics, go, save, close };
}
