// 통합 스모크 테스트: 허브와 6개 PoC가 떠 있는 상태에서 실행한다 (pnpm dev:all 또는 pnpm start:all).
//   node scripts/smoke.mjs            홈·주요 API 200 확인 + 공유 DB E2E 흐름(만든 기록은 끝나면 삭제)
//   node scripts/smoke.mjs --keep     E2E에서 만든 기록을 남긴다 (화면에서 이어서 확인할 때)
//   node scripts/smoke.mjs --no-e2e   홈·API 확인만
//   SMOKE_HOST=192.168.0.10 node scripts/smoke.mjs
//
// E2E 흐름 (카메라 없이, 합성 사진 업로드로):
//   camera-face(3101) 환경·정면 분석 저장 → camera-body(3102) 데모 전신 세션
//   → personal-color-report(3105) 입력 목록에서 두 세션 조회 → 리포트 생성
//   → search-celeb(3103) 이름 검색·확정·사진 수집 → celeb-vibe(3104) 사진 분석
//   → celeb-vibe-report(3106) 내 리포트 목록에서 리포트 선택 → 가이드 생성
// 정면 사진은 camera-face 테스트 픽스처의 실제 FaceLandmarker 랜드마크 위에 피부·눈·입술·머리를 칠한 합성 이미지다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const KEEP = args.has('--keep');
const E2E = !args.has('--no-e2e');
const HOST = process.env.SMOKE_HOST || 'localhost';

// 레지스트리는 허브 소스를 그대로 쓴다 (Node 26 타입 제거로 .ts import)
const { POCS, HUB_PORT } = await import(path.join(root, 'pocs/hub/src/pocs.ts'));
const sharp = createRequire(path.join(root, 'pocs/core/package.json'))('sharp');

const base = (port) => `http://${HOST}:${port}`;
let failures = 0;
const results = [];
function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
}

async function req(port, p, init = {}) {
  const t0 = Date.now();
  const res = await fetch(base(port) + p, { ...init, signal: AbortSignal.timeout(init.timeout ?? 60000) });
  const ms = Date.now() - t0;
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body, ms };
}
const json = (data) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

async function expect200(port, p, init, check) {
  try {
    const r = await req(port, p, init);
    let ok = r.status === 200;
    let note = `${r.status} ${r.ms}ms`;
    if (ok && check) {
      const c = check(r.body);
      if (c !== true) {
        ok = false;
        note += ` · ${c}`;
      }
    }
    if (!ok && typeof r.body === 'object') note += ` · ${JSON.stringify(r.body).slice(0, 200)}`;
    record(ok, `:${port} ${init?.method ?? 'GET'} ${p}`, note);
    return ok ? r.body : null;
  } catch (e) {
    record(false, `:${port} ${init?.method ?? 'GET'} ${p}`, e.message);
    return null;
  }
}

async function upload(port, buf, kind, name) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'image/jpeg' }), name);
  fd.append('kind', kind);
  return expect200(port, '/api/uploads', { method: 'POST', body: fd }, (b) => (/^up_/.test(b.id) ? true : 'id 없음'));
}

// ------------------------------------------------------------------ 합성 이미지
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LEFT_BROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
const RIGHT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];

async function syntheticFace() {
  const fx = JSON.parse(fs.readFileSync(path.join(root, 'pocs/camera-face/test/fixtures/landmarks.json'), 'utf8'))['front-card'];
  const { width: W, height: H, landmarks: L } = fx;
  const pts = (idx) => idx.map((i) => `${(L[i].x * W).toFixed(1)},${(L[i].y * H).toFixed(1)}`).join(' ');
  const top = L[10];
  const chin = L[152];
  const faceH = (chin.y - top.y) * H;
  const faceW = (L[454].x - L[234].x) * W;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#8F8F8F"/>
  <ellipse cx="${top.x * W}" cy="${top.y * H + faceH * 0.12}" rx="${faceW * 0.66}" ry="${faceH * 0.5}" fill="#2B211D"/>
  <polygon points="${pts(FACE_OVAL)}" fill="#E2B8A0"/>
  <polygon points="${pts(LEFT_BROW)}" fill="#3A2C26"/><polygon points="${pts(RIGHT_BROW)}" fill="#3A2C26"/>
  <polygon points="${pts(LEFT_EYE)}" fill="#F2EEEA"/><polygon points="${pts(RIGHT_EYE)}" fill="#F2EEEA"/>
  <circle cx="${L[468]?.x * W}" cy="${L[468]?.y * H}" r="${faceW * 0.028}" fill="#3B2A22"/>
  <circle cx="${L[473]?.x * W}" cy="${L[473]?.y * H}" r="${faceW * 0.028}" fill="#3B2A22"/>
  <polygon points="${pts(LIPS)}" fill="#B9706E"/>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
  return { buf, landmarks: L };
}

async function syntheticEnvironment() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9C8C4"/><stop offset="1" stop-color="#8B8A86"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="420" y="40" width="160" height="220" fill="#EDEDE8"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

