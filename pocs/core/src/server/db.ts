/**
 * SQLite (Node 내장 node:sqlite, DatabaseSync). PoC는 공용 DB를, 웹은 브라우저별 DB를 사용한다.
 * - WAL 모드 + busy_timeout으로 여러 앱 프로세스 동시 접근 허용
 * - 스키마는 PRAGMA user_version 기반 마이그레이션으로 모든 PoC 테이블을 미리 생성
 * - 패턴: 각 테이블 = 조회/정렬용 스칼라 컬럼 + data(JSON, 계약 스키마 전체)
 * 서버 코드(route handler / server action / server component)에서만 import할 것.
 */
import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { z } from 'zod';
import {
  BodySessionSchema,
  CelebImageSchema,
  CelebProfileSchema,
  FaceSessionSchema,
  PersonalColorReportSchema,
  VibeAnalysisSchema,
  VibeGuideSchema,
} from '../contracts';
import { getBrowserDataScope } from './data-scope';
import { getEnv } from './env';

export { withBrowserDataScope } from './data-scope';

/* ================================================================== 스키마 */

/** 테이블별 스칼라 컬럼 (id/created_at/updated_at/data 제외). update/where에 허용되는 컬럼 화이트리스트. */
export const TABLE_COLUMNS = {
  face_sessions: ['status', 'is_mock', 'front_upload_id', 'label'],
  body_sessions: ['status', 'is_mock', 'upload_id', 'label'],
  celebs: ['name', 'name_key', 'saved', 'is_mock', 'thumbnail_upload_id'],
  celeb_images: ['celeb_id', 'category', 'provider', 'source_url', 'upload_id', 'is_full_body', 'analyzable', 'selected', 'is_mock'],
  vibe_analyses: ['celeb_id', 'celeb_name', 'image_upload_id', 'analyzable', 'look_name', 'is_mock'],
  personal_color_reports: ['face_session_id', 'body_session_id', 'tone', 'season', 'is_mock'],
  vibe_guides: ['report_id', 'vibe_analysis_id', 'celeb_id', 'celeb_name', 'look_name', 'thumbnail_upload_id', 'saved', 'is_mock'],
} as const;
export type JsonTable = keyof typeof TABLE_COLUMNS;

/** 테이블별 id 접두사 */
export const ID_PREFIX: Record<JsonTable, string> = {
  face_sessions: 'face',
  body_sessions: 'body',
  celebs: 'celeb',
  celeb_images: 'cimg',
  vibe_analyses: 'vibe',
  personal_color_reports: 'pcr',
  vibe_guides: 'guide',
};
const ORDERS = new Set(['created_at DESC', 'created_at ASC', 'updated_at DESC']);
export type TableColumn<T extends JsonTable> = (typeof TABLE_COLUMNS)[T][number];

