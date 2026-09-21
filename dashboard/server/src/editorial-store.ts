import { one, run } from './db.js';
import type { Editorial } from './editorial.js';

export const RESEARCH_EVENT = "NOT EXISTS (SELECT 1 FROM event_editorial excluded WHERE excluded.event_id=e.id AND excluded.kind!='research')";

export function eventEditorial(id: string): Editorial | null {
  const row = one<{ content_json: string }>('SELECT content_json FROM event_editorial WHERE event_id=?', id);
  return row ? JSON.parse(row.content_json) : null;
}

export function saveEditorial(id: string, value: Editorial, actor = 'source processor') {
  run(`INSERT INTO event_editorial(event_id,kind,headline,content_json,updated_at,updated_by)
    VALUES (?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET kind=excluded.kind,headline=excluded.headline,
    content_json=excluded.content_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
    id, value.kind, value.headline, JSON.stringify(value), new Date().toISOString(), actor);
}
