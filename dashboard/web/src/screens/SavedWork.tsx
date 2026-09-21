import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { formatDate } from '../lib/desk';
import './workspace-utilities.css';

export function useWorkflowRestore(restore: (result: any, input: any) => void) {
  const [params, setParams] = useSearchParams();
  const id = params.get('saved');
  const revision = params.get('revision');
  const query = useQuery<any>(id ? `/workflows/${encodeURIComponent(id)}` : null);
  const latestRestore = useRef(restore);
  latestRestore.current = restore;
  useEffect(() => {
    const versions = query.data?.revisions ?? [];
    const selected = revision == null ? versions[0] : versions.find((item: any) => item.revision === Number(revision));
    if (selected) latestRestore.current(selected.result, selected.input);
  }, [query.data, revision]);
  return { query, remember: (id: string) => setParams({ saved: id }, { replace: true }) };
}

export function WorkflowHistory({ id, query }: { id?: string; query: ReturnType<typeof useQuery<any>> }) {
  const [params, setParams] = useSearchParams();
  const versions = query.data?.revisions ?? [];
  return <div className="workspace-utilities mb-4"><div className="utility-actions"><Link to="/saved">Saved work</Link>{id ? <span className="utility-muted">Saved automatically</span> : null}{versions.length > 1 ? <label>Revision <select aria-label="Saved revision" value={params.get('revision') ?? versions[0].revision} onChange={e => setParams({ saved: id || '', revision: e.target.value })}>{versions.map((item: any) => <option key={item.revision} value={item.revision}>{item.revision + 1}</option>)}</select></label> : null}</div>{query.error ? <ErrorState error={query.error} retry={query.refetch} /> : null}{params.get('saved') && !query.data && query.loading ? <p>Opening saved work...</p> : null}</div>;
}

export function SavedWork() {
  const query = useQuery<any>('/workflows', [], 10_000);
  const [filter, setFilter] = useState('');
  if (query.loading && !query.data) return <LoadingRows />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  const rows = (query.data?.results ?? []).filter((row: any) => `${row.focus} ${row.creator || ''} ${row.template_type}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="workspace-utilities"><ViewHead title="Saved work">Your briefs, writing drafts and revisions remain available after you leave or refresh.</ViewHead><input aria-label="Find saved work" placeholder="Find a brief or draft" value={filter} onChange={e => setFilter(e.target.value)} />
    {!rows.length ? <p className="mt-6">No saved work matches this search.</p> : null}
    {rows.map((row: any) => <article className="utility-row" key={row.id}><div><Link to={row.kind === 'prep' ? `/prep?saved=${row.id}` : row.kind === 'creator' ? `/${row.creator?.toLowerCase()}?saved=${row.id}` : `/saved/${row.id}`}>{row.focus || 'Saved draft'}</Link><p className="utility-muted">{row.creator ? `${row.creator} · ` : ''}{row.kind === 'creator' ? row.format === 'blog' ? 'blog post' : 'tweet' : row.kind === 'prep' ? 'preparation brief' : row.template_type.replace(/_/g, ' ')} · saved {formatDate(row.updated_at)}{row.revision != null ? ` · ${row.revision + 1} revisions` : ''}</p></div></article>)}
  </section>;
}

export function LegacySavedWork() {
  const { id } = useParams();
  const query = useQuery<any>(`/workflows/${encodeURIComponent(id || '')}`);
  const [revision, setRevision] = useState<number | null>(null);
  if (query.loading && !query.data) return <LoadingRows />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  const draft = query.data?.draft;
  const versions = draft?.revisions ?? [];
  const selected = versions.find((item: any) => item.revision === revision) ?? versions[0];
  return <section className="workspace-utilities"><Link to="/saved">Back to saved work</Link><ViewHead title={draft?.focus || 'Saved draft'}>This older output retains its original text and evidence IDs. Structured panels were not recorded when it was created.</ViewHead><label>Revision <select value={selected?.revision ?? 0} onChange={e => setRevision(Number(e.target.value))}>{versions.map((item: any) => <option value={item.revision} key={item.revision}>{item.revision + 1} · {formatDate(item.created_at)}</option>)}</select></label><pre className="source-document">{selected?.body || draft?.edited_output || draft?.raw_output}</pre></section>;
}
