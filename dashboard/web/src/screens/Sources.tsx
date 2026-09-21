import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useQuery } from '../lib/api';
import { ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { formatDate, sourceKind } from '../lib/desk';
import './workspace-utilities.css';

type Item = { kind: 'url' | 'text' | 'document'; value: string; title: string; filename?: string; source_type?: 'note' | 'transcript' | 'telegram' | 'article' };
const documentBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
  reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please select it again.`));
  reader.readAsDataURL(file);
});
const textOf = (value: any): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => typeof part === 'string' ? part : part.text || '').join('') : '';
export function telegramItems(raw: any, filename: string): Item[] {
  const messages = Array.isArray(raw) ? raw : raw.messages;
  if (!Array.isArray(messages)) throw new Error('Choose a Telegram JSON export containing messages.');
  return messages.filter(item => !item.type || item.type === 'message').map(message => {
    const text = textOf(message.text);
    if (!text.trim()) return null;
    const provenance = [raw.name || filename, message.from || message.forwarded_from, message.date ? `Message date: ${message.date}` : '', message.id ? `Message ID: ${message.id}` : ''].filter(Boolean).join('\n');
    return { kind: 'text', source_type: 'telegram', value: `${provenance}\n\n${text}`, title: text.replace(/\s+/g, ' ').slice(0, 160) || filename } as Item;
  }).filter((item): item is Item => Boolean(item));
}

// dashboard-revert-acceptance-20260921
export function Sources() {
  const sources = useQuery<any>('/sources', [], 10_000);
  const processing = useQuery<any>('/processing', [], 5_000);
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [value, setValue] = useState('');
  const [title, setTitle] = useState('');
  const [textType, setTextType] = useState<Item['source_type']>('transcript');
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const act = async (path: string) => {
    setError('');
    try { await api(path, { method: 'POST' }); processing.refetch(); }
    catch (e) { setError((e as Error).message); }
  };
  const upload = async (files: FileList | null) => {
    setError(''); setReading(true);
    try {
      const next: Item[] = [];
      for (const file of Array.from(files ?? [])) {
        if (file.size > 5_000_000) throw new Error(`${file.name} exceeds the 5 MB file limit.`);
        if (!/\.(txt|md|srt|vtt|csv|json|doc|docx|pdf)$/i.test(file.name)) throw new Error('Use Word (.doc or .docx), PDF, TXT, Markdown, SRT, VTT, CSV or a Telegram JSON export.');
        if (/\.(doc|docx|pdf)$/i.test(file.name)) {
          if (!file.size) throw new Error(`${file.name} is empty.`);
          next.push({ kind: 'document', filename: file.name, title: file.name.slice(0, 200), value: await documentBase64(file), source_type: textType });
          continue;
        }
        const body = await file.text();
        if (/\.json$/i.test(file.name)) next.push(...telegramItems(JSON.parse(body), file.name));
        else {
          if (body.length > 250_000) throw new Error(`${file.name} exceeds 250,000 characters. Split the transcript into smaller files.`);
          next.push({ kind: 'text', title: file.name.slice(0, 200), value: body, source_type: textType });
        }
      }
      if (!next.length) throw new Error('No readable text messages were found. Media-only Telegram messages need a transcript.');
      setItems(current => [...current, ...next]);
    } catch (e) { setError((e as Error).message); }
    finally { setReading(false); }
  };
  const submit = async () => {
    const typed: Item[] = !value.trim() ? [] : mode === 'url'
      ? value.split(/\n/).map(url => url.trim()).filter(Boolean).map(url => ({ kind: 'url', title: '', value: url }))
      : [{ kind: 'text', title, value, source_type: textType }];
    const queue = [...items, ...typed];
    if (!queue.length) return;
    if (queue.some(item => !item.value.trim() || (item.kind === 'text' && item.value.length > 250_000))) { setError('Each text source must contain 1 to 250,000 characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    let submitted = 0;
    try {
      // Limit each request by both item count and bytes. Accepted jobs persist before the next request.
      while (submitted < queue.length) {
        const batch: Item[] = [];
        let bytes = 0;
        for (const item of queue.slice(submitted, submitted + 100)) {
          const size = new TextEncoder().encode(JSON.stringify(item)).length;
          if (batch.length && bytes + size > 4_000_000) break;
          batch.push(item); bytes += size;
        }
        await api('/imports', { method: 'POST', body: JSON.stringify({ items: batch }) });
        submitted += batch.length;
        setNotice(`${submitted} of ${queue.length} sources queued. You can leave after all are accepted.`);
      }
      setItems([]); setValue(''); setTitle('');
      setNotice(`${submitted} sources queued. Processing continues on the server when you leave this page.`);
    } catch (e) {
      setItems(queue.slice(submitted)); setValue('');
      setError(`${(e as Error).message} ${submitted ? `${submitted} sources were already accepted; the remaining items are kept here.` : ''}`);
    } finally { setBusy(false); processing.refetch(); sources.refetch(); }
  };
  if (sources.loading && !sources.data) return <LoadingRows />;
  if (sources.error) return <ErrorState error={sources.error} retry={sources.refetch} />;
  const jobs = new Map<string, any>((processing.data?.sources ?? []).map((row: any) => [row.source_id, row]));
  const visible = (sources.data?.sources ?? []).filter((source: any) => `${source.title} ${source.source_type}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="workspace-utilities"><ViewHead title="Sources and imports">Add articles, message exports and transcripts. Each source is retained, then processed into supported claims and dates.</ViewHead>
    <div className="utility-panel">
      <h2>Add sources</h2>
      <div className="utility-actions"><button aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Article links</button><button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Pasted text</button></div>
      {mode === 'text' ? <input aria-label="Source title" placeholder="Source title (optional)" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /> : null}
      <textarea aria-label={mode === 'url' ? 'Article links' : 'Source text'} rows={4} placeholder={mode === 'url' ? 'One public article URL per line' : 'Paste a transcript, meeting notes or message text'} value={value} onChange={e => setValue(e.target.value)} />
      <label>Text and file type <select aria-label="Text source type" value={textType} onChange={e => setTextType(e.target.value as Item['source_type'])}><option value="transcript">Transcript</option><option value="note">Notes</option><option value="article">Article</option><option value="telegram">Telegram text</option></select></label>
      <label className="file-label">Add files (Word, PDF and text) <input disabled={busy || reading} type="file" multiple accept=".txt,.md,.srt,.vtt,.csv,.json,.doc,.docx,.pdf" onChange={e => { void upload(e.target.files); e.target.value = ''; }} /></label>
      <p className="utility-muted">Word (.doc and .docx), PDF, TXT, Markdown, SRT, VTT, CSV and Telegram JSON. Up to 5 MB per file and 250,000 extracted characters per document.</p>
      <p className="utility-muted">Word and PDF text is extracted on the server after queuing. Scanned PDFs need OCR first. Export audio or video as a transcript first. Model and memory processing use your provider credits.</p>
      {reading ? <p role="status">Reading selected files…</p> : null}
      {items.length ? <details><summary>{items.length} file sources ready to queue</summary><ul className="utility-scroll">{items.map((item, index) => <li key={index}>{item.title}{' '}<button type="button" aria-label={`Remove source ${index + 1}: ${item.filename || item.title || 'Untitled source'}`} disabled={busy} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}</ul><button disabled={busy} onClick={() => setItems([])}>Clear file selection</button></details> : null}
      <div className="utility-actions"><button className="desk-button" disabled={busy || reading || (!value.trim() && !items.length)} onClick={submit}>{busy ? 'Queuing sources' : items.length ? `Queue import (${items.length} source document${items.length === 1 ? '' : 's'})` : 'Queue import'}</button></div>
      {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="utility-error">{error}</p> : null}
    </div>
    {processing.error ? <ErrorState error={processing.error} retry={processing.refetch} /> : null}
    {processing.data?.imports?.length ? <details className="utility-panel" open={processing.data.imports.some((row: any) => row.status !== 'ready')}><summary>Import activity ({processing.data.imports.length})</summary><div className="utility-scroll">{processing.data.imports.map((row: any) => <article key={row.id} className="utility-row"><div><strong>{row.title}</strong><p className="utility-muted">{row.status === 'ready' ? `Source saved · evidence ${row.evidence_status || 'queued'}` : row.status}{row.last_error ? ` · ${row.last_error}` : ''}</p></div>{row.status === 'failed' ? <button onClick={() => act(`/imports/${row.id}/retry`)}>Retry import</button> : null}</article>)}</div></details> : null}
    <div className="utility-actions"><h2>Retained sources ({visible.length})</h2><input aria-label="Search sources" placeholder="Find a source" value={query} onChange={e => setQuery(e.target.value)} /></div>
    {visible.length === 0 ? <p>No sources match this search.</p> : null}
    {visible.map((source: any) => { const job = jobs.get(source.source_id); return <article className="utility-row" key={source.source_id}><div><Link to={`/sources/${encodeURIComponent(source.source_id)}`}>{source.title || source.source_label}</Link><p className="utility-muted">{sourceKind(source.source_type)} · captured {formatDate(source.captured_at)} · {job ? job.status === 'ready' ? `${job.event_count} claims · ${job.dated_count} date entries` : `${job.status} · ${job.chunks_done}/${job.chunks_total || '?'} sections processed` : `${source.event_count ?? 0} existing events`}</p>{job?.last_error ? <p className="utility-error">{job.last_error}</p> : null}</div>{job?.status === 'failed' ? <button onClick={() => act(`/processing/${encodeURIComponent(source.source_id)}/retry`)}>Retry processing</button> : null}</article>; })}
  </section>;
}

export function RetainedSource() {
  const { id } = useParams();
  const source = useQuery<any>(`/sources/${encodeURIComponent(id || '')}`);
  if (source.loading && !source.data) return <LoadingRows />;
  if (source.error) return <ErrorState error={source.error} retry={source.refetch} />;
  const data = source.data;
  return <section className="workspace-utilities"><Link to="/sources">Back to sources</Link><ViewHead title={data?.title || 'Retained source'}>{sourceKind(data?.source_type)} · captured {formatDate(data?.captured_at)}</ViewHead>
    {data?.source_url ? <a href={data.source_url} target="_blank" rel="noreferrer">Open original source</a> : null}
    {data?.content_truncated ? <p role="alert">The displayed text is limited to one million characters. The original remains in private memory.</p> : null}
    {data?.events?.length ? <details className="utility-panel"><summary>Extracted events ({data.events.length})</summary>{data.events.map((event: any) => <p key={event.id}>{event.summary}</p>)}</details> : null}
    <pre className="source-document">{data?.content || 'The source body could not be retrieved. The metadata and original link remain available.'}</pre>
  </section>;
}
