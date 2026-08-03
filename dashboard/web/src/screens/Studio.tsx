import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
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

export function Studio() {
  const { id } = useParams();
  const { data, error, refetch } = useQuery('/drafts');
  const [template, setTemplate] = useState<string>('all');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={60} />;

  const drafts = data.drafts.filter((d: any) => template === 'all' || d.template_type === template);
  const templates = [...new Set(data.drafts.map((d: any) => d.template_type))] as string[];

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Studio</h1>
          <p className="page-sub">
            {plural(data.drafts.length, 'preserved draft')} across {plural(templates.length, 'template')}. Generation
            runs through Hermes, so new drafts appear here once the intelligence plane is connected. Existing drafts are
            fully readable now, and every revision is kept.
          </p>
        </div>
        <Segmented
          label="Template"
          value={template}
          onChange={setTemplate}
          options={[
            { value: 'all', label: 'All', count: data.drafts.length },
            ...templates.map((t) => ({
              value: t,
              label: TEMPLATE_LABEL[t] ?? t,
              count: data.drafts.filter((d: any) => d.template_type === t).length,
            })),
          ]}
        />
      </header>

      <div className="studio-columns">
        <Panel title={`Drafts (${drafts.length})`}>
          {drafts.length === 0 ? (
            <EmptyState title="No drafts for this template" />
          ) : (
            <ul className="draft-list">
              {drafts.map((d: any) => (
                <li key={d.id}>
                  <Link to={`/studio/${d.id}`} className={`draft-row ${d.id === id ? 'is-active' : ''}`}>
                    <span className="draft-row-head">
                      <span className="chip chip-sm">{TEMPLATE_LABEL[d.template_type] ?? d.template_type}</span>
                      <span className="mono faint">{formatDate(d.updated_at)}</span>
                    </span>
                    <span className="draft-row-focus">{truncate(d.focus ?? 'No focus recorded', 96)}</span>
                    <span className="draft-row-meta faint">
                      {d.date_from && d.date_to ? `${d.date_from} to ${d.date_to}` : 'no window'}
                      {d.edited_output ? ' · edited' : ' · raw only'}
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

function DraftPlaceholder() {
  return (
    <EmptyState title="Select a draft">
      Drafts preserve both the raw generation and any edit made afterwards, plus every revision since migration.
      Choosing one opens it beside the list.
    </EmptyState>
  );
}

function DraftView({ id }: { id: string }) {
  const { data, error, refetch } = useQuery(`/drafts/${id}`, [id]);
  const [mode, setMode] = useState<'edited' | 'raw'>('edited');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={40} />;

  const body = mode === 'edited' ? (data.edited_output || data.raw_output) : data.raw_output;
  const hasEdit = Boolean(data.edited_output && data.edited_output !== data.raw_output);

  return (
    <Panel
      title={TEMPLATE_LABEL[data.template_type] ?? data.template_type}
      action={
        <Segmented
          label="Version"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edited', label: hasEdit ? 'Edited' : 'Current' },
            { value: 'raw', label: 'Raw' },
          ]}
        />
      }
    >
      <div className="draft-body">
        <dl className="kv draft-meta">
          <dt>Focus</dt>
          <dd>{data.focus ?? 'none recorded'}</dd>
          <dt>Window</dt>
          <dd className="mono">{data.date_from ? `${data.date_from} to ${data.date_to}` : 'none'}</dd>
          <dt>Created</dt>
          <dd className="mono">{formatDateTime(data.created_at)}</dd>
          <dt>Revisions</dt>
          <dd className="mono">{data.revisions.length}</dd>
        </dl>

        <div className="draft-generated">
          <div className="generated-head label">
            {mode === 'raw' ? 'Raw generation, unedited' : hasEdit ? 'Edited by Mark' : 'Generated, never edited'}
          </div>
          <div className="draft-text">
            {paragraphs(body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        <div className="draft-actions">
          <button
            type="button"
            className="btn"
            onClick={() => navigator.clipboard?.writeText(body ?? '')}
          >
            Copy as plain text
          </button>
          <StatusChip tone="warning">Generation needs Hermes, not connected here</StatusChip>
        </div>
      </div>
    </Panel>
  );
}
