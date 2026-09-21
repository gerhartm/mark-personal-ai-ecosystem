// One-time release operation. Revalidate the canary evidence against the current
// canonical source bodies, then append claims without replacing the live database.
import { createRequire } from 'node:module';
const Database = createRequire(new URL('../server/package.json', import.meta.url))('better-sqlite3');
import { createHash } from 'node:crypto';
import { db, one, run } from '../server/dist/db.js';
import { sourceContent } from '../server/dist/ingestion.js';
import { validateExtraction, commitSourceClaims } from '../server/dist/source-processor.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const checkpointPath = process.argv[2];
if (!checkpointPath) throw new Error('Provide the isolated checkpoint database path.');
const checkpoint = new Database(checkpointPath, { readonly: true });
const jobs = checkpoint.prepare("SELECT p.*,s.title,s.source_url FROM source_processing p JOIN sources s ON s.source_id=p.source_id WHERE p.status='ready'").all();
const incomplete = checkpoint.prepare("SELECT count(*) n FROM source_processing WHERE status<>'ready'").get().n;
if (incomplete || !jobs.length) throw new Error('The checkpoint set is incomplete.');
const prepared = [];
for (const job of jobs) {
  const source = one('SELECT title,source_url FROM sources WHERE source_id=?', job.source_id);
  if (!source || source.title !== job.title || source.source_url !== job.source_url) throw new Error(`Source identity changed: ${job.source_id}`);
  const body = await sourceContent(job.source_id, 1_000_001);
  if (hash(body) !== job.content_hash) throw new Error(`Source content changed: ${job.source_id}`);
  const chunks = checkpoint.prepare('SELECT * FROM source_processing_chunks WHERE source_id=? ORDER BY position').all(job.source_id);
  if (chunks.length !== job.chunks_total || chunks.some(chunk => chunk.result_json == null || hash(chunk.content) !== chunk.content_hash || !body.includes(chunk.content))) throw new Error(`Invalid checkpoint chunks: ${job.source_id}`);
  const claims = chunks.flatMap(chunk => validateExtraction({ claims: JSON.parse(chunk.result_json) }, chunk.content));
  prepared.push({ job, chunks, claims });
}
const reports = db.transaction(() => prepared.map(({ job, chunks, claims }) => {
  const stamp = new Date().toISOString();
  run("INSERT OR IGNORE INTO source_processing(source_id,status,not_before,updated_at) VALUES (?,'queued',?,?)", job.source_id, stamp, stamp);
  const current = one('SELECT content_hash,status FROM source_processing WHERE source_id=?', job.source_id);
  if (current.status === 'processing') throw new Error(`Source worker is already processing: ${job.source_id}`);
  if (current.content_hash && current.content_hash !== job.content_hash) throw new Error(`Source checkpoint changed: ${job.source_id}`);
  for (const chunk of chunks) run('INSERT OR REPLACE INTO source_processing_chunks(source_id,position,content,content_hash,result_json) VALUES (?,?,?,?,?)', job.source_id, chunk.position, chunk.content, chunk.content_hash, chunk.result_json);
  run('UPDATE source_processing SET content_hash=?,chunks_total=?,attempts=0 WHERE source_id=?', job.content_hash, chunks.length, job.source_id);
  return { title: job.title, ...commitSourceClaims(job.source_id, claims) };
}))();
if (db.pragma('foreign_key_check').length) throw new Error('Foreign key validation failed.');
checkpoint.close();
console.log(JSON.stringify({ sources: reports.length, reports }, null, 2));
