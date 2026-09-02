import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { formatDate, titleCase } from '../lib/desk';
import './topics.css';

type Topic = {
  tag: string;
  event_count: number;
  source_count: number;
  latest_subject_date: string | null;
  max_significance: number;
};

export function Topics() {
  const result = useQuery<{ topics: Topic[] }>('/topics');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'recent'>('all');

  const topics = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = new Date();
    const recentFloor = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
    return (result.data?.topics ?? []).filter((topic) => {
      if (needle && !topic.tag.toLowerCase().includes(needle)) return false;
      if (filter === 'high' && Number(topic.max_significance) < 4) return false;
      if (filter === 'recent') {
        const latest = topic.latest_subject_date ? new Date(`${topic.latest_subject_date}T00:00:00Z`) : null;
        if (!latest || latest < recentFloor) return false;
      }
      return true;
    });
  }, [result.data, query, filter]);

  return (
    <section>
      <ViewHead title="Topics">
        Explore the arguments, events, and source material already present in Mark's corpus. Nothing on this page is generated for display.
      </ViewHead>

      <div className="topics-controls">
        <input className="desk-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics" aria-label="Search topics" />
        <div className="desk-chip-row" aria-label="Filter topics">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
          <Chip active={filter === 'high'} onClick={() => setFilter('high')}>High signal</Chip>
          <Chip active={filter === 'recent'} onClick={() => setFilter('recent')}>Recently discussed</Chip>
        </div>
      </div>

      {result.loading && !result.data ? <LoadingRows rows={6} /> : null}
      {result.error ? <ErrorState error={result.error} retry={result.refetch} /> : null}
      {!result.loading && !result.error && topics.length === 0 ? (
        <EmptyState title="No matching topics">Try a broader search or remove the current filter.</EmptyState>
      ) : null}

      <p className="desk-statline">{topics.length} topics from the live corpus</p>
      <div className="desk-grid topics-grid">
        {topics.map((topic) => (
          <Link key={topic.tag} className="desk-card desk-card-link topic-card" to={`/topics/${encodeURIComponent(topic.tag)}`}>
            <div>
              <h2>{titleCase(topic.tag)}</h2>
              <div className="desk-tags">
                <span className="desk-tag">{topic.event_count} events</span>
                <span className="desk-tag">{topic.source_count} sources</span>
              </div>
            </div>
            <div className="desk-card-meta">
              <span>signal {topic.max_significance}/5</span>
              <span>{formatDate(topic.latest_subject_date)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
