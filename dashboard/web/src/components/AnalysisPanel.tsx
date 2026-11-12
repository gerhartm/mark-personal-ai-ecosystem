import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDate, plural } from '../lib/desk';
import { Eyebrow } from './Desk';

type TopicRef = { key: string; title: string };
type AnalysisStatus = {
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  mode?: 'sample' | 'all' | 'one';
  updated_at?: string;
  progress?: { done: number; total: number; current: string };
  written?: number;
  written_topics?: TopicRef[];
  failures?: Array<TopicRef & { reason: string }>;
  stopped?: boolean;
  error?: string;
  /** Topics with enough claims for a page, and where their pages stand. */
  pages: { topics: number; written: number; out_of_date: number; missing: number };
  remaining: number;
  next_sample: TopicRef[];
};

/**
 * Writes analysis pages in the background: five samples first, then every
 * topic whose page is missing or out of date. Each page is saved as soon as it
 * is written, so an interrupted run keeps its work.
 */
export function AnalysisPanel({ dirty }: { dirty: boolean }) {
  const [refreshMs, setRefreshMs] = useState(30_000);
  const status = useQuery<AnalysisStatus>('/prompt-controls/analysis/status', [], refreshMs);
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const data = status.data;
  const busy = data?.status === 'queued' || data?.status === 'running';
  useEffect(() => setRefreshMs(busy ? 5_000 : 30_000), [busy]);

  const start = async (mode: 'sample' | 'all') => {
    setSending(true);
    setMessage(null);
    try {
      await api('/prompt-controls/analysis/write', { method: 'POST', body: JSON.stringify({ mode }) });
      setConfirmAll(false);
      setMessage({ text: mode === 'sample' ? 'Writing sample pages. Each takes a few minutes.' : 'Writing analysis pages in the background. Each page is saved as soon as it is written.' });
      invalidate('/prompt-controls/analysis');
      status.refetch();
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'Analysis pages could not be started.', error: true });
    } finally {
      setSending(false);
    }
  };

  if (!data) return null;
  const { pages } = data;
  const samples = Math.min(5, data.remaining) || 5;
  const finished = data.status === 'ready' && data.mode !== 'one' && data.updated_at;
  const blocked = dirty || busy || sending || !data.remaining;
  return (
    <div className="mt-6 border-t border-[var(--line)] pt-4" data-testid="analysis-panel">
      <Eyebrow>Analysis pages</Eyebrow>
      <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">
        {plural(pages.topics, 'topic')} can have an analysis page: {pages.written} written{pages.out_of_date ? ` (${pages.out_of_date} out of date)` : ''}, {pages.missing} not yet.
        {' '}Each page sets out the argument, key quotes, what it means, what is contested, what to watch and how the topic connects to others, in one AI call on the analysis model. Topics jobs and automatic filing wait while pages are written.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="desk-button secondary" disabled={blocked} onClick={() => start('sample')}>
          {busy && data.mode === 'sample' ? 'Writing samples' : `Write ${plural(samples, 'sample page')}`}
        </button>
        {!confirmAll ? (
          <button type="button" className="desk-button secondary" disabled={blocked} onClick={() => setConfirmAll(true)}>
            {busy && data.mode === 'all' ? 'Writing pages' : `Write all ${data.remaining} remaining`}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
            <span className="font-mono text-[11px] text-muted-foreground">Write {plural(data.remaining, 'page')}? That is one AI call each, a few hours in the background.</span>
            <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending || busy} onClick={() => start('all')}>Confirm</button>
            <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirmAll(false)}>Cancel</button>
          </div>
        )}
      </div>
      {!busy && data.next_sample.length ? (
        <p className="mt-2 max-w-[68ch] font-mono text-[11px] leading-relaxed text-dim">Samples are the largest topics without a current page: {data.next_sample.map((topic) => topic.title).join('; ')}.</p>
      ) : null}
      {dirty ? <p className="mt-2 font-mono text-[11px] text-dim">Save or discard the instruction changes first.</p> : null}

      {busy ? (
        <p role="status" className="mt-3 font-mono text-[11px] text-[var(--sage)]" data-testid="analysis-progress">
          {data.status === 'queued' ? 'Queued. Writing starts shortly.' : data.progress ? `Writing page ${data.progress.done + 1} of ${data.progress.total}: ${data.progress.current}` : 'Writing analysis pages.'}
        </p>
      ) : null}
      {finished ? (
        <div role="status" className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--sage)]" data-testid="analysis-result">
          <p>Done {formatDate(data.updated_at)}: wrote {plural(data.written ?? 0, 'page')}.{data.stopped ? ' Stopped after Hermes gave no answer for two topics in a row; run it again to continue.' : ''}</p>
          {data.written_topics?.length ? (
            <p className="mt-1">Read them: {data.written_topics.map((topic, index) => (
              <span key={topic.key}>{index ? '; ' : ''}<Link className="text-[var(--accent-text)] underline underline-offset-2" to={`/topics/${encodeURIComponent(topic.key)}`}>{topic.title}</Link></span>
            ))}</p>
          ) : null}
          {data.failures?.length ? (
            <div className="mt-2 text-[var(--danger-text)]">
              <p>{plural(data.failures.length, 'topic')} got no usable page. Writing again retries {data.failures.length === 1 ? 'it' : 'them'}:</p>
              <ul className="mt-1 space-y-0.5">{data.failures.map((failure) => <li key={failure.key}>{failure.title}: {failure.reason}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {data.status === 'failed' ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">{data.error}</p> : null}
      {/* A started-job note shows while the job runs; once it ends, the result above takes its place. */}
      {message && (message.error || busy) ? <p className={`mt-3 font-mono text-[11px] ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
    </div>
  );
}
