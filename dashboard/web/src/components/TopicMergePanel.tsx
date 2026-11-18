import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { categoryLabel, formatDate, plural } from '../lib/desk';

type TopicRef = { key: string; title: string | null; category: string | null; claims: number; gone?: boolean };
type Merge = { id: string; keys: string[]; title: string; dek: string; category: string; reason: string; claims: number; sources: number; topics: TopicRef[]; ready: boolean };
type Proposal = {
  id: string;
  created_at: string;
  topics: number;
  stale: boolean;
  merges: Merge[];
  related: Array<{ subject: string; topics: TopicRef[] }>;
  names: Array<{ seen: string; likely: string; topics: TopicRef[] }>;
  rejected: Array<{ reason: string; topics: TopicRef[] }>;
  failed: number;
  calls: number;
};
type MergeStatus = {
  status: 'idle' | 'queued' | 'running' | 'ready' | 'failed';
  progress?: { stage: 'reading' | 'checking' | 'saving'; done: number; total: number };
  error?: string;
  proposal: Proposal | null;
  last: { at: string; merges: number } | null;
};

const busy = (status?: string) => status === 'queued' || status === 'running';

function progressText(progress?: MergeStatus['progress']) {
  if (!progress) return 'Starting.';
  if (progress.stage === 'reading') return 'Reading every topic together to find duplicates. This takes a few minutes.';
  if (progress.stage === 'checking') return `Checking each proposed merge against all its claims: ${progress.done} of ${progress.total} done.`;
  return 'Saving the preview.';
}

const TopicLink = ({ topic }: { topic: TopicRef }) => topic.gone
  ? <span className="text-dim line-through">a topic that no longer exists</span>
  : <><Link className="text-[var(--accent-text)] underline-offset-2 hover:underline" to={`/topics/${encodeURIComponent(topic.key)}`}>{topic.title}</Link> <span className="text-dim">({categoryLabel(topic.category)}, {plural(topic.claims, 'claim')})</span></>;

const TopicList = ({ topics }: { topics: TopicRef[] }) => <>{topics.map((topic, index) => <span key={topic.key}>{index ? '; ' : ''}<TopicLink topic={topic} /></span>)}</>;

const sameTopics = (a: TopicRef[], b: TopicRef[]) => a.length === b.length && a.every((topic) => b.some((other) => other.key === topic.key));

/**
 * Duplicate topics: one search reads every topic together and checks each
 * proposed merge against all its claims. Mark ticks the merges he wants and
 * applies them; nothing changes before that, and the last merge can be undone.
 */
