import { randomUUID } from 'node:crypto';
import { all, audit, db, one, run } from './db.js';
import { captureSource, CaptureInputError, prepareSource, type CaptureRequest } from './ingestion.js';
import { extractDocument, validateDocument, type DocumentRequest } from './documents.js';

export function enqueueImport(items: (CaptureRequest | DocumentRequest)[], actor: string) {
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    throw new CaptureInputError('invalid_batch', 'Add between 1 and 100 sources per batch.');
  }
  // Validate the entire request before saving anything. Canonical capture owns deduplication.
  if (items.some(item => !item || typeof item !== 'object')) throw new CaptureInputError('invalid_batch', 'Each source needs a URL or text.');
  const prepared = items.map(item => {
    if (item.kind === 'document') return { title: validateDocument(item).title, payload: item };
    const source = prepareSource(item);
    return { title: source.title, payload: { kind: source.kind, value: item.value, title: source.title, ...(source.kind === 'text' ? { source_type: source.sourceType } : {}) } };
  });
  const id = `import_${randomUUID()}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    run('INSERT INTO import_batches(id,actor,created_at) VALUES (?,?,?)', id, actor, now);
    prepared.forEach((item, position) => run(`INSERT INTO import_items
      (batch_id,position,title,payload_json,status,not_before,updated_at) VALUES (?,?,?,?,'queued',?,?)`,
      id, position, prepared[position].title, JSON.stringify(prepared[position].payload), now, now));
    audit(actor, 'sources.import_queued', id, { count: items.length });
  })();
  return { id, count: items.length };
}

export function listImports() {
  return all(`SELECT i.id,i.batch_id,i.position,i.title,i.status,i.attempts,i.updated_at,i.source_id,i.last_error,
    p.status AS evidence_status,p.event_count,p.dated_count
    FROM import_items i LEFT JOIN source_processing p ON p.source_id=i.source_id
    ORDER BY i.id DESC LIMIT 500`);
}

export function retryImport(id: number) {
  const now = new Date().toISOString();
  return run("UPDATE import_items SET status='queued',attempts=0,last_error=NULL,not_before=?,updated_at=? WHERE id=? AND status='failed'", now, now, id).changes > 0;
}

let busy = false;
export async function processNextImport() {
  if (busy) return false;
  busy = true;
  const job = one<any>("SELECT i.*,b.actor FROM import_items i JOIN import_batches b ON b.id=i.batch_id WHERE i.status='queued' AND i.not_before<=? ORDER BY i.id LIMIT 1", new Date().toISOString());
  if (!job) { busy = false; return false; }
  run("UPDATE import_items SET status='processing',updated_at=? WHERE id=?", new Date().toISOString(), job.id);
  try {
    let payload = JSON.parse(job.payload_json);
    if (payload.kind === 'document') {
      payload = await extractDocument(payload);
      // Persist extraction before calling memory, so a provider outage resumes from text.
      run('UPDATE import_items SET payload_json=?,updated_at=? WHERE id=?', JSON.stringify(payload), new Date().toISOString(), job.id);
    }
    const result = await captureSource(payload, job.actor);
    run("UPDATE import_items SET status='ready',source_id=?,payload_json='{}',last_error=NULL,updated_at=? WHERE id=?", result.source_id, new Date().toISOString(), job.id);
    return true;
  } catch (error) {
    const attempts = job.attempts + 1;
    const message = error instanceof CaptureInputError ? error.message : 'Source import could not finish. Retry to resume.';
    const permanent = error instanceof CaptureInputError && ['document_unreadable', 'document_no_text', 'document_too_long'].includes(error.code);
    run('UPDATE import_items SET status=?,attempts=?,last_error=?,not_before=?,updated_at=? WHERE id=?',
      permanent || attempts >= 3 ? 'failed' : 'queued', attempts, message,
      new Date(Date.now() + Math.min(900, 60 * 2 ** attempts) * 1000).toISOString(), new Date().toISOString(), job.id);
    return false;
  } finally { busy = false; }
}

export function startImportWorker() {
  if (process.env.SOURCE_PROCESSING_ENABLED === 'false') return;
  run("UPDATE import_items SET status='queued' WHERE status='processing'");
  const timer = setInterval(() => void processNextImport(), 5_000);
  timer.unref();
}