const MIGRATIONS: string[] = [
  /* v1: 전체 PoC 테이블 */ `
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    sha256 TEXT NOT NULL,
    source_url TEXT,
    file_name TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_sha ON uploads(sha256);
  CREATE INDEX IF NOT EXISTS idx_uploads_source ON uploads(source_url);

  CREATE TABLE IF NOT EXISTS face_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,              -- in-progress | complete | failed
    is_mock INTEGER NOT NULL DEFAULT 0,
    front_upload_id TEXT,              -- 목록 썸네일
    label TEXT,
    data TEXT NOT NULL                 -- FaceSession JSON
  );
  CREATE INDEX IF NOT EXISTS idx_face_created ON face_sessions(created_at DESC);

  CREATE TABLE IF NOT EXISTS body_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,              -- complete | skipped | failed
    is_mock INTEGER NOT NULL DEFAULT 0,
    upload_id TEXT,
    label TEXT,
    data TEXT NOT NULL                 -- BodySession JSON
  );
  CREATE INDEX IF NOT EXISTS idx_body_created ON body_sessions(created_at DESC);

  CREATE TABLE IF NOT EXISTS celebs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,            -- 정규화된 이름 (normalizeNameKey)
    saved INTEGER NOT NULL DEFAULT 0,
    is_mock INTEGER NOT NULL DEFAULT 0,
    thumbnail_upload_id TEXT,
    data TEXT NOT NULL                 -- CelebProfile JSON
  );
  CREATE INDEX IF NOT EXISTS idx_celebs_key ON celebs(name_key);

  CREATE TABLE IF NOT EXISTS celeb_images (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    celeb_id TEXT NOT NULL REFERENCES celebs(id) ON DELETE CASCADE,
    category TEXT NOT NULL,            -- signature | recent | daily
    provider TEXT NOT NULL,            -- naver | serpapi | mock
    source_url TEXT NOT NULL,
    upload_id TEXT,                    -- 캐시된 사본
    is_full_body INTEGER,              -- NULL = 미판정
    analyzable INTEGER,                -- NULL = 미판정
    selected INTEGER NOT NULL DEFAULT 0,
    is_mock INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,                -- CelebImage JSON
    UNIQUE(celeb_id, source_url)
  );
  CREATE INDEX IF NOT EXISTS idx_celeb_images_celeb ON celeb_images(celeb_id, category);

  CREATE TABLE IF NOT EXISTS vibe_analyses (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    celeb_id TEXT,
    celeb_name TEXT,
    image_upload_id TEXT,
    analyzable INTEGER NOT NULL DEFAULT 1,
    look_name TEXT,
    is_mock INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL                 -- VibeAnalysis JSON
  );
  CREATE INDEX IF NOT EXISTS idx_vibe_created ON vibe_analyses(created_at DESC);

  CREATE TABLE IF NOT EXISTS personal_color_reports (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    face_session_id TEXT NOT NULL,
    body_session_id TEXT,
    tone TEXT NOT NULL,
    season TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL                 -- PersonalColorReport JSON
  );
  CREATE INDEX IF NOT EXISTS idx_pcr_created ON personal_color_reports(created_at DESC);

  CREATE TABLE IF NOT EXISTS vibe_guides (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    report_id TEXT NOT NULL,
    vibe_analysis_id TEXT NOT NULL,
    celeb_id TEXT,
    celeb_name TEXT NOT NULL,
    look_name TEXT,
    thumbnail_upload_id TEXT,
    saved INTEGER NOT NULL DEFAULT 1,
    is_mock INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL                 -- VibeGuide JSON
  );
  CREATE INDEX IF NOT EXISTS idx_guides_created ON vibe_guides(created_at DESC);

  CREATE TABLE IF NOT EXISTS search_cache (
    key TEXT PRIMARY KEY,              -- provider:query 해시 등
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

/* ================================================================== 연결 */

const G = globalThis as unknown as { __celeberDb?: { db: DatabaseSync; path: string } };

export function dataDir(): string {
  const dir = getBrowserDataScope()?.directory ?? getEnv().dataDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function dbPath(): string {
  return path.join(dataDir(), 'celeber.db');
}

/** 웹 요청 내에서는 같은 연결을 재사용하고, PoC는 기존 싱글턴을 사용한다. */
export function getDb(): DatabaseSync {
  const scope = getBrowserDataScope();
  if (scope?.db) return scope.db;
  const p = dbPath();
  if (!scope && G.__celeberDb?.path === p) return G.__celeberDb.db;
  const db = new DatabaseSync(p);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  if (scope) scope.db = db;
  else G.__celeberDb = { db, path: p };
  return db;
}

function migrate(db: DatabaseSync) {
  const cur = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let v = cur; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** 트랜잭션 헬퍼 */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn(db);
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* ================================================================== 유틸 */

export const nowIso = (): string => new Date().toISOString();
/** 정렬 가능한 id: <prefix>_<시간 base36><랜덤> */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}
/** 이름 조회 키: 공백/구두점 제거, 소문자 */
export function normalizeNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[\s·.\-_()[\]]/g, '');
}

export type SqlValue = string | number | null | boolean | bigint;
const toSql = (v: SqlValue | undefined): SQLInputValue => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/* ================================================================== JSON Repo */

export interface Row<T> {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 스칼라 컬럼 원본 값 */
  cols: Record<string, SqlValue>;
  data: T;
}

export interface ListOptions<C extends string> {
  where?: Partial<Record<C, SqlValue>>;
  /** 기본 'created_at DESC' */
  order?: 'created_at DESC' | 'created_at ASC' | 'updated_at DESC';
  limit?: number;
  offset?: number;
}

export interface JsonRepo<T, C extends string> {
  table: string;
  /** 삽입. id 미지정 시 생성. 반환: id */
  insert(input: { id?: string; data: T; cols?: Partial<Record<C, SqlValue>>; createdAt?: string }): string;
  /** 같은 id가 있으면 data/cols 갱신, 없으면 삽입 */
  upsert(input: { id: string; data: T; cols?: Partial<Record<C, SqlValue>> }): string;
  get(id: string): T | null;
  getRow(id: string): Row<T> | null;
  list(opts?: ListOptions<C>): Row<T>[];
  update(id: string, patch: { data?: T; cols?: Partial<Record<C, SqlValue>> }): boolean;
  delete(id: string): boolean;
  deleteWhere(where: Partial<Record<C, SqlValue>>): number;
  deleteAll(): number;
  count(where?: Partial<Record<C, SqlValue>>): number;
}

/**
 * 테이블 하나에 대한 타입 안전 JSON 저장소. 읽을 때 zod로 검증한다(실패 시 예외).
 */
export function createJsonRepo<T, TB extends JsonTable>(table: TB, schema: z.ZodType<T>): JsonRepo<T, TableColumn<TB>> {
  type C = TableColumn<TB>;
  const allowed = new Set<string>(TABLE_COLUMNS[table]);
  const checkCols = (cols: object | undefined) => {
    for (const k of Object.keys(cols ?? {})) if (!allowed.has(k)) throw new Error(`[db] ${table}: 허용되지 않은 컬럼 '${k}'`);
  };
  const whereSql = (where: object | undefined): { sql: string; params: SQLInputValue[] } => {
    checkCols(where);
    const entries = Object.entries(where ?? {});
    if (!entries.length) return { sql: '', params: [] };
    return {
      sql: ' WHERE ' + entries.map(([k, v]) => (v === null ? `${k} IS NULL` : `${k} = ?`)).join(' AND '),
      params: entries.filter(([, v]) => v !== null).map(([, v]) => toSql(v as SqlValue)),
    };
  };
  const parseRow = (r: Record<string, SQLInputValue>): Row<T> => {
    const { id, created_at, updated_at, data, ...rest } = r;
    return {
      id: String(id),
      createdAt: String(created_at),
      updatedAt: String(updated_at),
      cols: rest as Record<string, SqlValue>,
      data: schema.parse(JSON.parse(String(data))),
    };
  };

  const repo: JsonRepo<T, C> = {
    table,
    insert({ id, data, cols, createdAt }) {
      checkCols(cols);
      const db = getDb();
      const rid = id ?? newId(ID_PREFIX[table]);
      const now = createdAt ?? nowIso();
      const parsed = schema.parse(data);
      const keys = Object.keys(cols ?? {});
      const sql = `INSERT INTO ${table} (id, created_at, updated_at, data${keys.map((k) => ', ' + k).join('')}) VALUES (?, ?, ?, ?${keys.map(() => ', ?').join('')})`;
      db.prepare(sql).run(rid, now, now, JSON.stringify(parsed), ...keys.map((k) => toSql((cols as Record<string, SqlValue>)[k])));
      return rid;
    },
    upsert({ id, data, cols }) {
      if (repo.getRow(id)) repo.update(id, { data, cols });
      else repo.insert({ id, data, cols });
      return id;
    },
    get(id) {
      return repo.getRow(id)?.data ?? null;
    },
    getRow(id) {
      const r = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, SQLInputValue> | undefined;
      return r ? parseRow(r) : null;
    },
    list(opts = {}) {
      const w = whereSql(opts.where);
      const order = opts.order ?? 'created_at DESC';
      if (!ORDERS.has(order)) throw new Error(`[db] 허용되지 않은 정렬: ${order}`);
      // 정수로 고정: limit=1.5 같은 쿼리 값이 SQLite 'datatype mismatch' 500으로 이어지지 않게
      const int = (v: number | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : d);
      const limit = Math.max(1, Math.min(500, int(opts.limit, 100)));
      const offset = Math.max(0, int(opts.offset, 0));
      const rows = getDb()
        .prepare(`SELECT * FROM ${table}${w.sql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`)
        .all(...w.params) as Record<string, SQLInputValue>[];
      return rows.map(parseRow);
    },
    update(id, { data, cols }) {
      checkCols(cols);
      const sets: string[] = ['updated_at = ?'];
      const params: SQLInputValue[] = [nowIso()];
      if (data !== undefined) {
        sets.push('data = ?');
        params.push(JSON.stringify(schema.parse(data)));
      }
      for (const [k, v] of Object.entries(cols ?? {})) {
        sets.push(`${k} = ?`);
        params.push(toSql(v as SqlValue));
      }
      const r = getDb().prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      return Number(r.changes) > 0;
    },
    delete(id) {
      return Number(getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes) > 0;
    },
    deleteWhere(where) {
      const w = whereSql(where);
      if (!w.sql) throw new Error('[db] deleteWhere: 조건이 비어 있습니다. deleteAll()을 쓰세요.');
      return Number(getDb().prepare(`DELETE FROM ${table}${w.sql}`).run(...w.params).changes);
    },
    deleteAll() {
      return Number(getDb().prepare(`DELETE FROM ${table}`).run().changes);
    },
    count(where) {
      const w = whereSql(where);
      return Number((getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}${w.sql}`).get(...w.params) as { n: number }).n);
    },
  };
  return repo;
}

