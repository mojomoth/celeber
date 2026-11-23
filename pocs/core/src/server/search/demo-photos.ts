/**
 * 키 없는 데모 모드용 래스터 전신 사진 (서버 전용).
 *
 * Mock 검색의 SVG 실루엣은 MediaPipe가 사람으로 인식하지 못해 celeb-vibe에서 항상 '분석 불가'가 된다.
 * 그래서 카테고리마다 1장씩 실제 래스터 전신 사진(리포지토리 docs/ui/refs 시안 화면에서 잘라 낸 모델 사진,
 * pocs/core/fixtures/demo-people)을 섞어 '분석 불가 → 같은 인물의 다른 사진 → 분석 성공' 흐름을 키 없이 시연할 수 있게 한다.
 * 실존 연예인 사진이 아니며, 검색한 이름과 무관한 데모 모델 사진이다(제목에 '데모 사진'으로 표시).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CelebImageCategory } from '../../contracts';
import { getEnv } from '../env';

export interface DemoPhoto {
  file: string;
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

const FILES: Record<CelebImageCategory, { file: string; title: string; width: number; height: number }> = {
  signature: { file: 'look-a.jpg', title: '화보 (데모 사진)', width: 700, height: 1940 },
  recent: { file: 'look-b.jpg', title: '최근 행사 (데모 사진)', width: 470, height: 1590 },
  daily: { file: 'look-b-2.jpg', title: '일상 (데모 사진)', width: 470, height: 1590 },
};

let dirCache: string | null | undefined;

/** fixtures 폴더 찾기: <dataDir>/../core/fixtures → <cwd>/../core/fixtures → <cwd>/fixtures (core 테스트) */
export function demoPhotoDir(): string | null {
  if (dirCache !== undefined) return dirCache;
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ getEnv().dataDir, '..', 'core', 'fixtures', 'demo-people'),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '..', 'core', 'fixtures', 'demo-people'),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), 'fixtures', 'demo-people'),
  ];
  // 런타임 경로 탐색이라 Next 파일 추적(Turbopack)에서 제외한다(프로젝트 전체 추적 경고 방지).
  dirCache = candidates.find((d) => fs.existsSync(path.join(/* turbopackIgnore: true */ d, FILES.signature.file))) ?? null;
  return dirCache;
}

const cache = new Map<string, string>();

/** 카테고리별 데모 래스터 사진. 파일이 없으면 null (SVG 실루엣만 사용) */
export function demoPhoto(category: CelebImageCategory): DemoPhoto | null {
  const dir = demoPhotoDir();
  if (!dir) return null;
  const f = FILES[category];
  const full = path.join(/* turbopackIgnore: true */ dir, f.file);
  let dataUrl = cache.get(full);
  if (!dataUrl) {
    try {
      dataUrl = `data:image/jpeg;base64,${fs.readFileSync(/* turbopackIgnore: true */ full).toString('base64')}`;
    } catch {
      return null;
    }
    cache.set(full, dataUrl);
  }
  return { file: f.file, title: f.title, dataUrl, width: f.width, height: f.height };
}
