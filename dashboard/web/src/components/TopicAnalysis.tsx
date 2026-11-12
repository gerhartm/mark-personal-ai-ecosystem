import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useQuery } from '../lib/api';
import { categoryColor, compact, formatDate, plural } from '../lib/desk';
import { Eyebrow } from './Desk';

type Point = { text: string; claims: string[] };
type Quote = { claim: string; text: string; speaker: string | null };
type Connection = { topic: string; relation: string; text: string; title: string; category: string };
export type Analysis = {
  topic_key: string;
  generated_at: string;
  claims: string[];
  thesis: string;
  points: Point[];
  counterpoints: Point[];
  quotes: Quote[];
  meaning: string;
  why_it_matters: string;
  contested: string;
  watch: string[];
  connections: Connection[];
  new_claims: number;
  removed_claims: number;
  out_of_date: boolean;
};
export type CitedClaim = { text: string; source: string; date: string };
type AnalysisJob = {
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  mode?: 'sample' | 'all' | 'one';
  topic?: string;
  progress?: { done: number; total: number; current: string };
  failures?: Array<{ key: string; title: string; reason: string }>;
  error?: string;
  updated_at?: string;
};

const RELATION_LABELS: Record<string, string> = {
  same_mechanism: 'Same mechanism',
  tension: 'In tension',
  cause: 'Leads to',
  effect: 'Follows from',
  context: 'Context',
};

/**
 * The topic's analysis page: the argument in outline, key quotes, what it
 * means, what is contested, what to watch, and connections to other topics.
 * Numbered marks after each point lead to the claims it rests on below.
 */