/* ================================================================== 테이블별 저장소 */

/** face_sessions: data=FaceSession. cols: status, is_mock, front_upload_id, label */
export const faceSessions = createJsonRepo('face_sessions', FaceSessionSchema);
/** body_sessions: data=BodySession. cols: status, is_mock, upload_id, label */
export const bodySessions = createJsonRepo('body_sessions', BodySessionSchema);
/** celebs: data=CelebProfile. cols: name, name_key, saved, is_mock, thumbnail_upload_id */
export const celebs = createJsonRepo('celebs', CelebProfileSchema);
/** celeb_images: data=CelebImage. cols: celeb_id, category, provider, source_url, upload_id, is_full_body, analyzable, selected, is_mock */
export const celebImages = createJsonRepo('celeb_images', CelebImageSchema);
/** vibe_analyses: data=VibeAnalysis. cols: celeb_id, celeb_name, image_upload_id, analyzable, look_name, is_mock */
export const vibeAnalyses = createJsonRepo('vibe_analyses', VibeAnalysisSchema);
/** personal_color_reports: data=PersonalColorReport. cols: face_session_id, body_session_id, tone, season, is_mock */
export const personalColorReports = createJsonRepo('personal_color_reports', PersonalColorReportSchema);
/** vibe_guides: data=VibeGuide. cols: report_id, vibe_analysis_id, celeb_id, celeb_name, look_name, thumbnail_upload_id, saved, is_mock */
export const vibeGuides = createJsonRepo('vibe_guides', VibeGuideSchema);

