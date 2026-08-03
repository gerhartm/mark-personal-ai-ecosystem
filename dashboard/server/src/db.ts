import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(
  process.env.CRYPTO_DB ?? join(HERE, '..', '..', 'data', 'crypto-intelligence.db'),
);

if (!existsSync(DB_PATH)) {
  throw new Error(
    `active database not found at ${DB_PATH}. Run "npm run build:db" in dashboard/server first.`,
  );
}

/**
 * One database. Nothing is attached, there are no temp views, and there is one
 * full-text index. Foreign keys are real and enforced by SQLite.
 */
export const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** The private media archive. Unset means media is unavailable in this environment. */
export const MEDIA_ROOT = process.env.CRYPTO_MEDIA_ROOT ?? null;

export type Origin = 'migrated' | 'ingested';

export const one = <T = any>(sql: string, ...params: any[]): T | undefined =>
  db.prepare(sql).get(...params) as T | undefined;

export const all = <T = any>(sql: string, ...params: any[]): T[] =>
  db.prepare(sql).all(...params) as T[];

export const run = (sql: string, ...params: any[]) => db.prepare(sql).run(...params);

export function audit(actor: string, action: string, target?: string, detail?: unknown) {
  run(
    'INSERT INTO audit_log (created_at, actor, action, target, detail_json) VALUES (?, ?, ?, ?, ?)',
    new Date().toISOString(),
    actor,
    action,
    target ?? null,
    detail ? JSON.stringify(detail) : null,
  );
}
