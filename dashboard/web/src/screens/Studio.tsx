import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { sourceKind } from '../lib/desk';
import { IconArrow } from '../components/icons';
import './studio.css';

const FALLBACK_TEMPLATES = [
  'speaking_prep',
  'x_post',
  'twitter_thread',
  'linkedin_post',
  'month_in_review',
  'year_in_review',
];

const WRITING_LENS_LABEL: Record<string, string> = {
  mark: 'Mark',
  creator_reference: 'Creator reference',
};

const STUDIO_TASKS = [
  {
    template: 'speaking_prep',
    title: 'Prepare to speak',
    description: 'Build a thesis, talking points, likely questions, counterarguments, and a strong closing takeaway.',
  },
  {
    template: 'x_post',
    title: 'Write an X post',
    description: 'Turn selected intelligence into one concise, evidence-backed post that reads naturally on X.',
  },
  {
    template: 'twitter_thread',
    title: 'Build an X thread',
    description: 'Develop a topic into a short evidence-backed thread with a clear argument and progression.',
  },
  {
    template: 'linkedin_post',
    title: 'Create for LinkedIn',
    description: 'Shape stored intelligence into a thoughtful post with a clear argument and practical implication.',
  },
  {
    template: 'month_in_review',
    title: 'Build a review brief',
    description: 'Summarize what changed, why it matters, the recurring signals, and what to watch next.',
  },
];

export function Studio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, error, refetch } = useQuery('/drafts');
  const status = useQuery('/studio/status');
  const [template, setTemplate] = useState<string>('all');
  const requestedTemplate = searchParams.get('new');
  const [creating, setCreating] = useState(Boolean(requestedTemplate));
  const [selectedTemplate, setSelectedTemplate] = useState(requestedTemplate || 'speaking_prep');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={60} />;

  const drafts = data.drafts.filter((d: any) => template === 'all' || d.template_type === template);
  const templates = (status.data?.templates ?? [...new Set(data.drafts.map((d: any) => d.template_type))]) as string[];
  const connected = Boolean(status.data?.connected);

  const generated = (draftId: string) => {
    invalidate('/drafts');
    refetch();
    setCreating(false);
    setSearchParams({});
    navigate(`/studio/${draftId}`);
  };

  const start = (value: string) => {
    setSelectedTemplate(value);
    setCreating(true);
    setSearchParams({ new: value });
  };

  const closeComposer = () => {
    setCreating(false);
    setSearchParams({});
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
            onClick={() => creating ? closeComposer() : start('speaking_prep')}
            disabled={!connected}
          >
            {creating ? 'Close composer' : 'Create draft'}
          </button>
        </div>
      </header>

      <section className="studio-task-grid" aria-label="Create from intelligence">
        {STUDIO_TASKS.map((task) => (
          <button
            key={task.template}
            type="button"
            className="studio-task"
            onClick={() => start(task.template)}
            disabled={!connected}
          >
            <span className="studio-task-label label">{TEMPLATE_LABEL[task.template]}</span>
            <span className="studio-task-title">{task.title}</span>
            <span className="studio-task-copy">{task.description}</span>
            <span className="studio-task-action">
              Start with Hermes <IconArrow />
            </span>
          </button>
        ))}
      </section>

      {creating && (
        <DraftComposer
          key={selectedTemplate}
          templates={status.data?.templates ?? FALLBACK_TEMPLATES}
          initialTemplate={selectedTemplate}
          initialFocus={searchParams.get('focus') ?? ''}
          onCreated={generated}
          onCancel={closeComposer}
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
                      {` · ${WRITING_LENS_LABEL[draft.writing_lens] ?? 'Mark'} lens`}
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
  initialTemplate,
  initialFocus,
  onCreated,
  onCancel,
}: {
  templates: string[];
  initialTemplate: string;
  initialFocus: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [template, setTemplate] = useState(
    templates.includes(initialTemplate) ? initialTemplate : (templates[0] ?? 'speaking_prep'),
  );
  const [focus, setFocus] = useState(initialFocus.slice(0, 500));
  const [writingLens, setWritingLens] = useState('mark');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const sourcesQuery = useQuery('/sources');
  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const evidenceSources = (sourcesQuery.data?.sources ?? []).filter((source: any) => {
    const needle = sourceSearch.trim().toLowerCase();
    return !needle || [source.title, source.source_label, source.source_type, source.tags]
      .some((value) => String(value ?? '').toLowerCase().includes(needle));
  }).slice(0, 30);

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
          writing_lens: writingLens,
          source_ids: selectedSources,
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

        <label className="field">
          <span className="field-label">Writing lens</span>
          <select className="field-control" value={writingLens} onChange={(event) => setWritingLens(event.target.value)}>
            <option value="mark">Mark</option>
            <option value="creator_reference">Creator reference</option>
          </select>
          <span className="field-help">
            Creator reference changes expression, not the verified facts.
          </span>
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

        <section className="studio-evidence-picker">
          <div className="studio-evidence-head">
            <div>
              <span className="field-label">Evidence sources</span>
              <span className="field-help">Choose up to 12 sources, or leave this empty for automatic evidence selection.</span>
            </div>
            <Link to="/" className="desk-link">Browse topics</Link>
          </div>
          <input
            className="field-control"
            type="search"
            value={sourceSearch}
            onChange={(event) => setSourceSearch(event.target.value)}
            placeholder="Search source titles, channels, or tags"
          />
          <div className="studio-evidence-list">
            {evidenceSources.map((source: any) => {
              const active = selectedSources.includes(source.source_id);
              return (
                <button
                  key={source.source_id}
                  type="button"
                  className={active ? 'is-selected' : ''}
                  onClick={() => setSelectedSources((current) => active
                    ? current.filter((id) => id !== source.source_id)
                    : current.length < 12 ? [...current, source.source_id] : current)}
                >
                  <span>{active ? 'Selected' : sourceKind(source.source_type)}</span>
                  <strong>{truncate(source.title || source.source_label || 'Untitled source', 92)}</strong>
                </button>
              );
            })}
          </div>
          {selectedSources.length ? <span className="field-help">{selectedSources.length} sources selected</span> : null}
        </section>

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
          <dt>Writing lens</dt>
          <dd>{WRITING_LENS_LABEL[data.writing_lens] ?? 'Mark'}</dd>
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
