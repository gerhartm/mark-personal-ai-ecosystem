import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { formatBytes, formatDate, formatDateTime, headline, paragraphs, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  GeneratedBlock,
  Panel,
  SignificanceMeter,
  Skeleton,
  StatusChip,
  Tag,
} from '../components/primitives';
import { PinDate } from '../components/primitives';
import { ENTITY_LABEL, ENTITY_TYPES, categoryLabel } from '../lib/taxonomy';
import { IconBack, IconMedia } from '../components/icons';
import './detail.css';

export function EventDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, refetch } = useQuery(`/events/${id}`, [id]);
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={70} />;

  const e = data;

  return (
    <div className="page detail">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          <IconBack /> Back
        </button>
        <Link to="/library">Library</Link>
        <span className="faint">/</span>
        <span className="mono faint">{e.id}</span>
      </nav>

      <header className="detail-head">
        <div className="detail-head-marks">
          <SignificanceMeter value={e.significance} />
          <CategoryChip category={e.primary_category} />
          {e.secondary?.map((c: string) => (
            <span key={c} className="chip chip-sm faint">
              also {categoryLabel(c)}
            </span>
          ))}
          {e.origin === 'ingested' && <StatusChip tone="good">captured after migration</StatusChip>}
        </div>
        <h1 className="detail-title">{headline(e.summary)}</h1>
        <p className="detail-dates">
          <span>
            <span className="label">Subject</span> <span className="mono">{e.subject_date?.slice(0, 10) ?? 'undated'}</span>
          </span>
          <span>
            <span className="label">Captured</span> <span className="mono">{formatDateTime(e.timestamp)}</span>
          </span>
        </p>
      </header>

      <div className="detail-columns">
        <article className="detail-reading">
          <section className="block">
            <h2 className="block-title">Summary</h2>
            <div className="read">
              {paragraphs(e.summary).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>

          <NoteEditor eventId={e.id} notes={e.notes} onSaved={refetch} />

          {e.business_signal && (
            <section className="block">
              <h2 className="block-title">Business signal</h2>
              <p className="read">{e.business_signal}</p>
            </section>
          )}

          {e.underlying_principle && (
            <section className="block">
              <h2 className="block-title">Underlying principle</h2>
              <p className="read">{e.underlying_principle}</p>
            </section>
          )}

          <section className="block">
            <h2 className="block-title">Detailed content</h2>
            {e.detailed_content ? (
              <div className="read">
                {paragraphs(e.detailed_content).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="absent">
                No detailed content was captured for this event. 19 of the 66 migrated events are in this state, which
                is a fact about the source rather than a gap in the record.
              </p>
            )}
          </section>

          {e.detailed_notes && (
            <section className="block">
              <h2 className="block-title">Detailed notes</h2>
              <div className="read">
                {paragraphs(e.detailed_notes).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}

          <details className="block raw">
            <summary className="block-title">Raw source text</summary>
            <div className="read raw-body">
              {paragraphs(e.raw_text).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </details>

          {e.pins?.length > 0 && (
            <section className="block">
              <h2 className="block-title">Pinned summaries</h2>
              {e.pins.map((p: any) => (
                <GeneratedBlock key={p.pin_key} model={p.model} at={p.created_at}>
                  {p.summary}
                </GeneratedBlock>
              ))}
            </section>
          )}
        </article>

        <aside className="detail-rail">
          <Panel title="Source">
            <div className="rail-block">
              <Link to={`/source/${e.source.source_id}`} className="source-title">
                {e.source.title}
              </Link>
              <dl className="kv">
                <dt>Type</dt>
                <dd>{e.source.source_type}</dd>
                <dt>Channel</dt>
                <dd>{e.source.source_channel ?? 'none recorded'}</dd>
                <dt>Captured</dt>
                <dd className="mono">{formatDate(e.source.captured_at)}</dd>
              </dl>
              {e.source.source_url && (
                <a className="external" href={e.source.source_url} target="_blank" rel="noreferrer noopener">
                  Open the original, leaves this workspace
                </a>
              )}
            </div>
          </Panel>

          {e.insights?.length > 0 && (
            <Panel title={`Key insights (${e.insights.length})`}>
              <ul className="insights">
                {e.insights.map((i: any) => (
                  <li key={i.position}>{i.text}</li>
                ))}
              </ul>
            </Panel>
          )}

          {e.dates?.length > 0 && (
            <Panel title={`Dates referenced (${e.dates.length})`}>
              <ul className="dates">
                {e.dates.map((d: any) => (
                  <li key={d.position}>
                    <PinDate date={d.date} precision={d.precision} />
                    <span className="dates-label">{d.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Entities">
            <div className="rail-block entity-groups">
              {ENTITY_TYPES.filter((t) => e.entities[t]?.length).map((type) => (
                <div key={type} className="entity-group">
                  <p className="label">{ENTITY_LABEL[type]}</p>
                  <div className="entity-chips">
                    {e.entities[type].map((v: string) => (
                      <Link key={v} to={`/library?q=${encodeURIComponent(v)}`} className="entity-chip">
                        {truncate(v, 44)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {e.tags?.length > 0 && (
            <Panel title={`Tags (${e.tags.length})`}>
              <div className="rail-block tag-cloud">
                {e.tags.map((t: string) => (
                  <Link key={t} to={`/library?q=${encodeURIComponent(t)}`}>
                    <Tag>{t}</Tag>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={`Connections (${e.connections.length})`}>
            {e.connections.length === 0 ? (
              <EmptyState title="No explicit connections">
                This event was not linked to another during capture.
              </EmptyState>
            ) : (
              <ul className="connections">
                {e.connections.map((c: any) =>
                  c.resolved ? (
                    <li key={c.id}>
                      <Link to={`/event/${c.id}`} className="connection">
                        <span className="mono connection-id">{c.id}</span>
                        <span>{truncate(c.summary ?? '', 92)}</span>
                      </Link>
                    </li>
                  ) : (
                    <li key={c.id}>
                      <div className="connection is-unresolved" title="Referenced but not present in this corpus">
                        <span className="mono connection-id">{c.id}</span>
                        <StatusChip tone="warning">not in this corpus</StatusChip>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>

          {e.related?.length > 0 && (
            <Panel title="Related by shared entities">
              <ul className="connections">
                {e.related.map((r: any) => (
                  <li key={r.id}>
                    <Link to={`/event/${r.id}`} className="connection">
                      <span className="mono connection-shared">{r.shared} shared</span>
                      <span>{truncate(r.summary ?? '', 92)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {e.media?.length > 0 && (
            <Panel title={`Media (${e.media.length})`}>
              <ul className="media-list">
                {e.media.map((m: any) => (
                  <li key={m.archive_ref}>
                    <MediaRow asset={m} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {e.quiz?.length > 0 && (
            <Panel title={`Appears in ${plural(e.quiz.length, 'quiz question')}`}>
              <ul className="quiz-refs">
                {e.quiz.map((q: any) => (
                  <li key={q.id}>
                    <Link to={`/quiz/${q.session_id}`}>{truncate(q.question_text, 96)}</Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function MediaRow({ asset }: { asset: any }) {
  const [state, setState] = useState<'idle' | 'loading' | 'text' | 'error'>('idle');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');

  const open = async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(asset.archive_ref)}`);
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setMessage(detail.message ?? `Unavailable (${res.status})`);
        setState('error');
        return;
      }
      const text = await res.text();
      setBody(text.slice(0, 40_000));
      setState('text');
    } catch (err) {
      setMessage((err as Error).message);
      setState('error');
    }
  };

  const readable = ['json', 'txt'].includes(asset.kind);

  return (
    <div className="media-row">
      <div className="media-head">
        <span className="chip chip-sm">{asset.kind}</span>
        <span className="mono media-path">{asset.relative_path}</span>
        <span className="mono faint">{formatBytes(asset.bytes)}</span>
      </div>
      {readable && state === 'idle' && (
        <button type="button" className="btn btn-ghost media-open" onClick={open}>
          <IconMedia /> Open transcript
        </button>
      )}
      {state === 'loading' && <p className="faint">Loading</p>}
      {state === 'error' && <StatusChip tone="warning">{message}</StatusChip>}
      {state === 'text' && <pre className="transcript">{body}</pre>}
    </div>
  );
}

/**
 * Notes are append only. Revision 0 is the value preserved in the frozen
 * handoff, so the original is never edited, only superseded.
 */
function NoteEditor({ eventId, notes, onSaved }: { eventId: string; notes: any[]; onSaved: () => void }) {
  const current = notes[0];
  const [text, setText] = useState(current?.text ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setText(current?.text ?? '');
    setStatus('idle');
  }, [eventId, current?.revision]);

  const dirty = text.trim() !== (current?.text ?? '').trim();

  const save = async () => {
    if (!dirty || !text.trim()) return;
    setStatus('saving');
    try {
      await api(`/events/${eventId}/notes`, { method: 'PUT', body: JSON.stringify({ text }) });
      invalidate('/events');
      invalidate('/brief');
      setStatus('saved');
      onSaved();
    } catch (err) {
      setMessage((err as Error).message);
      setStatus('error');
    }
  };

  return (
    <section className="block note-block">
      <div className="block-head">
        <h2 className="block-title">Your notes</h2>
        <div className="note-status">
          {current && (
            <span className="faint mono">
              revision {current.revision}
              {current.revision === 0 ? ' (migrated)' : ''}
            </span>
          )}
          {current?.memory_state === 'pending' && <StatusChip tone="warning">memory sync pending</StatusChip>}
          {status === 'saved' && <StatusChip tone="good">saved</StatusChip>}
          {status === 'error' && <StatusChip tone="critical">{message}</StatusChip>}
        </div>
      </div>

      <textarea
        className="note-input"
        value={text}
        placeholder="What matters about this event, in your words. Saving appends a new revision, it never overwrites."
        onChange={(ev) => {
          setText(ev.target.value);
          setStatus('idle');
        }}
        onBlur={save}
        rows={Math.max(7, Math.min(20, Math.ceil(text.length / 86) + text.split('\n').length + 1))}
        aria-label="Your notes on this event"
      />

      <div className="note-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || !text.trim()}>
          {status === 'saving' ? 'Saving' : 'Append revision'}
        </button>
        {notes.length > 1 && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? 'Hide' : 'Show'} {plural(notes.length, 'revision')}
          </button>
        )}
      </div>

      {showHistory && (
        <ol className="note-history">
          {notes.map((n) => (
            <li key={n.revision}>
              <span className="mono faint">
                revision {n.revision}, {formatDateTime(n.created_at)}, {n.author}
              </span>
              <p className="read">{n.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