export function TopicMergePanel({ dirty }: { dirty: boolean }) {
  const status = useQuery<MergeStatus>('/prompt-controls/topics/merge', [], 5_000);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'apply' | 'undo' | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const data = status.data;
  const running = busy(data?.status);
  const proposal = data?.proposal ?? null;

  // A new preview starts with every merge that can still be applied ticked.
  useEffect(() => {
    setTicked(new Set((proposal?.merges ?? []).filter((merge) => merge.ready).map((merge) => merge.id)));
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
  const ready = (proposal?.merges ?? []).filter((merge) => merge.ready);
  const chosen = ready.filter((merge) => ticked.has(merge.id));
  const removed = chosen.reduce((sum, merge) => sum + merge.topics.length - 1, 0);
  // A merge the check turned down is linked as related; it is listed once, with the check's reason.
  const turnedDown = proposal?.rejected ?? [];
  const linkedOnly = (proposal?.related ?? []).filter((group) => !turnedDown.some((entry) => sameTopics(entry.topics, group.topics)));
  const isLinked = (topics: TopicRef[]) => (proposal?.related ?? []).some((group) => sameTopics(group.topics, topics));
  return (
    <div className="mt-6 border-t border-[var(--line)] pt-4" data-testid="topics-merge">
      <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">
        Duplicate topics: the same story split into several topics, often across categories, because Topics were once built one category at a time. The search reads every topic together and proposes merges, then checks each one against all of its claims. It also links topics about one subject from different angles, and lists names that look mistranscribed. Nothing changes until you apply the merges you tick, and the last merge can be undone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="desk-button secondary" disabled={dirty || running || sending}
          onClick={() => send('/prompt-controls/topics/merge', {}, () => '')}>
          {running ? 'Finding duplicate topics' : proposal ? 'Search again' : 'Find duplicate topics'}
        </button>
        {data.last && !running ? (
          confirm === 'undo' ? (
            <span className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">Split the last merge back into its topics? Claims filed into a merged topic since then stay with it.</span>
              <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending}
                onClick={() => send('/prompt-controls/topics/merge/undo', {}, (result) => `Put back the topics from ${plural(result.restored, 'merge')}.`)}>Confirm</button>
              <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="font-mono text-[11px] text-[var(--accent-text)] underline-offset-2 hover:underline" onClick={() => setConfirm('undo')}>
              Undo the last merge ({plural(data.last.merges, 'group')}, {formatDate(data.last.at)})
            </button>
          )
        ) : null}
      </div>
      {running ? <p role="status" className="mt-3 font-mono text-[11px] text-[var(--sage)]" data-testid="merge-progress">{data.status === 'queued' ? 'Queued. The search starts shortly.' : progressText(data.progress)}</p> : null}
      {data.status === 'failed' && !running ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">{data.error}</p> : null}

      {proposal && !running ? (
        <div className="mt-4" data-testid="merge-preview">
          <p className="font-mono text-[11px] leading-relaxed text-[var(--sage)]">
            Preview from {formatDate(proposal.created_at)}: read {plural(proposal.topics, 'topic')}, {plural(proposal.merges.length, 'merge')} confirmed by both checks{turnedDown.length ? `, ${plural(turnedDown.length, 'proposed merge')} turned down` : ''}{proposal.failed ? `, ${plural(proposal.failed, 'check')} without an answer` : ''}. {plural(proposal.calls, 'AI call')}.
          </p>
          {proposal.stale ? <p role="alert" className="mt-2 font-mono text-[11px] text-[var(--danger-text)]">Topics were rebuilt since this preview, so it no longer applies. Search again.</p> : null}

          {proposal.merges.length ? (
            <ul className="mt-3 space-y-2.5">
              {proposal.merges.map((merge) => (
                <li key={merge.id} className="rounded-[5px] border border-[var(--line)] px-3 py-2.5" data-testid="merge-item">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-1" disabled={!merge.ready || proposal.stale} checked={ticked.has(merge.id)}
                      onChange={(event) => setTicked((current) => { const next = new Set(current); if (event.target.checked) next.add(merge.id); else next.delete(merge.id); return next; })} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-foreground">{merge.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-dim">{categoryLabel(merge.category)} · {plural(merge.claims, 'claim')} from {plural(merge.sources, 'source')}</span>
                    </span>
                  </label>
                  <div className="mt-2 pl-6 font-serif text-[13px] leading-relaxed text-muted-foreground">
                    <p>Merges: <TopicList topics={merge.topics} />.</p>
                    {merge.reason ? <p className="mt-1">Why: {merge.reason}</p> : null}
                    {!merge.ready ? <p className="mt-1 text-[var(--danger-text)]">A topic in this merge has changed or gone since the search, so it can't be applied.</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 font-serif text-[13.5px] text-muted-foreground">No duplicate topics were found.</p>}

          {turnedDown.length ? (
            <details className="mt-3 font-serif text-[13px] leading-relaxed text-muted-foreground" data-testid="merge-turned-down">
              <summary className="cursor-pointer font-mono text-[11px] text-dim">{plural(turnedDown.length, 'proposed merge')} turned down after checking every claim</summary>
              <ul className="mt-2 space-y-1.5">{turnedDown.map((group, index) => (
                <li key={index}><TopicList topics={group.topics} />. {group.reason}{isLinked(group.topics) ? ' Linked as related topics instead.' : ''}</li>
              ))}</ul>
            </details>
          ) : null}
          {linkedOnly.length ? (
            <details className="mt-2 font-serif text-[13px] leading-relaxed text-muted-foreground" data-testid="merge-related">
              <summary className="cursor-pointer font-mono text-[11px] text-dim">{plural(linkedOnly.length, 'related group')}: kept separate and linked, so analysis pages connect them</summary>
              <ul className="mt-2 space-y-1.5">{linkedOnly.map((group, index) => (
                <li key={index}><span className="text-foreground">{group.subject}</span>: <TopicList topics={group.topics} /></li>
              ))}</ul>
            </details>
          ) : null}
          {proposal.names.length ? (
            <details className="mt-2 font-serif text-[13px] leading-relaxed text-muted-foreground" data-testid="merge-names">
              <summary className="cursor-pointer font-mono text-[11px] text-dim">{plural(proposal.names.length, 'name')} that may be mistranscribed (shown for checking; nothing is changed)</summary>
              <ul className="mt-2 space-y-1.5">{proposal.names.map((name, index) => (
                <li key={index}>"{name.seen}" may be "{name.likely}", in <TopicList topics={name.topics} /></li>
              ))}</ul>
            </details>
          ) : null}

          {ready.length && !proposal.stale ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {confirm === 'apply' ? (
                <span className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
                  <span className="font-mono text-[11px] text-muted-foreground">Merge {plural(chosen.length, 'group')}, turning {plural(chosen.length + removed, 'topic')} into {chosen.length}? Old links open the merged topic, and you can undo it.</span>
                  <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending}
                    onClick={() => send('/prompt-controls/topics/merge/apply', { accept: chosen.map((merge) => merge.id) },
                      (result) => `Merged ${plural(result.merged, 'group')}: ${plural(result.merged + result.removed, 'topic')} became ${result.merged}. ${plural(result.topics, 'topic')} now.${result.skipped?.length ? ` Skipped ${plural(result.skipped.length, 'merge')} that would pass 60 claims.` : ''} Their analysis pages are now out of date.`)}>Confirm</button>
                  <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirm(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="desk-button" disabled={!chosen.length || sending} onClick={() => setConfirm('apply')}>
                  Apply {plural(chosen.length, 'merge')}
                </button>
              )}
              <button type="button" className="font-mono text-[11px] text-dim underline-offset-2 hover:underline" disabled={sending}
                onClick={() => send('/prompt-controls/topics/merge/discard', {}, () => 'Preview discarded. Nothing was changed.')}>Discard preview</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <p className={`mt-3 font-mono text-[11px] leading-relaxed ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
    </div>
  );
}
