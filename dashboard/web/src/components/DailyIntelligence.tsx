import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useQuery } from '../lib/api';
import { ErrorState } from './Desk';
import { formatDate } from '../lib/desk';
import '../screens/workspace-utilities.css';
export function DailyIntelligence() {
  const query = useQuery<any>('/intelligence', [], 30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = async (toggle: boolean) => {
    setBusy(true); setError('');
    try {
      await api(toggle ? '/intelligence/settings' : '/intelligence/refresh', {
        method: toggle ? 'PUT' : 'POST', ...(toggle ? { body: JSON.stringify({ enabled: !query.data?.enabled }) } : {}),
      }); query.refetch();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const brief = query.data?.brief;
  return <section className="workspace-utilities"><details className="utility-panel"><summary>Daily intelligence and background generation</summary>
    {query.error ? <ErrorState error={query.error} retry={query.refetch} /> : null}
    <p>Scheduled generation is {query.data?.enabled ? 'on' : 'off'}. When enabled, a brief is refreshed every {query.data?.refresh_hours || 24} hours using provider credits.</p>
    <div className="utility-actions"><button disabled={busy || !query.data} onClick={() => update(true)}>{query.data?.enabled ? 'Pause scheduled briefs' : 'Enable scheduled briefs'}</button><button disabled={busy || !query.data?.connected} onClick={() => update(false)}>{busy ? 'Working' : 'Generate brief now'}</button></div>
    {error ? <p role="alert" className="utility-error">{error}</p> : null}
    {brief ? <><h2>{brief.headline}</h2><p className="utility-muted">Generated {formatDate(brief.generated_at)}{query.data?.stale ? ' · due for refresh' : ''}</p><p>{brief.summary}</p>
      {brief.needs_attention?.map((item: any, index: number) => <article key={index} className="utility-row"><div><strong>{item.title}</strong><p>{item.why}</p></div></article>)}
      {brief.changes?.map((item: any, index: number) => <article key={index} className="utility-row"><div><strong>{item.title}</strong><p>{item.detail}</p>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">{item.source_label || 'Source'}</a> : null}</div></article>)}
      {brief.watchlists?.map((item: any, index: number) => <p key={index}><strong>{item.label}: </strong>{item.detail}</p>)}
      {brief.suggested_actions?.map((item: any, index: number) => <p key={index}><strong>{item.title}: </strong>{item.reason} <Link to={`/prep?topic=${encodeURIComponent(item.query || item.title)}`}>Prepare a sourced brief</Link></p>)}
    </> : <p>No daily brief has been generated yet.</p>}
  </details></section>;
}
