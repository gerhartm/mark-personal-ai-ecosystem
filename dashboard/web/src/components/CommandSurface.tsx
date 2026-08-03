import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { truncate } from '../lib/format';
import { IconArrow, IconClose, IconSearch } from './icons';
import { StatusChip } from './primitives';
import './command.css';

const DESTINATIONS = [
  { label: 'Brief', to: '/' },
  { label: 'Timeline', to: '/timeline' },
  { label: 'Library', to: '/library' },
  { label: 'Connections', to: '/connections' },
  { label: 'Studio', to: '/studio' },
  { label: 'Recall', to: '/recall' },
  { label: 'Archive', to: '/archive' },
  { label: 'Settings', to: '/settings' },
];

interface Hit {
  canonical_id: string;
  kind: string;
  field: string;
  title: string;
  snippet: string;
}

/**
 * One input, three result classes: navigation, lexical search, and a question.
 * Asking is a mode, not a destination, so this opens over whatever is on screen.
 */
export function CommandSurface({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (asking) return;
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      setBusy(true);
      api(`/search?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => live && setHits(r.results ?? []))
        .catch(() => live && setHits([]))
        .finally(() => live && setBusy(false));
    }, 140);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [value, asking]);

  const routes = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return DESTINATIONS.slice(0, 4);
    return DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q));
  }, [value]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const ask = async () => {
    const question = value.trim();
    if (!question) return;
    setAsking(true);
    setBusy(true);
    try {
      const res = await api('/ask', { method: 'POST', body: JSON.stringify({ question }) });
      setAnswer(res);
    } catch (e) {
      setAnswer({ mode: 'error', message: (e as Error).message, results: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="command-scrim" role="dialog" aria-modal="true" aria-label="Search and ask" onMouseDown={onClose}>
      <div className="command" onMouseDown={(e) => e.stopPropagation()}>
        <div className="command-input-row">
          <span className="command-icon">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            className="command-input"
            placeholder="Search the corpus, or ask a question"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setAsking(false);
              setAnswer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
            }}
            aria-label="Search the corpus, or ask a question"
          />
          <button type="button" className="btn btn-ghost command-close" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="command-body">
          {asking ? (
            <AnswerPanel answer={answer} busy={busy} onOpen={(id) => go(`/event/${id}`)} />
          ) : (
            <>
              {routes.length > 0 && (
                <section className="command-group">
                  <p className="label command-group-label">Go to</p>
                  {routes.map((d) => (
                    <button key={d.to} type="button" className="command-row" onClick={() => go(d.to)}>
                      <span>{d.label}</span>
                      <IconArrow />
                    </button>
                  ))}
                </section>
              )}

              {value.trim().length >= 2 && (
                <section className="command-group">
                  <p className="label command-group-label">
                    Matches {busy && <span className="faint">searching</span>}
                  </p>
                  {hits.length === 0 && !busy && (
                    <p className="command-empty muted">
                      No lexical match. Try fewer words, or ask the question instead.
                    </p>
                  )}
                  {hits.map((h) => (
                    <button
                      key={`${h.kind}-${h.canonical_id}-${h.field}`}
                      type="button"
                      className="command-row command-row-hit"
                      onClick={() =>
                        go(
                          h.kind === 'source'
                            ? `/source/${h.canonical_id}`
                            : h.kind === 'draft'
                              ? `/studio/${h.canonical_id}`
                              : h.kind === 'conversation'
                                ? `/archive/${h.canonical_id}`
                                : `/event/${h.canonical_id}`,
                        )
                      }
                    >
                      <span className="command-hit-main">
                        <span className="command-hit-title">{truncate(h.title || h.canonical_id, 84)}</span>
                        <span
                          className="command-hit-snippet muted"
                          dangerouslySetInnerHTML={{ __html: escapeSnippet(h.snippet) }}
                        />
                      </span>
                      <span className="command-hit-kind label">{h.kind}</span>
                    </button>
                  ))}
                </section>
              )}

              {value.trim() && (
                <section className="command-group">
                  <button type="button" className="command-row command-ask" onClick={ask}>
                    <span>
                      Ask: <strong>{truncate(value.trim(), 60)}</strong>
                    </span>
                    <kbd className="mono">⌘⏎</kbd>
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnswerPanel({
  answer,
  busy,
  onOpen,
}: {
  answer: any;
  busy: boolean;
  onOpen: (id: string) => void;
}) {
  if (busy && !answer) return <p className="command-empty muted">Working</p>;
  if (!answer) return null;

  return (
    <div className="answer">
      <div className="answer-state">
        <StatusChip tone={answer.mode === 'hermes' ? 'good' : 'warning'}>
          {answer.mode === 'hermes' ? 'Hermes answered' : 'Intelligence plane not connected'}
        </StatusChip>
      </div>
      <p className="answer-message">{answer.message}</p>
      {answer.results?.length > 0 && (
        <>
          <p className="label answer-label">Exact matches, not an answer</p>
          <ul className="answer-list">
            {answer.results.map((r: Hit) => (
              <li key={`${r.kind}-${r.canonical_id}-${r.field}`}>
                <button type="button" className="answer-hit" onClick={() => onOpen(r.canonical_id)}>
                  <span className="mono answer-hit-id">{r.canonical_id}</span>
                  <span dangerouslySetInnerHTML={{ __html: escapeSnippet(r.snippet) }} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** FTS snippets arrive with << >> markers; everything else is escaped. */
function escapeSnippet(raw: string): string {
  return (raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;&lt;/g, '<mark>')
    .replace(/&gt;&gt;/g, '</mark>');
}
