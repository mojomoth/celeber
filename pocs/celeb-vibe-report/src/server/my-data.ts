/**
 * '내 정보 전체 초기화' (CONTEXT 기타: 분석된 내 정보 초기화).
 * 내 얼굴·전신 세션, 퍼스널컬러 리포트, 추구미 가이드와 그 사진 파일을 지운다.
 * 연예인 검색·사진 분석(celebs, celeb_images, vibe_analyses)은 내 정보가 아니므로 남긴다.
 * 업로드 파일은 sha256+종류로 레코드 간에 공유되므로, 남는 레코드가 참조하지 않는 것만 지운다(참조 확인).
 */
import 'server-only';
import { bodySessions, celebImages, celebs, faceSessions, getDb, personalColorReports, vibeAnalyses, vibeGuides } from '@celeber/core/server/db';
import { deleteUpload } from '@celeber/core/server/uploads';

/** 내 촬영 사진 종류 (어느 레코드도 참조하지 않아도 내 사진으로 보고 지운다: 중단된 촬영 등) */
const PERSONAL_KINDS = new Set(['face-front', 'face-side', 'environment', 'body', 'drape']);
const UP_ID = /\bup_[a-z0-9]+\b/g;

type Repo = { list: (o: { limit: number; offset: number; order?: 'created_at ASC' }) => { id: string; data: unknown }[] };

function allRows(repo: Repo): { id: string; data: unknown }[] {
  const out: { id: string; data: unknown }[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = repo.list({ limit: 500, offset, order: 'created_at ASC' });
    out.push(...page);
    if (page.length < 500) return out;
  }
}

function uploadIdsOf(rows: { data: unknown }[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) for (const m of JSON.stringify(r.data).match(UP_ID) ?? []) ids.add(m);
  return ids;
}

const MINE = [
  { key: 'face', label: '얼굴 분석', repo: faceSessions as unknown as Repo },
  { key: 'body', label: '전신 분석', repo: bodySessions as unknown as Repo },
  { key: 'report', label: '퍼스널컬러 리포트', repo: personalColorReports as unknown as Repo },
  { key: 'guide', label: '추구미 가이드', repo: vibeGuides as unknown as Repo },
] as const;
const KEEP: Repo[] = [celebs as unknown as Repo, celebImages as unknown as Repo, vibeAnalyses as unknown as Repo];

export interface MyDataPreview {
  counts: { key: string; label: string; count: number }[];
  photos: number;
  /** 확인 단계에 보여 줄 항목 */
  items: string[];
  kept: string;
}

function plan() {
  const mine = MINE.map((m) => ({ ...m, rows: allRows(m.repo) }));
  const keepIds = uploadIdsOf(KEEP.flatMap(allRows));
  const mineIds = uploadIdsOf(mine.flatMap((m) => m.rows));
  const uploads = getDb().prepare('SELECT id, kind FROM uploads').all() as { id: string; kind: string }[];
  const photoIds = uploads.filter((u) => (mineIds.has(u.id) || PERSONAL_KINDS.has(u.kind)) && !keepIds.has(u.id)).map((u) => u.id);
  return { mine, photoIds };
}

export function myDataPreview(): MyDataPreview {
  const { mine, photoIds } = plan();
  const counts = mine.map((m) => ({ key: m.key, label: m.label, count: m.rows.length }));
  return {
    counts,
    photos: photoIds.length,
    items: [...counts.filter((c) => c.count).map((c) => `${c.label} ${c.count}개`), ...(photoIds.length ? [`촬영·업로드한 내 사진 파일 ${photoIds.length}장`] : [])],
    kept: '연예인 검색 기록과 연예인 사진 분석은 남습니다.',
  };
}

export function resetMyData(): { deleted: Record<string, number>; photos: number } {
  const { photoIds } = plan();
  const deleted: Record<string, number> = {};
  for (const m of MINE) deleted[m.key] = (m.repo as unknown as { deleteAll: () => number }).deleteAll();
  let photos = 0;
  for (const id of photoIds) if (deleteUpload(id)) photos++;
  return { deleted, photos };
}
