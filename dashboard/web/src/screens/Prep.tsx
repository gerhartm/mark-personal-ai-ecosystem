import { useMemo, useState } from 'react';
import { api, useQuery } from '../lib/api';
import { Eyebrow, ViewHead } from '../components/Desk';
import { ExactDialog } from '../components/ExactDialog';
import { compact, formatDate, sourceKind } from '../lib/desk';

type Topic = { tag: string; event_count: number };
type EvidenceSource = {
  id: string;
  kind: 'event' | 'source';
  title: string;
  who: string;
  when: string;
  source_type: string;
  url: string;
};
type PrepPoint = {
  title: string;
  body: string;
  detail: string[];
  counter: string;
  sources: string[];
  quotes: Array<{ quote: string; speaker: string; locator: string; when: string; read: string }>;
  window: string;
  tag: string | null;
};
type PrepResult = {
  id: string;
  overview: string;
  suggested_tangents: string[];
  points: PrepPoint[];
  sources: EvidenceSource[];
};

const LENS = [
  'Tightest — only the core subject',
  'Tight — the subject and its direct edges',
  'Balanced',
  'Wide — adjacent markets and patterns',
  'Widest — analogies from other fields',
];

export function Prep() {
  const topicsQuery = useQuery<{ topics: Topic[] }>('/topics');
  const [topic, setTopic] = useState('');
  const [lens, setLens] = useState(3);
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [newTangent, setNewTangent] = useState('');
  const [lit, setLit] = useState<string[]>([]);
  const [open, setOpen] = useState<PrepPoint | null>(null);
  const [result, setResult] = useState<PrepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const queryTokens = useMemo(() => topic.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2), [topic]);
  const suggested = useMemo(() => {
    const scored = (topicsQuery.data?.topics ?? [])
      .filter((item) => item.tag.toLowerCase() !== topic.trim().toLowerCase())
      .map((item) => ({
        label: item.tag,
        score: queryTokens.reduce((sum, token) => sum + (item.tag.toLowerCase().includes(token) ? 2 : 0), 0) + Math.min(4, item.event_count / 4),
      }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 4)
      .map((item) => item.label);
    return [...new Set([...(result?.suggested_tangents ?? []), ...scored])].slice(0, 6);
  }, [queryTokens, result?.suggested_tangents, topic, topicsQuery.data]);
  const tangents = [...suggested, ...custom.filter((item) => !suggested.includes(item))];

  const toggle = (label: string) => {
    setPicked((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
    setResult(null);
  };
  const addTangent = () => {
    const value = newTangent.trim();
    if (!value) return;
    if (!custom.includes(value)) setCustom((current) => [...current, value]);
    if (!picked.includes(value)) setPicked((current) => [...current, value]);
    setNewTangent('');
    setResult(null);
  };
  const run = async () => {
    if (topic.trim().length < 3 || busy) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api<PrepResult>('/prep', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim(), lens, tangents: picked }),
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <ViewHead title="Prep" />
      <div className="mb-[22px] rounded-[7px] border-2 border-[var(--line-strong)] bg-[var(--panel)] px-4 py-[13px]">
        <label htmlFor="prep-topic" className="mb-2 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Question or topic</label>
        <input
          id="prep-topic"
          value={topic}
          onChange={(event) => { setTopic(event.target.value); setResult(null); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); run(); } }}
          placeholder="e.g. Where does fee capture land in perp DEXs?"
          className="w-full border-0 border-b border-[var(--line)] bg-transparent pb-2 font-serif text-base text-foreground placeholder:text-dim focus:border-[var(--brass)] focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Lens</span>
          <input type="range" min="1" max="5" value={lens} onChange={(event) => { setLens(Number(event.target.value)); setResult(null); }} aria-label="Lens breadth" className="h-1 w-52 cursor-pointer accent-[var(--brass)]" />
          <span className="font-mono text-[10px] text-muted-foreground">{LENS[lens - 1]}</span>
        </div>
        <div className="mt-4 border-t border-[var(--line)] pt-3.5">
          <span className="mb-2 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Tangential subjects</span>
          {topic.trim() ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {tangents.map((item) => {
                const active = picked.includes(item);
                return <button key={item} type="button" onClick={() => toggle(item)} className={`cursor-pointer rounded-[3px] border px-2 py-1 font-mono text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)] ${active ? 'border-[var(--line)] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground' : 'border-dashed border-[var(--line)] text-dim opacity-35 hover:border-[var(--brass)] hover:text-foreground'}`}>{active ? '✓ ' : '+ '}{item}</button>;
              })}
              <input value={newTangent} onChange={(event) => setNewTangent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTangent(); } }} placeholder="add a subject…" aria-label="Add a tangential subject" className="w-40 rounded-[3px] border border-dashed border-[var(--line)] bg-transparent px-2 py-1 font-mono text-[10px] text-foreground placeholder:text-dim focus:border-[var(--brass)] focus:outline-none" />
            </div>
          ) : <p className="font-mono text-[10px] text-dim">Type a question or topic above and suggested subjects appear here.</p>}
        </div>
        <div className="mt-4 flex justify-end border-t border-[var(--line)] pt-3.5">
          <button type="button" className="desk-button" onClick={run} disabled={busy || topic.trim().length < 3}>
            {busy ? 'Building from evidence' : 'Generate with Hermes'}
          </button>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-[5px] border border-[var(--rose)] px-3 py-2 font-mono text-[10px] text-[var(--rose)]" role="alert">{error}</p> : null}
      <div className="grid items-start gap-[26px] lg:grid-cols-[1fr_292px]">
        <div>
          <Eyebrow>Overview</Eyebrow>
          <div className="mb-[22px] rounded-[7px] border-l-2 border-[var(--brass)] bg-[var(--panel)] px-4 py-3.5">
            <p className="font-serif text-[17px] leading-relaxed text-pretty text-foreground">{busy ? 'Building a clear, source-backed preparation brief...' : result?.overview || 'Enter a question or topic to build a sourced preparation brief.'}</p>
          </div>
          {result?.points.length ? <Eyebrow>Supporting points · {result.points.length} at this lens</Eyebrow> : null}
          {result?.points.map((point) => (
            <button key={point.title} type="button" onClick={() => setOpen(point)} onMouseEnter={() => setLit(point.sources)} onMouseLeave={() => setLit([])} onFocus={() => setLit(point.sources)} onBlur={() => setLit([])} className="mb-1.5 block w-full cursor-pointer rounded-r-[5px] border-l-2 border-[var(--line)] px-4 py-3.5 text-left transition-colors outline-none hover:border-l-[var(--brass)] hover:bg-[var(--panel)] focus-visible:border-l-[var(--brass)] focus-visible:bg-[var(--panel)]">
              {point.tag ? <span className="mb-1.5 inline-block rounded-[3px] bg-surface-800 px-[5px] py-[1.5px] font-mono text-[9px] text-[var(--cyan)]">{point.tag}</span> : null}
              <h2 className="mb-[7px] text-[13px] font-medium text-foreground">{point.title}</h2>
              <p className="mb-[9px] font-serif text-[15px] leading-relaxed text-pretty text-foreground">{point.body}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[9.5px] text-dim">{point.sources.length} source{point.sources.length === 1 ? '' : 's'} · {compact(point.window, 46)}</span>
                <span className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-[var(--brass)]">Open · {point.quotes.length ? `${point.quotes.length} quotes` : 'detail'}</span>
              </div>
            </button>
          ))}
        </div>
        <aside className="lg:sticky lg:top-[34px]">
          <Eyebrow>Sourced from</Eyebrow>
          {!result && !busy ? <p className="font-mono text-[10px] text-dim">Sources used in the brief will appear here.</p> : null}
          {result?.sources.map((source) => {
            const on = lit.includes(source.id);
            return <div key={source.id} className={`mb-[7px] rounded-[5px] border px-3 py-2.5 transition-colors ${on ? 'border-[var(--brass)] bg-[var(--panel)]' : 'border-[var(--line)]'}`}>
              <p className={`mb-1.5 text-[11.5px] leading-snug ${on ? 'text-foreground' : 'text-muted-foreground'}`}>{compact(source.title, 100)}</p>
              <div className="font-mono text-[9.5px] text-dim">{source.who} · {sourceKind(source.source_type)}{source.when ? ` · ${formatDate(source.when)}` : ''}</div>
            </div>;
          })}
        </aside>
      </div>
      <PointDetailDialog point={open} sources={result?.sources ?? []} close={() => setOpen(null)} />
    </section>
  );
}

