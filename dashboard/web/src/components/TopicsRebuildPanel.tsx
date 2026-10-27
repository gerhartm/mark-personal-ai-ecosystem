import { useEffect, useState } from 'react';
import { Eyebrow } from './Desk';
import { api, invalidate, useQuery } from '../lib/api';
import { categoryColor, categoryLabel, formatDate, plural } from '../lib/desk';

type Progress = { stage: 'categorizing' | 'grouping' | 'saving'; done: number; total: number };
type JobStatus = 'idle' | 'queued' | 'running' | 'ready' | 'failed';
type RebuildJob = {
  status: JobStatus;
  updated_at?: string;
  topic_count?: number;
  unsorted_count?: number;
  uncategorized_count?: number;
  failed_groups?: number;
  progress?: Progress;
  error?: string;
  can_undo?: boolean;
  estimate?: { claims: number; calls: number };
};
type PreviewTopic = { title: string; dek: string; description: string; category: string; claims: Array<{ text: string; source: string }> };
type PreviewJob = {
  status: JobStatus;
  updated_at?: string;
  progress?: Progress;
  error?: string;
  result: { generated_at: string; claim_count: number; failed_groups: number; unsorted: number; topics: PreviewTopic[] } | null;
};

const busy = (status?: JobStatus) => status === 'queued' || status === 'running';
const progressText = (progress?: Progress) => {
  if (!progress) return 'Starting.';
  if (progress.stage === 'saving') return 'Saving the new Topics.';
  const step = `batch ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`;
  return progress.stage === 'categorizing' ? `Sorting claims into categories: ${step}.` : `Grouping claims into topics: ${step}.`;
};

