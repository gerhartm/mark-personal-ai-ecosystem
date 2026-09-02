import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, LoadingRows, Provenance, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { compact, formatDate, sourceKind } from '../lib/desk';
import './library.css';

type Source = {
  source_id: string;
  title?: string;
  source_label?: string;
  source_type?: string;
  source_channel?: string;
  source_url?: string;
  captured_at?: string;
  event_count: number;
  insight_count?: number;
  tags?: string;
};

const TYPES = ['All', 'Transcript', 'Tweet', 'Blog post', 'Your notes'];

export function Library() {
  const result = useQuery<{ sources: Source[] }>('/sources');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All');

  const sources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (result.data?.sources ?? []).filter((source) => {
      if (type !== 'All' && sourceKind(source.source_type) !== type) return false;
      if (!needle) return true;
      return [source.title, source.source_label, source.source_channel, source.tags].some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [result.data, query, type]);

  return (
    <section>
      <ViewHead title="Sources" actions={<Link className="desk-button" to="/capture">Add source</Link>}>
        Read the material Mark supplied, inspect what was extracted, and ask questions against one source at a time.
      </ViewHead>

      <div className="source-controls">
        <input className="desk-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source titles, channels, or tags" aria-label="Search sources" />
        <div className="desk-chip-row">
          {TYPES.map((item) => <Chip key={item} active={type === item} onClick={() => setType(item)}>{item}</Chip>)}
        </div>
      </div>

      {result.loading && !result.data ? <LoadingRows rows={6} /> : null}
      {result.error ? <ErrorState error={result.error} retry={result.refetch} /> : null}
      {!result.loading && !result.error && sources.length === 0 ? <EmptyState title="No matching sources">Change the type filter or search term.</EmptyState> : null}

      <p className="desk-statline">{sources.length} sources</p>
      <div className="source-list">
        {sources.map((source) => (
          <Link className="source-row" key={source.source_id} to={`/source/${encodeURIComponent(source.source_id)}`}>
            <div>
              <div className="source-row-topline">
                <span>{sourceKind(source.source_type)}</span>
                <span>{source.event_count} events</span>
                {Number(source.insight_count) ? <span>{source.insight_count} claims</span> : null}
              </div>
              <h2>{source.title || source.source_label || 'Untitled source'}</h2>
              <Provenance source={source.source_channel || source.source_label} when={formatDate(source.captured_at)} />
              {source.tags ? <p className="source-tags">{source.tags.split(',').slice(0, 7).map((tag) => compact(tag, 34)).join(' · ')}</p> : null}
            </div>
            <span className="source-open">Open</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
