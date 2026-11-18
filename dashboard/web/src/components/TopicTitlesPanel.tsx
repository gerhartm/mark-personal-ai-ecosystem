import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { categoryLabel, formatDate, plural } from '../lib/desk';

type Wording = { title: string; dek: string };
type Change = { id: string; key: string; before: Wording; after: Wording; category: string | null; ready: boolean };
type Proposal = { id: string; created_at: string; topics: number; stale: boolean; changes: Change[]; kept: number; failed: number; calls: number };
type TitlesStatus = {
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  progress?: { done: number; total: number };
  error?: string;
  proposal: Proposal | null;
  last: { at: string; changes: number } | null;
};

const busy = (status?: string) => status === 'queued' || status === 'running';

/**
 * Title refresh: proposes a new title and context line for every topic under
 * the current Topics instruction and rules, keeping wording that already
 * follows them. Mark ticks the ones he wants; nothing changes before that, and
 * the last apply can be undone.
 */
export function TopicTitlesPanel({ dirty }: { dirty: boolean }) {
  // The preview can list hundreds of titles, so the status is polled only while the refresh runs.
  const [polling, setPolling] = useState(false);
  const status = useQuery<TitlesStatus>('/prompt-controls/topics/titles', [], polling ? 4_000 : 0);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'apply' | 'undo' | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const data = status.data;
  const running = busy(data?.status);
  const proposal = data?.proposal ?? null;
  useEffect(() => setPolling(running), [running]);

  // A new preview starts with every title that can still be applied ticked.
  useEffect(() => {
    setTicked(new Set((proposal?.changes ?? []).filter((change) => change.ready).map((change) => change.id)));
    setConfirm(null);
  }, [proposal?.id]);

  const send = async (path: string, body: object, done: (result: any) => string) => {
    setSending(true);
    setMessage(null);
    try {
      const result = await api<any>(path, { method: 'POST', body: JSON.stringify(body) });
      const text = done(result);
      setMessage(text ? { text } : null);
      setConfirm(null);
      invalidate('/topics');
      invalidate('/prompt-controls/topics');
      status.refetch();
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'That did not work. Nothing was changed.', error: true });
    } finally {
      setSending(false);
    }
  };

  if (!data) return null;
  const ready = (proposal?.changes ?? []).filter((change) => change.ready);
  const chosen = ready.filter((change) => ticked.has(change.id));
  const toggle = (id: string, on: boolean) => setTicked((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  return (
    <div className="mt-6 border-t border-[var(--line)] pt-4" data-testid="topics-titles">
      <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">
        Titles and context lines: rewrite them under the current Topics instruction and rules, for example naming people by full name or firm instead of a bare first name. The refresh reads every topic with its strongest claims and the titles of their sources, and keeps wording that already follows the rules. Names and figures must come from the claims or their sources. Nothing changes until you apply the titles you tick, and the last apply can be undone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="desk-button secondary" disabled={dirty || running || sending}
          onClick={() => send('/prompt-controls/topics/titles', {}, () => '')}>
          {running ? 'Refreshing titles' : proposal ? 'Refresh again' : 'Refresh titles'}
        </button>
        {data.last && !running ? (
          confirm === 'undo' ? (
            <span className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">Put back the previous titles? A topic retitled or merged since keeps its newer wording.</span>
              <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending}
                onClick={() => send('/prompt-controls/topics/titles/undo', {}, (result) => `Put back ${plural(result.restored, 'title')}.${result.skipped ? ` ${plural(result.skipped, 'topic')} changed since and kept the newer wording.` : ''}`)}>Confirm</button>
              <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="font-mono text-[11px] text-[var(--accent-text)] underline-offset-2 hover:underline" onClick={() => setConfirm('undo')}>
              Undo the last title refresh ({plural(data.last.changes, 'title')}, {formatDate(data.last.at)})
            </button>
          )
        ) : null}
      </div>
      {running ? (
        <p role="status" className="mt-3 font-mono text-[11px] text-[var(--sage)]" data-testid="titles-progress">
          {data.status === 'queued' || !data.progress ? 'Queued. The refresh starts shortly.' : `Writing new titles: ${data.progress.done} of ${plural(data.progress.total, 'batch', 'batches')} done.`}
        </p>
      ) : null}
      {data.status === 'failed' && !running ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">{data.error}</p> : null}

      {proposal && !running ? (
        <div className="mt-4" data-testid="titles-preview">
          <p className="font-mono text-[11px] leading-relaxed text-[var(--sage)]">
            Preview from {formatDate(proposal.created_at)}: read {plural(proposal.topics, 'topic')}, {plural(proposal.changes.length, 'new title')}, {proposal.kept} already following the rules{proposal.failed ? `, ${plural(proposal.failed, 'topic')} without a usable answer (kept as they are)` : ''}. {plural(proposal.calls, 'AI call')}.
          </p>
          {proposal.stale ? <p role="alert" className="mt-2 font-mono text-[11px] text-[var(--danger-text)]">Topics were rebuilt since this preview, so it no longer applies. Refresh titles again.</p> : null}

          {proposal.changes.length ? (
            <>
              {!proposal.stale ? (
                <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] text-dim">
                  <span>{chosen.length} of {ready.length} ticked</span>
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTicked(new Set(ready.map((change) => change.id)))}>Tick all</button>
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTicked(new Set())}>Untick all</button>
                </div>
              ) : null}
              <ul className="mt-2 space-y-2">
                {proposal.changes.map((change) => (
                  <li key={change.id} className="rounded-[5px] border border-[var(--line)] px-3 py-2.5" data-testid="title-item">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input type="checkbox" className="mt-1" disabled={!change.ready || proposal.stale} checked={ticked.has(change.id)}
                        onChange={(event) => toggle(change.id, event.target.checked)} />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-foreground">{change.after.title}</span>
                        {change.after.title !== change.before.title ? <span className="mt-0.5 block font-serif text-[12.5px] text-dim">Was: {change.before.title}</span> : null}
                      </span>
                    </label>
                    <div className="mt-1.5 pl-6 font-serif text-[13px] leading-relaxed text-muted-foreground">
                      <p>{change.after.dek}</p>
                      {change.after.dek !== change.before.dek ? <p className="mt-0.5 text-[12.5px] text-dim">Was: {change.before.dek}</p> : null}
                      <p className="mt-1 font-mono text-[11px] text-dim">
                        {categoryLabel(change.category)} · <Link className="text-[var(--accent-text)] underline-offset-2 hover:underline" to={`/topics/${encodeURIComponent(change.key)}`}>Open the topic</Link>
                      </p>
                      {!change.ready ? <p className="mt-1 text-[var(--danger-text)]">This topic has changed or gone since the preview, so its new title can't be applied.</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="mt-3 font-serif text-[13.5px] text-muted-foreground">Every title already follows the rules.</p>}

          {ready.length && !proposal.stale ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {confirm === 'apply' ? (
                <span className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
                  <span className="font-mono text-[11px] text-muted-foreground">Apply {plural(chosen.length, 'new title')}? Links, claims and analysis pages stay as they are, and you can undo it.</span>
                  <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending}
                    onClick={() => send('/prompt-controls/topics/titles/apply', { accept: chosen.map((change) => change.id) },
                      (result) => `Applied ${plural(result.applied, 'new title')}.${result.skipped ? ` Skipped ${plural(result.skipped, 'topic')} that changed since the preview.` : ''}`)}>Confirm</button>
                  <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirm(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="desk-button" disabled={!chosen.length || sending} onClick={() => setConfirm('apply')}>
                  Apply {plural(chosen.length, 'new title')}
                </button>
              )}
              <button type="button" className="font-mono text-[11px] text-dim underline-offset-2 hover:underline" disabled={sending}
                onClick={() => send('/prompt-controls/topics/titles/discard', {}, () => 'Preview discarded. Nothing was changed.')}>Discard preview</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <p className={`mt-3 font-mono text-[11px] leading-relaxed ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
    </div>
  );
}
