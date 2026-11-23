// 로컬 데이터 초기화: 공유 SQLite DB(pocs/.data/celeber.db)와 업로드 파일(pocs/.data/uploads)을 지운다.
//   node scripts/reset-data.mjs          지워질 항목만 보여 준다 (아무것도 지우지 않음)
//   node scripts/reset-data.mjs --yes    실제로 삭제 (실행 중인 앱이 있으면 거부)
// 앱별 초기화는 각 앱 화면의 '초기화'(확인 단계 포함)나 DELETE API(?confirm=1)를 쓴다. 이 스크립트는 전부를 지운다.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.CELEBER_DATA_DIR ? path.resolve(process.env.CELEBER_DATA_DIR) : path.join(root, 'pocs', '.data');
const dbFile = path.join(dataDir, 'celeber.db');
const uploads = path.join(dataDir, 'uploads');
const yes = process.argv.includes('--yes');

console.log(`데이터 폴더: ${dataDir}`);
if (!fs.existsSync(dataDir)) {
  console.log('지울 데이터가 없습니다.');
  process.exit(0);
}
if (fs.existsSync(dbFile)) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of tables) console.log(`  ${name.padEnd(24)} ${db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n}행`);
  db.close();
}
const files = fs.existsSync(uploads) ? fs.readdirSync(uploads).length : 0;
console.log(`  uploads/                 ${files}개 파일`);

if (!yes) {
  console.log('\n아무것도 지우지 않았습니다. 삭제하려면: node scripts/reset-data.mjs --yes (모든 앱을 끈 뒤)');
  process.exit(0);
}

const running = [];
for (const port of [3100, 3101, 3102, 3103, 3104, 3105, 3106]) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    running.push(port);
  } catch {
    /* 꺼져 있음 */
  }
}
if (running.length) {
  console.error(`실행 중인 앱이 있어 중단합니다 (포트 ${running.join(', ')}). 앱이 DB 연결을 쥐고 있으면 WAL 파일이 다시 생깁니다.`);
  process.exit(1);
}
for (const f of ['celeber.db', 'celeber.db-wal', 'celeber.db-shm']) fs.rmSync(path.join(dataDir, f), { force: true });
fs.rmSync(uploads, { recursive: true, force: true });
console.log('삭제했습니다. 다음 실행 때 빈 DB가 자동으로 만들어집니다.');