function PointDetailDialog({ point, sources, close }: { point: PrepPoint | null; sources: EvidenceSource[]; close: () => void }) {
  if (!point) return null;
  return (
    <ExactDialog open onOpenChange={(next) => { if (!next) close(); }} closeLabel="Close point details" accessibleTitle={point.title} labelledBy="prep-point-title">
        <div className="p-5 md:p-6">
          {point.tag ? <span className="mb-2 inline-block rounded-[3px] bg-surface-800 px-[5px] py-[1.5px] font-mono text-[9px] text-[var(--cyan)]">{point.tag}</span> : null}
          <h2 id="prep-point-title" className="pr-8 text-lg font-medium leading-snug text-heading md:text-xl">{point.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-[7px] font-mono text-[9.5px] text-dim"><span>{point.sources.length} source{point.sources.length === 1 ? '' : 's'}</span><span className="text-[var(--rule)]">/</span><span className="text-[var(--cyan)]">{compact(point.window, 80)}</span></div>
          <div className="mt-4 space-y-3">{point.detail.map((paragraph) => <p key={paragraph.slice(0, 40)} className="max-w-[64ch] font-serif text-[15.5px] leading-relaxed text-pretty text-foreground">{paragraph}</p>)}</div>
          {point.quotes.length ? <div className="mt-6 border-t-2 border-[var(--line)] pt-4"><span className="mb-3 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Direct quotes · {point.quotes.length}</span><div className="space-y-3">{point.quotes.map((quote) => <figure key={quote.quote.slice(0, 40)} className="rounded-[5px] border-l-2 border-[var(--brass)] bg-surface-800/60 px-4 py-3"><blockquote className="font-serif text-[15px] leading-relaxed text-pretty text-foreground">“{quote.quote}”</blockquote><figcaption className="mt-2 font-mono text-[10px] text-muted-foreground">{quote.speaker}{quote.locator ? ` · ${quote.locator}` : ''} · {formatDate(quote.when)}</figcaption><p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{quote.read}</p></figure>)}</div></div> : null}
          {point.counter ? <div className="mt-5 rounded-[5px] border-2 border-dashed border-[var(--line)] px-4 py-3"><span className="mb-1 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Where it's weak</span><p className="text-[12.5px] leading-snug text-foreground">{point.counter}</p></div> : null}
          <div className="mt-5 border-t-2 border-[var(--line)] pt-4"><span className="mb-2 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Sourced from</span><div className="space-y-1.5">{point.sources.map((id) => { const source = sources.find((item) => item.id === id); if (!source) return null; const body = <><p className="mb-1 text-[11.5px] leading-snug text-foreground">{source.title}</p><p className="font-mono text-[9.5px] text-dim">{source.who} · {sourceKind(source.source_type)}{source.when ? ` · ${formatDate(source.when)}` : ''}</p></>; return source.url ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-[5px] border border-[var(--line)] px-3 py-2 no-underline transition-colors hover:border-[var(--brass)]">{body}</a> : <div key={id} className="rounded-[5px] border border-[var(--line)] px-3 py-2">{body}</div>; })}</div></div>
        </div>
    </ExactDialog>
  );
}
