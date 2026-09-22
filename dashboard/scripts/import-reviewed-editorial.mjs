// Apply a reviewed, hash-gated editorial overlay. Original research, source bodies,
// dates, notes and citations remain intact. Run with NODE_ENV=test to avoid workers.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { db, all, one, run, audit } from '../server/dist/db.js';
import { prose, validateEditorial } from '../server/dist/editorial.js';
import { saveEditorial, RESEARCH_EVENT } from '../server/dist/editorial-store.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const path = process.argv[2];
if (!path) throw new Error('Provide the reviewed editorial JSON file.');
const patch = JSON.parse(readFileSync(path, 'utf8'));
if (patch.version !== 1 || !Array.isArray(patch.records) || !patch.records.length) throw new Error('Invalid editorial patch.');
const ids = new Set(patch.records.map(row => row.id));
if (ids.size !== patch.records.length) throw new Error('Duplicate patch IDs.');
const expected = new Map(patch.records.map(row => [row.id, row]));
const report = db.transaction(() => {
  const prepared = patch.records.map(row => {
    const event = one('SELECT * FROM events WHERE id=?', row.id);
    const evidence = one('SELECT quote FROM event_evidence WHERE event_id=?', row.id);
    if (!event || event.origin !== 'ingested' || !evidence || hash(event.summary) !== row.summary_hash || hash(evidence.quote) !== row.evidence_hash) throw new Error(`Original research changed: ${row.id}`);
    const processing = one('SELECT status FROM source_processing WHERE source_id=?', event.source_id);
    if (processing && processing.status !== 'ready') throw new Error(`Source processing is active or incomplete: ${row.id}`);
    const body = one("SELECT body FROM search_index WHERE canonical_id=? AND kind='source' ORDER BY length(body) DESC LIMIT 1", event.source_id)?.body;
    if (!body || !prose(body).includes(prose(evidence.quote))) throw new Error(`Retained evidence missing: ${row.id}`);
    if (row.source_content_hash && hash(body) !== row.source_content_hash) throw new Error(`Source body changed: ${row.id}`);
    let value;
    if (row.editorial.kind === 'research') {
      const excerpt = prose(row.editorial.evidence_excerpt);
      if (!row.source_content_hash || !excerpt || !prose(body).includes(excerpt) || !excerpt.includes(prose(evidence.quote))) throw new Error(`Invalid supporting passage: ${row.id}`);
      if (row.grounding_review?.supported !== true || row.grounding_review.editorial_hash !== hash(JSON.stringify(row.editorial))) throw new Error(`Editorial has not passed review: ${row.id}`);
      value = validateEditorial(row.editorial, excerpt);
    } else if (row.editorial.kind === 'source_metadata') {
      if (!row.editorial.reason) throw new Error(`Missing metadata classification reason: ${row.id}`);
      value = validateEditorial(row.editorial, '', true);
    } else if (row.editorial.kind === 'duplicate') {
      const target = one('SELECT source_id FROM events WHERE id=?', row.editorial.related_event_id);
      if (row.id === row.editorial.related_event_id || !target || target.source_id !== event.source_id || expected.get(row.editorial.related_event_id)?.editorial.kind !== 'research') throw new Error(`Invalid duplicate target: ${row.id}`);
      const dates = id => JSON.stringify(all('SELECT sort_key,precision FROM event_dates WHERE event_id=? ORDER BY sort_key,precision', id));
      if (dates(row.id) !== dates(row.editorial.related_event_id)) throw new Error(`Duplicate dates differ: ${row.id}`);
      value = { kind: 'duplicate', headline: '', explanation: '', why_it_matters: '', watch: [], related_event_id: row.editorial.related_event_id, reason: prose(row.editorial.reason) };
    } else throw new Error(`Unknown editorial kind: ${row.id}`);
    return { id: row.id, source: event.source_id, value };
  });
  for (const item of prepared) saveEditorial(item.id, item.value, 'reviewed timeline repair');
  for (const source of new Set(prepared.map(item => item.source))) {
    const counts = one(`SELECT count(*) events, (SELECT count(*) FROM event_dates d JOIN events e ON e.id=d.event_id WHERE e.source_id=? AND ${RESEARCH_EVENT}) dates FROM events e WHERE e.source_id=? AND ${RESEARCH_EVENT}`, source, source);
    run('UPDATE source_processing SET event_count=?,dated_count=? WHERE source_id=?', counts.events, counts.dates, source);
  }
  if (db.pragma('foreign_key_check').length) throw new Error('Foreign key validation failed.');
  const result = Object.fromEntries(['research', 'source_metadata', 'duplicate'].map(kind => [kind, prepared.filter(row => row.value.kind === kind).length]));
  audit('reviewed timeline repair', 'editorial.repair', undefined, result);
  return result;
})();
console.log(JSON.stringify(report));
db.close();