/** Preview, rebuild and undo for Topics. Preview never changes Topics; rebuild runs in the background. */
export function TopicsRebuildPanel({ dirty }: { dirty: boolean }) {
  const rebuild = useQuery<RebuildJob>('/prompt-controls/topics/rebuild/status', [], 5_000);
  const preview = useQuery<PreviewJob>('/prompt-controls/topics/preview', [], 5_000);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [sending, setSending] = useState<'preview' | 'rebuild' | 'undo' | null>(null);
  const rebuildBusy = busy(rebuild.data?.status);
  const previewBusy = busy(preview.data?.status);

  useEffect(() => {
    if (rebuild.data?.status === 'ready') invalidate('/topics');
    // A finished job replaces the "queued" note with its own result line.
    if (rebuild.data?.status === 'ready' || rebuild.data?.status === 'failed') setMessage(null);
  }, [rebuild.data?.status, rebuild.data?.updated_at]);
  useEffect(() => {
    if (preview.data?.status === 'ready' || preview.data?.status === 'failed') setMessage(null);
  }, [preview.data?.status, preview.data?.updated_at]);

  const post = async (kind: 'preview' | 'rebuild' | 'undo', path: string, done: string) => {
    setSending(kind);
    setMessage(null);
    try {
      await api(path, { method: 'POST' });
      setMessage({ text: done, error: false });
      if (kind === 'undo') { invalidate('/topics'); setConfirmUndo(false); }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'That did not work. Try again.', error: true });
    } finally {
      setSending(null);
      rebuild.refetch();
      preview.refetch();
    }
  };

  const estimate = rebuild.data?.estimate;
  const result = preview.data?.result;

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4" data-testid="topics-rebuild">
      <Eyebrow>Preview and rebuild</Eyebrow>
      {dirty ? <p className="mb-3 font-mono text-[11px] text-[var(--danger-text)]">Save the instruction first. Preview and rebuild use the saved version.</p> : null}

      <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">Preview runs the saved instruction on about 70 claims from your largest topics and shows the titles it would write. It uses a few AI calls and changes nothing.</p>
      <button type="button" className="desk-button secondary" onClick={() => post('preview', '/prompt-controls/topics/preview', 'Preview started. Results appear here in a minute or two.')} disabled={dirty || previewBusy || sending !== null}>
        {previewBusy ? 'Previewing titles' : result ? 'Preview again' : 'Preview titles'}
      </button>
      {previewBusy ? <p role="status" className="mt-3 font-mono text-[11px] text-[var(--sage)]">{progressText(preview.data?.progress)}</p> : null}
      {preview.data?.status === 'failed' ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">{preview.data.error}</p> : null}
      {result && !previewBusy ? (
        <div className="mt-4 rounded-[5px] border border-[var(--line)] p-3" data-testid="topics-preview">
          <p className="mb-3 font-mono text-[11px] leading-relaxed text-dim">
            Preview from {formatDate(result.generated_at)}: {plural(result.topics.length, 'topic')} from {plural(result.claim_count, 'claim')}
            {result.unsorted ? `, ${plural(result.unsorted, 'claim')} left waiting` : ''}{result.failed_groups ? `, ${plural(result.failed_groups, 'batch', 'batches')} could not be grouped` : ''}. Nothing was changed.
          </p>
          <ul className="space-y-2">
            {result.topics.map((topic, index) => (
              <li key={`${index}-${topic.title}`} className="rounded-[5px] bg-surface-800/50 px-3 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  <span aria-hidden="true" className="size-[6px] rounded-full" style={{ background: categoryColor(topic.category) }} />
                  {categoryLabel(topic.category)}
                </p>
                <p className="text-[14px] leading-snug font-medium text-foreground">{topic.title}</p>
                <p className="mt-1 font-serif text-[13.5px] leading-relaxed text-muted-foreground">{topic.dek}</p>
                <details className="mt-1.5 text-[12.5px] text-muted-foreground">
                  <summary className="cursor-pointer font-mono text-[11px] text-dim">{plural(topic.claims.length, 'claim')} behind this title</summary>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {topic.claims.map((claim, claimIndex) => <li key={claimIndex}>{claim.text} <span className="font-mono text-[11px] text-dim">· {claim.source}</span></li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[var(--line)] pt-4">
        <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">
          Rebuild regroups, recategorizes and retitles {estimate ? `all ${estimate.claims.toLocaleString('en-US')} claims` : 'every claim'} into the 13 categories{estimate ? `, using about ${estimate.calls} AI calls (a few more if some answers need a retry)` : ''}. It runs in the background, so you can leave this page. Current Topics stay visible until it finishes. If Hermes stops responding, nothing is changed, and a finished rebuild can be undone.
        </p>
        <button type="button" className="desk-button" onClick={() => post('rebuild', '/prompt-controls/topics/rebuild', 'Rebuild queued. Progress is saved here.')} disabled={dirty || rebuildBusy || sending !== null}>
          {rebuildBusy ? 'Rebuilding Topics' : rebuild.data?.status === 'failed' ? 'Retry rebuild' : 'Rebuild Topics'}
        </button>
        {rebuild.error ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">Rebuild status is unavailable. Refresh to check before retrying.</p> : null}
        {rebuildBusy ? <p role="status" className="mt-3 font-mono text-[11px] text-[var(--sage)]">{rebuild.data?.status === 'queued' ? 'Queued. The rebuild starts shortly.' : progressText(rebuild.data?.progress)}</p> : null}
        {rebuild.data?.status === 'ready' ? (
          <p role="status" className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--sage)]">
            Done: {plural(rebuild.data.topic_count ?? 0, 'topic')} live{rebuild.data.unsorted_count ? `, ${plural(rebuild.data.unsorted_count, 'claim')} waiting for a topic` : ''}.
            {rebuild.data.failed_groups ? ` ${plural(rebuild.data.failed_groups, 'batch', 'batches')} could not be grouped; those claims wait under their categories.` : ''}
            {rebuild.data.uncategorized_count ? ` ${plural(rebuild.data.uncategorized_count, 'claim')} could not be categorized; the next rebuild retries them.` : ''}
          </p>
        ) : null}
        {rebuild.data?.status === 'failed' ? <p role="alert" className="mt-3 font-mono text-[11px] text-[var(--danger-text)]">{rebuild.data.error}</p> : null}

        {rebuild.data?.can_undo && !rebuildBusy ? (
          <div className="mt-4">
            {!confirmUndo ? (
              <button type="button" className="font-mono text-[11px] text-[var(--accent-text)] underline-offset-2 hover:underline" onClick={() => setConfirmUndo(true)}>Undo last rebuild</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
                <span className="font-mono text-[11px] text-muted-foreground">Restore the previous Topics and categories?</span>
                <button type="button" className="font-mono text-[11px] text-[var(--accent-text)]" disabled={sending !== null} onClick={() => post('undo', '/prompt-controls/topics/rebuild/undo', 'The previous Topics and categories are back.')}>Confirm</button>
                <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setConfirmUndo(false)}>Cancel</button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {message ? <p className={`mt-4 rounded-[5px] border px-3 py-2 font-mono text-[11px] leading-relaxed ${message.error ? 'border-[var(--rose)] text-[var(--danger-text)]' : 'border-[var(--line)] text-[var(--sage)]'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
    </div>
  );
}