export function TopicAnalysisSection({ tag, analysis, claimCount, claimsByRef, onCite, onWritten }: {
  tag: string;
  analysis: Analysis | null;
  claimCount: number;
  claimsByRef: Map<string, CitedClaim>;
  onCite: (ref: string) => void;
  onWritten: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [watching, setWatching] = useState(false);
  const job = useQuery<AnalysisJob>('/prompt-controls/analysis/status', [], watching ? 5_000 : 60_000);
  const busy = job.data?.status === 'queued' || job.data?.status === 'running';
  const writingThis = busy && job.data?.mode === 'one' && job.data.topic === tag;

  // When a rewrite of this topic finishes, say how it went and reload the page's data once.
  const [seenBusy, setSeenBusy] = useState(false);
  useEffect(() => {
    if (writingThis) { setSeenBusy(true); setWatching(true); return; }
    if (!seenBusy || busy) return;
    setSeenBusy(false);
    setWatching(false);
    const failure = job.data?.failures?.find((item) => item.key === tag);
    setMessage(failure ? { text: `The analysis was not written. ${failure.reason}`, error: true }
      : job.data?.status === 'failed' ? { text: job.data.error ?? 'The analysis was not written.', error: true }
        : { text: 'Analysis written.' });
    onWritten();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writingThis, busy, job.data?.status, job.data?.updated_at]);

  const write = async () => {
    setSending(true);
    setMessage(null);
    try {
      await api(`/topics/${encodeURIComponent(tag)}/analysis`, { method: 'POST', body: '{}' });
      setWatching(true);
      setMessage({ text: 'Writing the analysis. It usually takes a minute or two; this page updates when it is done.' });
      job.refetch();
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The analysis could not be started.', error: true });
    } finally {
      setSending(false);
    }
  };

  // Each cited claim gets one number, in the order the analysis first cites it.
  const numbers = useMemo(() => {
    const order = new Map<string, number>();
    const add = (ref: string) => { if (claimsByRef.has(ref) && !order.has(ref)) order.set(ref, order.size + 1); };
    for (const point of [...(analysis?.points ?? []), ...(analysis?.counterpoints ?? [])]) point.claims.forEach(add);
    for (const quote of analysis?.quotes ?? []) add(quote.claim);
    return order;
  }, [analysis, claimsByRef]);

  const Cites = ({ refs }: { refs: string[] }) => (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {refs.filter((ref) => numbers.has(ref)).map((ref) => {
        const claim = claimsByRef.get(ref)!;
        return (
          <button key={ref} type="button" onClick={() => onCite(ref)} title={`${compact(claim.text, 140)} (${claim.source})`}
            aria-label={`Claim ${numbers.get(ref)}: ${compact(claim.text, 140)}`}
            className="cursor-pointer rounded-[3px] bg-surface-800 px-[5px] py-[1px] font-mono text-[10.5px] leading-none text-[var(--accent-text)] hover:bg-[var(--panel-2)]">
            {numbers.get(ref)}
          </button>
        );
      })}
    </span>
  );

  if (!analysis) {
    if (claimCount < 2) return null;
    return (
      <div className="mb-7 rounded-[6px] border border-dashed border-[var(--line-strong)] px-4 py-3.5" data-testid="topic-analysis-empty">
        <Eyebrow>Analysis</Eyebrow>
        <p className="mb-3 max-w-[66ch] font-serif text-[14px] leading-relaxed text-muted-foreground">No analysis yet. It sets out the argument, the key quotes, what it means, what is contested and how this topic connects to others, using only the claims below.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="desk-button secondary" disabled={sending || busy} onClick={write}>{writingThis ? 'Writing analysis' : 'Write analysis'}</button>
          <span className="font-mono text-[11px] text-dim">{busy && !writingThis ? 'Analysis pages are being written; try again when they finish.' : 'One AI call, a minute or two.'}</span>
        </div>
        {message ? <p role={message.error ? 'alert' : 'status'} className={`mt-3 font-mono text-[11px] ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`}>{message.text}</p> : null}
      </div>
    );
  }

  const heading = 'mb-1.5 font-mono text-[11px] tracking-[0.1em] text-dim uppercase';
  const body = 'max-w-[72ch] font-serif text-[15px] leading-relaxed text-pretty text-foreground';
  return (
    <section className="mb-8 rounded-[7px] border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-4 md:px-5" data-testid="topic-analysis" aria-labelledby="analysis-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-[var(--line)] pb-3">
        <h2 id="analysis-heading" className="font-mono text-[11.5px] tracking-[0.12em] text-[var(--accent-text)] uppercase">Analysis</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-dim">
          <span>Written {formatDate(analysis.generated_at)} from {plural(analysis.claims.length, 'claim')}</span>
          {analysis.new_claims ? <span className={analysis.out_of_date ? 'text-[var(--accent-text)]' : ''} data-testid="analysis-new-claims">· {plural(analysis.new_claims, 'claim')} added since</span> : null}
          <button type="button" className="cursor-pointer text-[var(--accent-text)] underline-offset-2 hover:underline disabled:cursor-wait disabled:text-dim" disabled={sending || busy} onClick={write}>
            {writingThis ? 'Rewriting' : analysis.out_of_date ? 'Rewrite with new claims' : 'Rewrite'}
          </button>
        </p>
      </div>

      <div className="mb-5">
        <p className={heading}>The argument</p>
        <p className="mb-3 max-w-[70ch] font-serif text-[17px] leading-relaxed text-pretty text-foreground" data-testid="analysis-thesis">{analysis.thesis}</p>
        <ol className="max-w-[72ch] space-y-2 pl-0">
          {analysis.points.map((point, index) => (
            <li key={index} className="flex gap-2.5 font-serif text-[15px] leading-relaxed text-foreground">
              <span aria-hidden="true" className="mt-[3px] font-mono text-[11px] text-[var(--brass)]">{index + 1}.</span>
              <span>{point.text}<Cites refs={point.claims} /></span>
            </li>
          ))}
        </ol>
        {analysis.counterpoints.length ? (
          <div className="mt-4">
            <p className={heading}>Pushback</p>
            <ul className="max-w-[72ch] space-y-2">
              {analysis.counterpoints.map((point, index) => (
                <li key={index} className="border-l-2 border-[var(--rose)] pl-3 font-serif text-[15px] leading-relaxed text-foreground">{point.text}<Cites refs={point.claims} /></li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {analysis.quotes.length ? (
        <div className="mb-5">
          <p className={heading}>Key quotes</p>
          <div className="space-y-3">
            {analysis.quotes.map((quote, index) => {
              const claim = claimsByRef.get(quote.claim);
              return (
                <figure key={index} className="max-w-[72ch] border-l-2 border-[var(--brass)] pl-3.5" data-testid="analysis-quote">
                  <blockquote className="font-serif text-[15.5px] leading-relaxed text-pretty text-foreground italic">“{quote.text}”</blockquote>
                  <figcaption className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-dim">
                    {quote.speaker ? <span className="text-muted-foreground">{quote.speaker}</span> : null}
                    {claim ? <span>{quote.speaker ? '· ' : ''}{compact(claim.source, 80)}{claim.date ? ` · ${formatDate(claim.date)}` : ''}</span> : null}
                    <Cites refs={[quote.claim]} />
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        <div><p className={heading}>What it means</p><p className={body}>{analysis.meaning}</p></div>
        <div><p className={heading}>Why it matters</p><p className={body}>{analysis.why_it_matters}</p></div>
        <div><p className={heading}>What is contested</p><p className={body}>{analysis.contested}</p></div>
        {analysis.watch.length ? (
          <div>
            <p className={heading}>What to watch</p>
            <ul className="space-y-1.5">
              {analysis.watch.map((item, index) => <li key={index} className="flex gap-2 font-serif text-[15px] leading-relaxed text-foreground"><span aria-hidden="true" className="text-[var(--brass)]">→</span><span>{item}</span></li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {analysis.connections.length ? (
        <div className="mb-4" data-testid="analysis-connections">
          <p className={heading}>Connections</p>
          <ul className="space-y-2.5">
            {analysis.connections.map((connection) => (
              <li key={connection.topic} className="max-w-[72ch]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-[3px] bg-surface-800 px-1.5 py-[1px] font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground uppercase">{RELATION_LABELS[connection.relation] ?? connection.relation}</span>
                  <span aria-hidden="true" className="size-[7px] rounded-full" style={{ background: categoryColor(connection.category) }} />
                  <Link to={`/topics/${encodeURIComponent(connection.topic)}`} className="text-[14.5px] font-medium text-foreground underline decoration-[var(--line-strong)] underline-offset-2 hover:decoration-current">{connection.title}</Link>
                </p>
                <p className="mt-1 font-serif text-[14.5px] leading-relaxed text-muted-foreground">{connection.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-[var(--line)] pt-3 font-mono text-[10.5px] leading-relaxed text-dim">
        Analysis is Hermes&apos;s interpretation of the claims below. Its facts, figures and quotes come only from them; the numbers lead to the claims each point rests on.
      </p>
      {message ? <p role={message.error ? 'alert' : 'status'} className={`mt-2 font-mono text-[11px] ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`}>{message.text}</p> : null}
    </section>
  );
}
