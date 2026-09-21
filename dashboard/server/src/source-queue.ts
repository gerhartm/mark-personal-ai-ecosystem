import { all, one, run } from './db.js';

export function queueSource(sourceId: string) {
  const now = new Date().toISOString();
  run(`INSERT OR IGNORE INTO source_processing(source_id,status,not_before,updated_at)
       VALUES (?,'queued',?,?)`, sourceId, now, now);
}

export function retrySource(sourceId: string) {
  queueSource(sourceId);
  const now = new Date().toISOString();
  return run(`UPDATE source_processing SET status='queued',stage='queued',attempts=0,
              not_before=?,updated_at=?,last_error=NULL WHERE source_id=? AND status='failed'`,
    now, now, sourceId).changes > 0;
}

export function processingSummary() {
  return one<any>(`SELECT count(*) AS total,
    coalesce(sum(status='ready'),0) AS ready,
    coalesce(sum(status IN ('queued','processing')),0) AS processing,
    coalesce(sum(status='failed'),0) AS failed,
    coalesce(sum(event_count),0) AS events,coalesce(sum(dated_count),0) AS dated,
    max(updated_at) AS updated_at FROM source_processing`);
}

export function sourceProcessingRows() {
  return all(`SELECT p.*,s.title,s.source_type,s.source_channel,s.captured_at,s.source_url
              FROM source_processing p JOIN sources s ON s.source_id=p.source_id
              ORDER BY p.updated_at DESC`);
}
