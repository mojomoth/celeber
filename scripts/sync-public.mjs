// 각 PoC 앱의 public/ 에 BI 에셋과 MediaPipe(wasm+모델)를 동기화한다.
//   node scripts/sync-public.mjs <앱 폴더 경로>   (predev/prebuild에서 '.'로 호출)
//   node scripts/sync-public.mjs --all
// 원본: assets/bi/*  →  public/bi/*
//       pocs/ui/static/mediapipe/{wasm,models}/*  →  public/mediapipe/{wasm,models}/*
// 크기가 같은 파일은 건너뛴다(빠름). 가능하면 하드링크, 실패 시 복사.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIAPIPE_APPS = new Set(['camera-face', 'camera-body', 'celeb-vibe', 'personal-color-report', 'celeb-vibe-report', 'web']);
const ALL_APPS = ['hub', 'camera-face', 'camera-body', 'search-celeb', 'celeb-vibe', 'personal-color-report', 'celeb-vibe-report', 'ui/mockup'].map((name) => `pocs/${name}`);
ALL_APPS.push('apps/web');

function syncFile(src, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) return 0;
  fs.rmSync(dst, { force: true });
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
  return 1;
}

function syncDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[sync-public] 원본 없음: ${path.relative(root, src)} (node scripts/fetch-mediapipe-models.mjs 실행 필요)`);
    return 0;
  }
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      n += syncDir(s, d);
      continue;
    }
    if (ent.name === 'README.md' || ent.name === 'colors.json') continue;
    n += syncFile(s, d);
  }
  return n;
}

function syncApp(appDir) {
  const abs = path.resolve(appDir);
  const name = path.basename(abs);
  const pub = path.join(abs, 'public');
  let n = syncDir(path.join(root, 'assets/bi'), path.join(pub, 'bi'));
  if (MEDIAPIPE_APPS.has(name)) n += syncDir(path.join(root, 'pocs/ui/static/mediapipe'), path.join(pub, 'mediapipe'));
  if (name === 'web') {
    n += syncDir(path.join(root, 'assets/mockup'), path.join(pub, 'frame'));
    const photos = path.join(pub, 'photos');
    fs.mkdirSync(photos, { recursive: true });
    for (const photo of ['g-pose.jpg', 'u-front.jpg', 'u-side.jpg', 'u-full.jpg', 'u-selfie.jpg']) {
      n += syncFile(path.join(root, 'pocs/ui/mockup/public/photos', photo), path.join(photos, photo));
    }
  }
  if (n > 0) console.log(`[sync-public] ${name}: ${n}개 파일 갱신`);
}

const arg = process.argv[2] ?? '.';
if (arg === '--all') for (const a of ALL_APPS) syncApp(path.join(root, a));
else syncApp(arg);
