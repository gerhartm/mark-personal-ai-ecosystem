import { DailyIntelligence } from '../components/DailyIntelligence';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState, Eyebrow, LoadingRows, ViewHead } from '../components/Desk';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDate } from '../lib/desk';

type Control = {
  id: string;
  label: string;
  purpose: string;
  mode: 'generated' | 'evidence';
  application: string;
  instructions: string;
  default_instructions: string;
  customized: boolean;
  revision: number;
  updated_at: string | null;
  updated_by: string | null;
};

type Revision = {
  page_id: string;
  revision: number;
  instructions: string;
  actor: string;
  action: 'save' | 'restore';
  created_at: string;
};

type TopicJob = { status: 'idle' | 'queued' | 'running' | 'ready' | 'failed'; updated_at?: string; topic_count?: number; error?: string };

const MAX_LENGTH = 4_000;
const MIN_LENGTH = 80;

export function ControlCenter() {
  const controls = useQuery<{ controls: Control[] }>('/prompt-controls');
  const topicJob = useQuery<TopicJob>('/prompt-controls/topics/rebuild/status', [], 5_000);
  const rebuildBusy = topicJob.data?.status === 'queued' || topicJob.data?.status === 'running';
  const [selected, setSelected] = useState('topics');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'restoring' | 'rebuilding' | 'rebuilt' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const history = useQuery<{ history: Revision[] }>(`/prompt-controls/${selected}/history`, [selected]);
  const control = controls.data?.controls.find((item) => item.id === selected) ?? null;
  const draft = control ? (drafts[control.id] ?? control.instructions) : '';
  const dirty = Boolean(control && control.mode === 'generated' && draft !== control.instructions);
  const valid = draft.trim().length >= MIN_LENGTH && draft.trim().length <= MAX_LENGTH;

  useEffect(() => {
    setState('idle');
    setMessage('');
    setConfirmRestore(false);
  }, [selected]);

  useEffect(() => {
    if (topicJob.data?.status === 'ready') invalidate('/topics');
  }, [topicJob.data?.status, topicJob.data?.updated_at]);

  const updated = useMemo(() => {
    if (!control?.updated_at) return 'Default instruction';
    return `Revision ${control.revision} saved ${formatDate(control.updated_at)}`;
  }, [control]);

  const refresh = () => {
    invalidate('/prompt-controls');
    controls.refetch();
    history.refetch();
  };

  const save = async () => {
    if (!control || !dirty || !valid || state === 'saving') return;
    setState('saving');
    setMessage('');
    try {
      const saved = await api<Control>(`/prompt-controls/${control.id}`, {
        method: 'PUT',
        body: JSON.stringify({ instructions: draft.trim() }),
      });
      setDrafts((current) => ({ ...current, [control.id]: saved.instructions }));
      setState('saved');
      setMessage('Instruction saved. It will be used by the next relevant generation.');
      refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The instruction could not be saved.');
    }
  };

  const restore = async () => {
    if (!control || state === 'restoring') return;
    setState('restoring');
    setMessage('');
    try {
      const saved = await api<Control>(`/prompt-controls/${control.id}/restore`, { method: 'POST' });
      setDrafts((current) => ({ ...current, [control.id]: saved.instructions }));
      setState('saved');
      setMessage('The default instruction has been restored as a new revision.');
      setConfirmRestore(false);
      refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The default instruction could not be restored.');
    }
  };

  const rebuild = async () => {
    if (!control || control.id !== 'topics' || dirty || state === 'rebuilding' || rebuildBusy) return;
    setState('rebuilding');
    setMessage('');
    try {
      await api<TopicJob>('/prompt-controls/topics/rebuild', { method: 'POST' });
      topicJob.refetch();
      setState('idle');
      setMessage('Topic rebuild queued. You can leave this page; progress is saved here.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Topics could not be rebuilt.');
    }
  };

  if (controls.loading && !controls.data) return <LoadingRows rows={7} />;
  if (controls.error) return <ErrorState error={controls.error} retry={controls.refetch} />;

  return (
    <section>
      <ViewHead title="Control center">Review and fine tune the instructions that shape generated content. Source records, citations, validation, and evidence rules remain fixed.</ViewHead>
      <DailyIntelligence />
      <div className="grid overflow-hidden rounded-[7px] border-2 border-[var(--line-strong)] bg-[var(--panel)] md:grid-cols-[196px_1fr]" data-testid="control-center">
        <aside className="border-b border-[var(--line)] p-2.5 md:border-r md:border-b-0">
          <Eyebrow>Pages</Eyebrow>
          <div className="flex gap-1 overflow-x-auto md:block">
            {(controls.data?.controls ?? []).map((item) => {
              const active = selected === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(item.id)}
                  className={`min-w-max rounded-[5px] px-3 py-2.5 text-left transition-colors md:mb-1 md:block md:w-full ${active ? 'bg-surface-800 text-foreground' : 'text-muted-foreground hover:bg-surface-800/60 hover:text-foreground'}`}
                >
                  <span className="block text-[12.5px] font-medium">{item.label}</span>
                  <span className={`mt-1 block font-mono text-[8.5px] tracking-[0.08em] uppercase ${item.mode === 'generated' ? 'text-[var(--brass)]' : 'text-dim'}`}>{item.mode === 'generated' ? `Revision ${item.revision}` : 'Evidence only'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-4 md:p-6">
          {control ? (
            <>
              <div className="mb-5 border-b border-[var(--line)] pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-medium tracking-tight text-foreground">{control.label}</h2>
                    <p className="mt-1 max-w-[66ch] font-serif text-[14.5px] leading-relaxed text-muted-foreground">{control.purpose}</p>
                  </div>
                  <span className="font-mono text-[9px] text-dim">{updated}</span>
                </div>
                <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-[var(--cyan)]">{control.application}</p>
              </div>

              {control.mode === 'generated' ? (
                <>
                  <label htmlFor="page-instructions" className="mb-2 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Page instructions</label>
                  <textarea
                    id="page-instructions"
                    value={draft}
                    onChange={(event) => {
                      setDrafts((current) => ({ ...current, [control.id]: event.target.value }));
                      setState('idle');
                      setMessage('');
                      setConfirmRestore(false);
                    }}
                    className="min-h-[250px] w-full resize-y rounded-[5px] border border-[var(--line-strong)] bg-background px-3.5 py-3 font-serif text-[15px] leading-relaxed text-foreground placeholder:text-dim focus:border-[var(--brass)] focus:outline-none"
                    aria-describedby="instruction-limit"
                  />
                  <div id="instruction-limit" className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] text-dim">
                    <span>{dirty ? 'Unsaved changes' : control.customized ? 'Custom instruction active' : 'Default instruction active'}</span>
                    <span className={!valid ? 'text-[var(--rose)]' : ''}>{draft.trim().length} / {MAX_LENGTH}</span>
                  </div>

                  <div className="mt-5 rounded-[5px] border border-[var(--line)] bg-surface-800/50 px-3.5 py-3">
                    <span className="mb-1.5 block font-mono text-[9px] tracking-[0.1em] uppercase text-dim">Fixed evidence contract</span>
                    <p className="font-serif text-[13.5px] leading-relaxed text-muted-foreground">Editable instructions can shape organization, emphasis, tone, and structure. They cannot disable source grounding, citation checks, format validation, or the rule against invented claims.</p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                    <button type="button" className="desk-button" onClick={save} disabled={!dirty || !valid || state === 'saving'}>{state === 'saving' ? 'Saving' : 'Save instructions'}</button>
                    {!confirmRestore ? (
                      <button type="button" className="desk-button secondary" onClick={() => setConfirmRestore(true)} disabled={state === 'saving' || state === 'restoring'}>Restore default</button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[var(--line)] px-2.5 py-2">
                        <span className="font-mono text-[9px] text-muted-foreground">Restore the original instruction?</span>
                        <button type="button" className="font-mono text-[9px] text-[var(--brass)]" onClick={restore}>Confirm</button>
                        <button type="button" className="font-mono text-[9px] text-dim" onClick={() => setConfirmRestore(false)}>Cancel</button>
                      </div>
                    )}
                  </div>

                  {control.id === 'topics' ? (
                    <div className="mt-5 border-t border-[var(--line)] pt-4">
                      <Eyebrow>Apply organization</Eyebrow>
                      <p className="mb-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">Rebuild Topics after saving. Hermes reviews the collection in batches and validates every event reference. Larger collections can take several minutes. Progress is saved, so you can leave this page and return later.</p>
                      <button type="button" className="desk-button secondary" onClick={rebuild} disabled={dirty || rebuildBusy || state === 'rebuilding'}>{rebuildBusy || state === 'rebuilding' ? 'Rebuilding Topics' : topicJob.data?.status === 'failed' ? 'Retry topic rebuild' : 'Rebuild Topics'}</button>
                      {topicJob.error ? <p role="alert" className="mt-3 font-mono text-[9.5px] text-[var(--rose)]">Rebuild status is unavailable. Refresh to check before retrying.</p> : null}
                      {topicJob.data?.status !== 'idle' && topicJob.data ? <p role={topicJob.data.status === 'failed' ? 'alert' : 'status'} className={`mt-3 font-mono text-[9.5px] leading-relaxed ${topicJob.data.status === 'failed' ? 'text-[var(--rose)]' : 'text-[var(--sage)]'}`}>
                        {topicJob.data.status === 'queued' ? 'Queued. The rebuild will start shortly.' : topicJob.data.status === 'running' ? 'Rebuilding the topic organization. The current Topics remain available.' : topicJob.data.status === 'ready' ? `${topicJob.data.topic_count} focused topics are now live.` : topicJob.data.error}
                      </p> : null}
                    </div>
                  ) : null}

                  {message ? <p className={`mt-4 rounded-[5px] border px-3 py-2 font-mono text-[9.5px] leading-relaxed ${state === 'error' ? 'border-[var(--rose)] text-[var(--rose)]' : 'border-[var(--line)] text-[var(--sage)]'}`} role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}

                  <div className="mt-7 border-t-2 border-[var(--line)] pt-5">
                    <Eyebrow>Change history</Eyebrow>
                    {history.loading && !history.data ? <LoadingRows rows={3} /> : null}
                    {history.error ? <ErrorState error={history.error} retry={history.refetch} /> : null}
                    {!history.loading && !history.error && !(history.data?.history.length) ? <p className="font-mono text-[9.5px] text-dim">No custom revisions yet. The code-owned default is active.</p> : null}
                    <ol className="space-y-1.5">
                      {(history.data?.history ?? []).map((revision) => (
                        <li key={revision.revision} className="rounded-[5px] border border-[var(--line)] px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] text-dim">
                            <span className="text-[var(--brass)]">Revision {revision.revision} · {revision.action}</span>
                            <span>{formatDate(revision.created_at)} · {revision.actor}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 font-serif text-[12.5px] leading-relaxed text-muted-foreground">{revision.instructions}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <div>
                  <Eyebrow>Fixed presentation rules</Eyebrow>
                  <div className="rounded-[5px] border-l-2 border-[var(--brass)] bg-surface-800/50 px-4 py-3.5">
                    <p className="font-serif text-[15px] leading-relaxed text-foreground">{control.instructions}</p>
                  </div>
                  <p className="mt-3 max-w-[68ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">Timeline is deliberately not generated by a prompt. It reads stored dates, claims, relationships, and source links directly, so editing prose cannot alter historical evidence.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
