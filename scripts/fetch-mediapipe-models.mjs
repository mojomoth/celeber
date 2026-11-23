// MediaPipe wasm + 모델(.task/.tflite)을 pocs/ui/static/mediapipe 로 준비한다 (오프라인 동작용 원본).
// 사용: node scripts/fetch-mediapipe-models.mjs   (이미 있으면 건너뜀)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'pocs/ui/static/mediapipe');
const MODELS = {
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  'pose_landmarker_heavy.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  'selfie_multiclass_256x256.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};

fs.mkdirSync(path.join(dest, 'models'), { recursive: true });
fs.mkdirSync(path.join(dest, 'wasm'), { recursive: true });

// wasm: 설치된 @mediapipe/tasks-vision 패키지에서 복사 (버전 일치 보장)
const wasmSrc = path.join(root, 'pocs/ui/node_modules/@mediapipe/tasks-vision/wasm');
for (const f of fs.readdirSync(wasmSrc)) fs.copyFileSync(path.join(wasmSrc, f), path.join(dest, 'wasm', f));
console.log('wasm copied');

for (const [name, url] of Object.entries(MODELS)) {
  const out = path.join(dest, 'models', name);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) {
    console.log('skip', name);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('downloaded', name, fs.statSync(out).size);
}
