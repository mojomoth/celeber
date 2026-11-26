// node apps/web/scripts/anonymous.mjs --base https://example.com [--browser]
// 지정한 공개 앱에서 새 세션 두 개만 만들고 생성 사진으로 격리를 확인한다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openChrome, ROOT } from '../../../pocs/ui/mockup/scripts/cdp.mjs';

const { values } = parseArgs({ options: { base: { type: 'string' }, browser: { type: 'boolean' } } });
assert(values.base, '검사할 앱 주소를 --base로 지정해 주세요.');
const url = new URL(values.base);
assert(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, '자격 증명과 하위 경로가 없는 웹 주소를 사용해 주세요.');
const base = url.origin;
const photo = await readFile(path.join(ROOT, 'pocs/ui/mockup/public/photos/u-selfie.jpg'));
const previewPath = '/api/guide/my-data';
const resetPath = `${previewPath}?confirm=1`;
const protectedPath = '/api/face/sessions/';

function request(endpoint, { method = 'GET', cookie, headers = {}, body } = {}) {
  assert(endpoint.startsWith('/') && !endpoint.startsWith('//'), '같은 출처의 경로만 검사합니다.');
  return fetch(base + endpoint, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
}

async function expectStatus(response, statuses, label) {
  if (statuses.includes(response.status)) return response;
  await response.body?.cancel();
  assert.fail(`${label}: 예상 HTTP ${statuses.join('/')}, 실제 ${response.status}`);
}

async function blocked(response, label) {
  await expectStatus(response, [401, 403, 404, 428], label);
  await response.body?.cancel();
}

function markupHasCodeForm(markup) {
  return /<input\b[^>]*(?:name=["']code["']|type=["']password["'])/i.test(markup);
}

async function openSession(endpoint) {
  const landing = await expectStatus(await request(endpoint), [200], `공개 화면 ${endpoint}`);
  assert(!markupHasCodeForm(await landing.text()), `${endpoint}: 접속 코드 입력란이 있습니다.`);
  const session = landing.headers.getSetCookie().find((header) => /;\s*HttpOnly(?:;|$)/i.test(header));
  assert(session, `${endpoint}: HttpOnly 세션 쿠키가 발급되지 않았습니다.`);
  assert(/;\s*SameSite=(?:Lax|Strict)(?:;|$)/i.test(session), '세션 쿠키 SameSite 설정이 없습니다.');
  if (url.protocol === 'https:') assert(/;\s*Secure(?:;|$)/i.test(session), 'HTTPS 세션 쿠키에 Secure 설정이 없습니다.');
  const cookie = session.split(';')[0];
  return {
    cookie,
    get: (endpoint) => request(endpoint, { cookie }),
    mutate: (endpoint, options) => request(endpoint, { ...options, cookie, headers: { Origin: base, ...options.headers } }),
  };
}

async function assertCounts(client, photos, faces, label) {
  const response = await expectStatus(await client.get(previewPath), [200], `${label} 미리보기`);
  const result = await response.json();
  assert.equal(result.photos, photos, `${label}: 사진 수`);
  assert.equal(result.counts.find(({ key }) => key === 'face')?.count, faces, `${label}: 얼굴 기록 수`);
  assert(result.counts.filter(({ key }) => key !== 'face').every(({ count }) => count === 0), `${label}: 검사 외 데이터가 있습니다.`);
}

function uploadBody() {
  const form = new FormData();
  form.set('kind', 'environment');
  form.set('file', new Blob([photo], { type: 'image/jpeg' }), 'anonymous-qa.jpg');
  return form;
}

async function upload(client, label) {
  const response = await expectStatus(await client.mutate('/api/uploads', { method: 'POST', body: uploadBody() }), [200, 201], `${label} 업로드`);
  const upload = await response.json();
  assert(/^up_[a-z0-9]+$/.test(upload.id) && upload.url === `/api/uploads/${upload.id}`, `${label}: 업로드 응답 형식`);
  const session = await expectStatus(await client.mutate('/api/face/environment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId: upload.id, skipAi: true }),
  }), [200], `${label} 환경 분석`);
  const { sessionId } = await session.json();
  assert(/^face_[a-z0-9]+$/.test(sessionId), `${label}: 얼굴 세션 응답 형식`);
  return { ...upload, sessionId };
}

async function ownPhoto(client, upload, label) {
  const response = await expectStatus(await client.get(upload.url), [200], `${label} 사진 조회`);
  assert.match(response.headers.get('content-type') ?? '', /^image\//i);
  assert.match(response.headers.get('cache-control') ?? '', /\bno-store\b/i);
  return createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex');
}

async function reset(client, label) {
  const response = await expectStatus(await client.mutate(resetPath, { method: 'DELETE' }), [200], `${label} 초기화`);
  await response.json();
}

async function checkBrowser() {
  const browser = await openChrome();
  try {
    await browser.metrics(390, 844, 2, true);
    await browser.go(base);
    const result = await browser.evaluate(`(async () => ({
      pathname: location.pathname,
      secure: window.isSecureContext,
      hasCodeForm: !!document.querySelector('input[name="code"], input[type="password"]'),
      preview: (await fetch(${JSON.stringify(previewPath)})).status,
    }))()`);
    assert.equal(result.pathname, '/', '새 Chrome 프로필에서 랜딩 이동');
    assert(result.secure && !result.hasCodeForm, '브라우저 보안 컨텍스트 및 자동 세션');
    assert.equal(result.preview, 200, 'Chrome 첫 실행 바로 뒤 자격 증명 없는 기록 API');
    console.log('PASS 새 모바일 Chrome 프로필에서 코드 없이 랜딩과 내 데이터 접근');
  } finally {
    await browser.close();
  }
}

const a = await openSession('/');
const b = await openSession('/capture');
assert(a.cookie !== b.cookie, '두 새 클라이언트에 동일한 세션이 발급됐습니다.');
const oldAccess = await expectStatus(await request('/access'), [301, 302, 303, 307, 308], '기존 접속 화면 주소');
assert.equal(new URL(oldAccess.headers.get('location'), base).href, `${base}/`, '기존 접속 주소가 랜딩으로 돌아갑니다.');
await oldAccess.body?.cancel();
const asset = await expectStatus(await request('/photos/landing-editorial.webp'), [200], '세션 없는 랜딩 사진');
assert.match(asset.headers.get('content-type') ?? '', /^image\/webp/i);
await asset.body?.cancel();
console.log('PASS 공개 화면, 기존 주소 이동, 세션 없는 정적 사진');

await Promise.all([assertCounts(a, 0, 0, '새 세션 A'), assertCounts(b, 0, 0, '새 세션 B')]);
const [uploadA, uploadB] = await Promise.all([upload(a, '세션 A'), upload(b, '세션 B')]);
assert(uploadA.id !== uploadB.id && uploadA.sessionId !== uploadB.sessionId, '두 세션의 저장 식별자가 같습니다.');
const [digestA, digestB] = await Promise.all([ownPhoto(a, uploadA, '세션 A'), ownPhoto(b, uploadB, '세션 B')]);
assert.equal(digestA, digestB, '동일한 생성 사진의 저장 바이트가 서로 다릅니다.');

for (const [client, own, other] of [[a, uploadA, uploadB], [b, uploadB, uploadA]]) {
  const current = await expectStatus(await client.get(`${protectedPath}${own.sessionId}`), [200], '자기 얼굴 기록');
  assert.equal((await current.json()).id, own.sessionId);
  await blocked(await client.get(other.url), '다른 브라우저 업로드 URL');
  await blocked(await client.get(`/muse${other.url}`), '다른 브라우저 추구미 업로드 URL');
  await blocked(await client.get(`${protectedPath}${other.sessionId}`), '다른 브라우저 얼굴 기록');
  await blocked(await client.get(`/api/public-image/${other.id}`), '서명 없는 과거 사진 공유 경로');
}
console.log('PASS 동일한 사진을 올려도 업로드, 추구미, 얼굴 데이터가 세션별로 분리됨');

// 복원 또는 실패 시에도 다른 브라우저 기록에 닿는 초기화는 실행하지 않는다.
try {
  await blocked(await request(uploadA.url), '세션 없는 사진 접근');
  const [key, value] = a.cookie.split('=');
  const signature = value.lastIndexOf('.') + 1;
  assert(signature > 0 && signature < value.length, '세션 쿠키에 서명이 없습니다.');
  const tampered = `${key}=${value.slice(0, signature)}${value[signature] === 'a' ? 'b' : 'a'}${value.slice(signature + 1)}`;
  await blocked(await request(uploadA.url, { cookie: tampered }), '변조된 쿠키의 사진 접근');
  const expired = value.replace(/\.\d+\./, '.1000000000.');
  await blocked(await request(uploadA.url, { cookie: `${key}=${expired}` }), '만료 시간이 지난 쿠키의 사진 접근');
  await blocked(await request(uploadA.url, { cookie: 'celeber_web_session=0.removed' }), '예전 접속 코드 쿠키의 사진 접근');
  const crossSite = await expectStatus(await a.mutate('/api/uploads', {
    method: 'POST', headers: { Origin: 'https://cross-site.invalid' }, body: uploadBody(),
  }), [403], '다른 출처에서 상태 변경 요청');
  await crossSite.body?.cancel();

  const navigation = await expectStatus(await a.get('/personal-color'), [200], '같은 세션의 다른 화면');
  await navigation.body?.cancel();
  assert.equal(await ownPhoto(a, uploadA, '새 페이지 이동 후 세션 A'), digestA);
  await assertCounts(a, 1, 1, '초기화 전 A');
  await assertCounts(b, 1, 1, '초기화 전 B');
  await reset(a, '세션 A');
  await assertCounts(a, 0, 0, '초기화 후 A');
  await blocked(await a.get(uploadA.url), '초기화 후 자신의 사진 접근');
  await blocked(await a.get(`${protectedPath}${uploadA.sessionId}`), '초기화 후 자신의 얼굴 기록 접근');
  await assertCounts(b, 1, 1, 'A 초기화 후 B');
  assert.equal(await ownPhoto(b, uploadB, 'A 초기화 후 B'), digestB);
  console.log('PASS 쿠키 위조와 출처가 다른 쓰기 요청 차단, 초기화 격리');
} finally {
  // 서로의 사진과 기록을 읽지 못하는 경우에만 새로 만든 검증 데이터의 나머지를 정리한다.
  await Promise.all([reset(a, '검증 데이터 A'), reset(b, '검증 데이터 B')]);
}

await Promise.all([assertCounts(a, 0, 0, '검사 종료 A'), assertCounts(b, 0, 0, '검사 종료 B')]);
if (values.browser) await checkBrowser();
