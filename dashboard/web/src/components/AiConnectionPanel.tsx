import { useEffect, useState } from 'react';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDate, plural } from '../lib/desk';
import { Eyebrow } from './Desk';

type Route = { via: 'openai' | 'hermes'; model: string; reasoning: string };
type Job = {
  task: string;
  label: string;
  detail: string;
  route: Route;
  effective: 'openai' | 'hermes';
  week: { calls: number; failures: number; input: number; output: number; reasoning: number; seconds: number };
  last: { at: string; ok: boolean; via: string; model?: string; seconds: number; error?: string } | null;
};
type Connection = { key: boolean; models: string[]; reasoning: string[]; jobs: Job[] };
type TestResult = { ok: boolean; via: string; model: string | null; seconds: number } | { error: string };

const tokens = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value));
const selectClass = 'rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground disabled:opacity-50';

/**
 * Where the long AI jobs run. OpenAI direct has no 60-second limit; Hermes
 * picks the model from its own settings. Without a key on the server, jobs set
 * to OpenAI direct go through Hermes and the panel says so.
 */
export function AiConnectionPanel() {
  const connection = useQuery<Connection>('/ai/connection', [], 30_000);
  const [drafts, setDrafts] = useState<Record<string, Route>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | 'running'>>({});
  const data = connection.data;
  useEffect(() => { if (data) setDrafts((current) => (Object.keys(current).length ? current : Object.fromEntries(data.jobs.map((job) => [job.task, job.route])))); }, [data]);
  if (!data) return null;
  const changed = data.jobs.some((job) => JSON.stringify(drafts[job.task] ?? job.route) !== JSON.stringify(job.route));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api('/ai/connection', { method: 'PUT', body: JSON.stringify({ jobs: drafts }) });
      invalidate('/ai/connection');
      await connection.refetch();
      setMessage({ text: 'Saved. The next AI call uses the new setting.' });
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The setting could not be saved.', error: true });
    } finally {
      setSaving(false);
    }
  };

  const test = async (task: string) => {
    setTests((current) => ({ ...current, [task]: 'running' }));
    try {
      const result = await api<TestResult>('/ai/connection/test', { method: 'POST', body: JSON.stringify({ task }) });
      setTests((current) => ({ ...current, [task]: result }));
    } catch (failure) {
      setTests((current) => ({ ...current, [task]: { error: failure instanceof Error ? failure.message : 'The test failed.' } }));
    }
    invalidate('/ai/connection');
    connection.refetch();
  };

  return (
    <section className="mt-6 rounded-[7px] border-2 border-[var(--line-strong)] bg-[var(--panel)] p-4" data-testid="ai-connection">
      <Eyebrow>AI connection</Eyebrow>
      <p className="mb-3 max-w-[72ch] font-serif text-[13.5px] leading-relaxed text-muted-foreground">
        Long jobs can go straight to OpenAI, where a model may reason for as long as it needs. Through Hermes, any answer that shows no progress for 60 seconds is cut off. Telegram, Ask, Prep and the rest always use Hermes.
      </p>
      <p className={`mb-4 font-mono text-[11.5px] ${data.key ? 'text-[var(--sage)]' : 'text-[var(--accent-text)]'}`} data-testid="ai-key-status">
        {data.key ? 'OpenAI key: connected on the server.' : 'OpenAI key: not set on the server. Jobs set to OpenAI direct go through Hermes until it is added (see the runbook).'}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.jobs.map((job) => {
          const draft = drafts[job.task] ?? job.route;
          const set = (patch: Partial<Route>) => setDrafts((current) => ({ ...current, [job.task]: { ...draft, ...patch } }));
          const result = tests[job.task];
          const average = job.week.calls ? Math.round(job.week.seconds / job.week.calls) : 0;
          return (
            <div key={job.task} className="min-w-0 rounded-[5px] border border-[var(--line)] p-3" data-testid={`ai-job-${job.task}`}>
              <p className="font-serif text-[15px] text-foreground">{job.label}</p>
              <p className="mb-2 font-mono text-[11px] text-dim">{job.detail}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`${job.label} route`} className={selectClass} value={draft.via} onChange={(event) => set({ via: event.target.value as Route['via'] })}>
                  <option value="openai">OpenAI direct</option>
                  <option value="hermes">Hermes</option>
                </select>
                <select aria-label={`${job.label} model`} className={selectClass} value={draft.model} disabled={draft.via === 'hermes'} onChange={(event) => set({ model: event.target.value })}>
                  {data.models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
                <select aria-label={`${job.label} reasoning`} className={selectClass} value={draft.reasoning} disabled={draft.via === 'hermes'} onChange={(event) => set({ reasoning: event.target.value })}>
                  {data.reasoning.map((level) => <option key={level} value={level}>{level} reasoning</option>)}
                </select>
                <button type="button" className="font-mono text-[11px] text-[var(--accent-text)] underline underline-offset-2 disabled:opacity-50" disabled={result === 'running' || changed} onClick={() => test(job.task)}>
                  {result === 'running' ? 'Testing' : 'Test'}
                </button>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground" data-testid={`ai-effective-${job.task}`}>
                Now using: {job.effective === 'openai' ? `OpenAI direct, ${job.route.model}, ${job.route.reasoning} reasoning` : job.route.via === 'openai' ? 'Hermes, until the OpenAI key is added' : 'Hermes, with the model set in Hermes'}
              </p>
              <p className="font-mono text-[11px] leading-relaxed text-dim">
                Last 7 days: {plural(job.week.calls, 'call')}{job.week.failures ? `, ${job.week.failures} failed` : ''}{job.week.input ? ` · ${tokens(job.week.input)} tokens in, ${tokens(job.week.output)} out (${tokens(job.week.reasoning)} reasoning)` : ''}{average ? ` · about ${average} s per call` : ''}.
              </p>
              {job.last ? (
                <p className={`font-mono text-[11px] ${job.last.ok ? 'text-dim' : 'text-[var(--danger-text)]'}`}>
                  Last call {formatDate(job.last.at)} via {job.last.via === 'openai' ? `OpenAI (${job.last.model})` : 'Hermes'}: {job.last.ok ? `answered in ${job.last.seconds} s` : `failed${job.last.error ? ` (${job.last.error})` : ''}`}.
                </p>
              ) : null}
              {result && result !== 'running' ? (
                'error' in result
                  ? <p role="alert" className="mt-1 font-mono text-[11px] text-[var(--danger-text)]">Test failed: {result.error}</p>
                  : <p role="status" className={`mt-1 font-mono text-[11px] ${result.ok ? 'text-[var(--sage)]' : 'text-[var(--danger-text)]'}`}>
                    {result.ok ? `Test passed via ${result.via === 'openai' ? `OpenAI (${result.model})` : 'Hermes'} in ${result.seconds} s.` : `The test got an answer via ${result.via}, but not the expected one.`}
                  </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {changed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="desk-button secondary" disabled={saving} onClick={save}>{saving ? 'Saving' : 'Save AI connection'}</button>
          <button type="button" className="font-mono text-[11px] text-dim" onClick={() => setDrafts(Object.fromEntries(data.jobs.map((job) => [job.task, job.route])))}>Cancel</button>
        </div>
      ) : null}
      {message ? <p className={`mt-3 font-mono text-[11px] ${message.error ? 'text-[var(--danger-text)]' : 'text-[var(--sage)]'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
    </section>
  );
}