async function syntheticOutfit() {
  // 600×900 전신 실루엣: 라이트 베이지 상의 + 차콜 하의, 흰 배경
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="#F4F3F0"/>
  <ellipse cx="300" cy="120" rx="52" ry="64" fill="#E0B49A"/><path d="M248 90 Q300 30 352 90 L352 110 Q300 80 248 110Z" fill="#231C19"/>
  <rect x="285" y="180" width="30" height="28" fill="#E0B49A"/>
  <path d="M200 210 Q300 190 400 210 L420 470 L180 470 Z" fill="#D8CFC0"/>
  <path d="M190 470 L410 470 L395 820 L315 820 L300 560 L285 820 L205 820 Z" fill="#3E3B3D"/>
  <rect x="200" y="820" width="90" height="34" rx="10" fill="#1E1C1C"/><rect x="310" y="820" width="90" height="34" rx="10" fill="#1E1C1C"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

// ------------------------------------------------------------------ 1. 홈·주요 API
console.log(`== 홈·주요 API (${HOST})`);
await expect200(HUB_PORT, '/', undefined, (b) => (String(b).includes('PoC 허브') ? true : '허브 본문 없음'));
await expect200(HUB_PORT, '/api/health', undefined, (b) => (b.db?.ok ? true : 'db 오류'));
for (const p of POCS) {
  for (const pg of p.pages) await expect200(p.port, pg.path);
  for (const probe of p.probes) await expect200(p.port, probe);
}
const shared = await expect200(HUB_PORT, '/api/status', undefined, (b) => {
  if (!b.allRunning) return `꺼진 앱: ${b.pocs.filter((x) => !x.running).map((x) => x.key).join(', ')}`;
  const paths = new Set(b.pocs.map((x) => x.dbPath));
  return paths.size === 1 && paths.has(b.db.path) ? true : `DB 경로 불일치: ${[...paths].join(' | ')}`;
});
if (shared) console.log(`     공유 DB: ${shared.db.path}`);

// ------------------------------------------------------------------ 2. 공유 DB E2E
const created = { face: null, body: null, report: null, celeb: null, vibe: null, guide: null };
if (E2E) {
  console.log('== E2E: camera-face → personal-color-report → celeb-vibe-report (공유 DB)');
  const env = await upload(3101, await syntheticEnvironment(), 'environment', 'env.jpg');
  const envRes = env && (await expect200(3101, '/api/face/environment', json({ uploadId: env.id, fromUpload: true }), (b) => (b.sessionId ? true : 'sessionId 없음')));
  const face = await syntheticFace();
  const front = await upload(3101, face.buf, 'face-front', 'front.jpg');
  const quality = { faceDetected: true, faceSizeRatio: 0.5, faceBrightness: 170, detectionScore: 0.95, passed: true, issues: [] };
  const analyzed =
    front &&
    (await expect200(
      3101,
      '/api/face/analyze',
      json({ sessionId: envRes?.sessionId, label: '통합 스모크', front: { uploadId: front.id, landmarks: face.landmarks, yawDeg: 0, pitchDeg: 0, rollDeg: 0, quality, fromUpload: true } }),
      (b) => (b.session?.status === 'complete' ? true : `status ${b.session?.status}`),
    ));
  created.face = analyzed?.sessionId ?? null;
  if (analyzed) console.log(`     얼굴 세션 ${created.face} · 피부 ${analyzed.analysis.skin.corrected.hex} (${analyzed.analysis.skin.corrected.nameKo}) · aiSource ${analyzed.aiSource}`);

  const body = await expect200(3102, '/api/body/demo', { method: 'POST' }, (b) => ((b.session?.id ?? b.id) ? true : 'id 없음'));
  created.body = body?.session?.id ?? body?.id ?? null;

  // personal-color-report가 같은 DB에서 두 세션을 본다
  await expect200(3105, '/api/report/inputs', undefined, (b) =>
    !b.face.some((f) => f.id === created.face) ? 'face 세션 없음' : created.body && !b.body.some((x) => x.id === created.body) ? 'body 세션 없음' : true,
  );
  const gen =
    created.face &&
    (await expect200(3105, '/api/report/generate', json({ faceSessionId: created.face, bodySessionId: created.body, gender: 'male' }), (b) => {
      const r = b.report;
      const need = ['header', 'photos', 'firstImpression', 'type', 'warmCool', 'features', 'draping', 'tops', 'outer', 'accessories', 'hair', 'grooming', 'avoidStyles', 'todayActions', 'cautions', 'confidence', 'disclaimer'];
      const missing = need.filter((k) => r?.[k] == null);
      if (missing.length) return `섹션 없음: ${missing.join(',')}`;
      if (r.warmCool.warmPercent + r.warmCool.coolPercent !== 100) return '웜+쿨 ≠ 100';
      if (r.draping.best.length !== 4 || r.draping.worst.length !== 4) return '드레이핑 4/4 아님';
      if (!r.header.title.includes('남성')) return '남성 변형 아님';
      return true;
    }));
  created.report = gen?.report?.id ?? null;
  if (gen) console.log(`     리포트 ${created.report} · ${gen.report.type.nameKo} / ${gen.report.type.nameEn} · 웜 ${gen.report.warmCool.warmPercent}% · 신뢰도 ${gen.report.confidence.score} ${gen.report.confidence.gradeLabel} · isMock ${gen.report.isMock}`);
  if (created.report) await expect200(3105, `/api/report/reports/${created.report}`);

  // celeb-vibe-report가 같은 리포트를 선택 목록에서 본다
  await expect200(3106, '/api/guide/reports', undefined, (b) => {
    const items = Array.isArray(b) ? b : (b.items ?? b.reports ?? []);
    return items.some((x) => x.id === created.report) ? true : '리포트가 목록에 없음';
  });

  // 연예인: 이름 검색 → 확정 → 대표 사진 수집
  const search = await expect200(3103, `/api/celeb/search?q=${encodeURIComponent('윤하람')}`, undefined, (b) => ((b.candidates ?? b.items ?? []).length ? true : '후보 없음'));
  const cand = (search?.candidates ?? search?.items ?? [])[0];
  // 이미 저장된 인물이면(다른 앱·사용자가 만든 기록) 정리 단계에서 지우지 않는다
  const before = await req(3103, '/api/celeb/celebs?limit=100').catch(() => null);
  const existingIds = new Set((before?.body?.items ?? []).map((c) => c.celeb?.id ?? c.id));
  const celeb = cand && (await expect200(3103, '/api/celeb/celebs', json({ candidate: cand }), (b) => (b.celeb?.id ? true : 'celeb 없음')));
  const celebId = celeb?.celeb?.id ?? null;
  created.celeb = celebId && !existingIds.has(celebId) ? celebId : null;
  const imgs = celebId && (await expect200(3103, `/api/celeb/celebs/${celebId}/images`, json({ category: 'signature' })));
  if (imgs) console.log(`     인물 ${celeb.celeb.name} · 대표 사진 ${(imgs.images ?? []).length}장 수집 (${imgs.provider})`);

  // 추구미 분석: 사진을 올려 분석 (브라우저 측정 없이 서버 통계 경로, force)
  const outfit = await upload(3104, await syntheticOutfit(), 'vibe', 'look.jpg');
  const vibe = outfit && (await expect200(3104, '/api/vibe/analyze', json({ uploadId: outfit.id, celebName: celeb?.celeb?.name, celebId: celebId ?? undefined, force: true }), (b) => (b.analysis?.id ? true : 'analysis 없음')));
  created.vibe = vibe?.analysis?.id ?? null;
  if (vibe) console.log(`     추구미 분석 ${created.vibe} · 룩 '${vibe.analysis.lookName}' · isMock ${vibe.analysis.isMock}`);

  const guide =
    created.report &&
    created.vibe &&
    (await expect200(3106, '/api/guide/generate', json({ reportId: created.report, vibeAnalysisId: created.vibe, saved: false }), (b) => (b.guide?.reportId === created.report ? true : 'reportId 불일치')));
  created.guide = guide?.guide?.id ?? null;
  if (guide) console.log(`     가이드 ${created.guide} · 갭 ${guide.guide.gaps.length}축 · 행동 ${guide.guide.actions.length}개 · isMock ${guide.guide.isMock}`);
  if (created.guide) await expect200(3106, `/api/guide/guides/${created.guide}`);
  if (created.guide) await expect200(3106, `/guides/${created.guide}`);
  if (created.report) await expect200(3105, `/reports/${created.report}`);

  // ---------------------------------------------------------------- 정리
  if (!KEEP) {
    const del = async (port, p) => {
      try {
        const r = await req(port, p, { method: 'DELETE' });
        record(r.status === 200, `:${port} DELETE ${p}`, String(r.status));
      } catch (e) {
        record(false, `:${port} DELETE ${p}`, e.message);
      }
    };
    if (created.guide) await del(3106, `/api/guide/guides/${created.guide}`);
    if (created.vibe) await del(3104, `/api/vibe/analyses/${created.vibe}`);
    if (created.report) await del(3105, `/api/report/reports/${created.report}`);
    if (created.celeb) await del(3103, `/api/celeb/celebs/${created.celeb}`);
    if (created.body) await del(3102, `/api/body/sessions/${created.body}`);
    if (created.face) await del(3101, `/api/face/sessions/${created.face}`);
    console.log('     만든 기록을 삭제했습니다 (업로드 파일은 sha256 공유 때문에 남김). 남기려면 --keep');
  } else {
    console.log(`     --keep: 기록을 남겼습니다 ${JSON.stringify(created)}`);
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n== 결과: ${passed}/${results.length} 통과${failures ? `, 실패 ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
