import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDate, formatDateTime, paragraphs, plural, truncate } from '../lib/format';
import {
  EmptyState,
  ErrorState,
  Panel,
  Segmented,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import { TEMPLATE_LABEL } from '../lib/taxonomy';
import './studio.css';

const FALLBACK_TEMPLATES = [
  'speaking_prep',
  'twitter_thread',
  'linkedin_post',
  'month_in_review',
  'year_in_review',
];

export function Studio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, refetch } = useQuery('/drafts');
  const status = useQuery('/studio/status');
  const [template, setTemplate] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={60} />;

  const drafts = data.drafts.filter((d: any) => template === 'all' || d.template_type === template);
  const templates = (status.data?.templates ?? [...new Set(data.drafts.map((d: any) => d.template_type))]) as string[];
  const connected = Boolean(status.data?.connected);

  const generated = (draftId: string) => {
    invalidate('/drafts');
    refetch();
    setCreating(false);
    navigate(`/studio/${draftId}`);
  };

  return (
    <div className="page studio-page">
      <header className="page-head studio-head">
        <div className="page-title">
          <h1>Studio</h1>
          <p className="page-sub">
            Turn verified intelligence into panel preparation, social content, and review briefs. The central brain
            writes from the existing corpus, every generated claim carries a source reference, and edits preserve their
            full history.
          </p>
        </div>
        <div className="studio-head-actions">
          <StatusChip tone={connected ? 'good' : 'warning'}>
            {connected ? 'Intelligence connected' : 'Generation unavailable'}
          </StatusChip>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((value) => !value)}
            disabled={!connected}
          >
            {creating ? 'Close composer' : 'Create draft'}
          </button>
        </div>
      </header>

      {creating && (
        <DraftComposer
          templates={status.data?.templates ?? FALLBACK_TEMPLATES}
          onCreated={generated}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="studio-filter">
        <Segmented
          label="Template"
          value={template}
          onChange={setTemplate}
          options={[
            { value: 'all', label: 'All', count: data.drafts.length },
            ...templates.map((value) => ({
              value,
              label: TEMPLATE_LABEL[value] ?? value,
              count: data.drafts.filter((draft: any) => draft.template_type === value).length,
            })),
          ]}
        />
      </div>

      <div className="studio-columns">
        <Panel title={`Drafts (${drafts.length})`}>
          {drafts.length === 0 ? (
            <EmptyState title="No drafts for this template" />
          ) : (
            <ul className="draft-list">
              {drafts.map((draft: any) => (
                <li key={draft.id}>
                  <Link to={`/studio/${draft.id}`} className={`draft-row ${draft.id === id ? 'is-active' : ''}`}>
                    <span className="draft-row-head">
                      <span className="chip chip-sm">{TEMPLATE_LABEL[draft.template_type] ?? draft.template_type}</span>
                      <span className="mono faint">{formatDate(draft.updated_at)}</span>
                    </span>
                    <span className="draft-row-focus">{truncate(draft.focus ?? 'No focus recorded', 96)}</span>
                    <span className="draft-row-meta faint">
                      {draft.date_from && draft.date_to ? `${draft.date_from} to ${draft.date_to}` : 'all dates'}
                      {draft.edited_output ? ' · edited' : ' · original'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="studio-editor">{id ? <DraftView id={id} /> : <DraftPlaceholder />}</div>
      </div>
    </div>
  );
}

function DraftComposer({
  templates,
  onCreated,
  onCancel,
}: {
  templates: string[];
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [template, setTemplate] = useState(templates[0] ?? 'speaking_prep');
  const [focus, setFocus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (focus.trim().length < 3 || state === 'generating') return;
    setState('generating');
    setMessage('');
    try {
      const result = await api<{ id: string }>('/studio/drafts', {
        method: 'POST',
        body: JSON.stringify({
          template_type: template,
          focus: focus.trim(),
          date_from: dateFrom || null,
          date_to: dateTo || null,
        }),
      });
      onCreated(result.id);
    } catch (error) {
      setMessage((error as Error).message);
      setState('error');
    }
  };

  return (
    <Panel title="Create with the central brain" className="studio-composer">
      <form className="studio-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Draft format</span>
          <select className="field-control" value={template} onChange={(event) => setTemplate(event.target.value)}>
            {templates.map((value) => (
              <option key={value} value={value}>{TEMPLATE_LABEL[value] ?? value}</option>
            ))}
          </select>
        </label>

        <label className="field studio-focus-field">
          <span className="field-label">Focus</span>
          <textarea
            className="field-control studio-focus"
            value={focus}
            maxLength={500}
            rows={4}
            placeholder="What should this draft explain, prepare for, or argue?"
            onChange={(event) => {
              setFocus(event.target.value);
              setState('idle');
            }}
          />
          <span className="field-help">Be specific. The brain will use this to select supporting records.</span>
        </label>

        <div className="studio-dates">
          <label className="field">
            <span className="field-label">Start date <span className="field-optional">optional</span></span>
            <input className="field-control mono" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">End date <span className="field-optional">optional</span></span>
            <input className="field-control mono" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        <div className="studio-compose-actions">
          <button className="btn btn-primary" type="submit" disabled={focus.trim().length < 3 || state === 'generating'}>
            {state === 'generating' ? 'Generating draft' : 'Generate draft'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={state === 'generating'}>
            Cancel
          </button>
          <span className="studio-contract">Only drafts whose cited records can be verified are saved.</span>
        </div>
        {state === 'error' && <div className="studio-error" role="alert">{message}</div>}
      </form>
    </Panel>
  );
}

function DraftPlaceholder() {
  return (
    <EmptyState title="Select a draft">
      Open a preserved draft from the list, or create a new evidence-backed draft with the central brain.
    </EmptyState>
  );
}

function DraftView({ id }: { id: string }) {
  const { data, error, refetch } = useQuery(`/drafts/${id}`, [id]);
  const [mode, setMode] = useState<'edited' | 'raw'>('edited');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setText(data.edited_output || data.raw_output || '');
    setEditing(false);
    setSaveState('idle');
  }, [id, data?.updated_at]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={40} />;

  const current = data.edited_output || data.raw_output || '';
  const body = mode === 'edited' ? current : data.raw_output;
  const hasEdit = Boolean(data.edited_output && data.edited_output !== data.raw_output);
  const dirty = text.trim() !== current.trim();

  const save = async () => {
    if (!dirty || !text.trim()) return;
    setSaveState('saving');
    setSaveMessage('');
    try {
      await api(`/drafts/${id}`, { method: 'PUT', body: JSON.stringify({ body: text }) });
      invalidate('/drafts');
      setSaveState('saved');
      setEditing(false);
      refetch();
    } catch (saveError) {
      setSaveMessage((saveError as Error).message);
      setSaveState('error');
    }
  };

  return (
    <Panel
      title={TEMPLATE_LABEL[data.template_type] ?? data.template_type}
      action={!editing ? (
        <Segmented
          label="Version"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edited', label: hasEdit ? 'Current' : 'Original' },
            { value: 'raw', label: 'First generation' },
          ]}
        />
      ) : undefined}
    >
      <div className="draft-body">
        <dl className="kv draft-meta">
          <dt>Focus</dt>
          <dd>{data.focus ?? 'none recorded'}</dd>
          <dt>Window</dt>
          <dd className="mono">{data.date_from ? `${data.date_from} to ${data.date_to}` : 'all dates'}</dd>
          <dt>Created</dt>
          <dd className="mono">{formatDateTime(data.created_at)}</dd>
          <dt>Revisions</dt>
          <dd className="mono">{data.revisions.length}</dd>
        </dl>

        {editing ? (
          <div className="draft-edit">
            <label className="field">
              <span className="field-label">Current draft</span>
              <textarea
                className="field-control draft-edit-input read"
                value={text}
                maxLength={40_000}
                onChange={(event) => {
                  setText(event.target.value);
                  setSaveState('idle');
                }}
              />
            </label>
            <div className="draft-actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving revision' : 'Save revision'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setText(current); setEditing(false); }}>
                Cancel
              </button>
              {saveState === 'error' && <StatusChip tone="critical">{saveMessage}</StatusChip>}
            </div>
          </div>
        ) : (
          <>
            <div className="draft-generated">
              <div className="generated-head label">
                {mode === 'raw' ? 'First generation' : hasEdit ? 'Current revision' : 'Original draft'}
              </div>
              <div className="draft-text">
                {paragraphs(body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            </div>

            {mode === 'edited' && data.citations?.length > 0 && <EvidenceList citations={data.citations} />}

            <div className="draft-actions">
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(body ?? '')}>
                Copy as plain text
              </button>
              <button type="button" className="btn" onClick={() => { setText(current); setEditing(true); setMode('edited'); }}>
                Edit draft
              </button>
              {saveState === 'saved' && <StatusChip tone="good">Revision saved</StatusChip>}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function EvidenceList({ citations }: { citations: any[] }) {
  return (
    <section className="draft-evidence" aria-labelledby="draft-evidence-title">
      <div className="label" id="draft-evidence-title">Evidence used</div>
      <ul>
        {citations.map((citation) => (
          <li key={citation.id}>
            <Link to={citation.kind === 'event' ? `/event/${citation.id}` : `/source/${citation.id}`}>
              <span>{citation.title || citation.id}</span>
              <span className="mono faint">{citation.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