/* ================================================================== KV / 검색 캐시 */

export function kvGet<T = unknown>(key: string): T | null {
  const r = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as T) : null;
}
export function kvSet(key: string, value: unknown): void {
  getDb()
    .prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, JSON.stringify(value), nowIso());
}
export function kvDelete(key: string): void {
  getDb().prepare('DELETE FROM kv WHERE key = ?').run(key);
}

/** 검색 결과 캐시 조회 (만료 시 null) */
export function cacheGet<T = unknown>(key: string): T | null {
  const r = getDb().prepare('SELECT data, expires_at FROM search_cache WHERE key = ?').get(key) as { data: string; expires_at: string | null } | undefined;
  if (!r) return null;
  if (r.expires_at && r.expires_at < nowIso()) return null;
  return JSON.parse(r.data) as T;
}
/** 검색 결과 캐시 저장 (ttlSec 기본 7일) */
export function cacheSet(key: string, provider: string, data: unknown, ttlSec = 7 * 24 * 3600): void {
  const exp = new Date(Date.now() + ttlSec * 1000).toISOString();
  getDb()
    .prepare(
      'INSERT INTO search_cache (key, provider, created_at, expires_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET provider = excluded.provider, created_at = excluded.created_at, expires_at = excluded.expires_at, data = excluded.data',
    )
    .run(key, provider, nowIso(), exp, JSON.stringify(data));
}

/* ================================================================== 상태 */

export interface DbHealth {
  ok: boolean;
  path: string;
  schemaVersion: number;
  sqliteVersion: string;
  tables: Record<string, number>;
  /** 쓰기/읽기 왕복 테스트 */
  roundTrip: boolean;
  error?: string;
}

/** /api/health 용: DB 열기, 마이그레이션, 테이블 카운트, kv 왕복 */
export function dbHealth(): DbHealth {
  try {
    const db = getDb();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    const stamp = nowIso();
    kvSet('health:last', stamp);
    const roundTrip = kvGet<string>('health:last') === stamp;
    return {
      ok: true,
      path: dbPath(),
      schemaVersion: Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version),
      sqliteVersion: String((db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v),
      tables: counts,
      roundTrip,
    };
  } catch (e) {
    return { ok: false, path: '', schemaVersion: 0, sqliteVersion: '', tables: {}, roundTrip: false, error: (e as Error).message };
  }
}
