import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, Eyebrow, LoadingRows, Provenance, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { compact, formatDate, sourceKind, titleCase } from '../lib/desk';
import './topics.css';

type Claim = {
  event_id: string;
  position: number;
  text: string;
  primary_category: string;
  significance: number;
  subject_date: string;
  source_id: string;
  source_title?: string;
  source_label?: string;
  source_channel?: string;
  source_type?: string;
  source_url?: string;
};

export function TopicDetail() {
  const { tag = '' } = useParams();
  const topic = decodeURIComponent(tag);
  const result = useQuery<any>(`/topics?tag=${encodeURIComponent(topic)}`, [topic]);
  const [sourceType, setSourceType] = useState('All');
  const [category, setCategory] = useState('All');

  const claims: Claim[] = result.data?.claims ?? [];
  const sourceTypes = useMemo(() => ['All', ...new Set(claims.map((claim) => sourceKind(claim.source_type)))], [claims]);
  const categories = useMemo(() => ['All', ...new Set(claims.map((claim) => claim.primary_category))], [claims]);
  const visible = claims.filter((claim) => (sourceType === 'All' || sourceKind(claim.source_type) === sourceType) && (category === 'All' || claim.primary_category === category));

  if (result.loading && !result.data) return <LoadingRows rows={7} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;

  return (
    <section>
      <Link className="topic-back" to="/">Back to topics</Link>
      <ViewHead title={titleCase(topic)} actions={<Link className="desk-button secondary" to={`/ask?topic=${encodeURIComponent(topic)}`}>Ask about this topic</Link>}>
        {result.data?.events?.length ?? 0} events across {result.data?.sources?.length ?? 0} sources, shown with their original evidence.
      </ViewHead>

      <div className="topic-filter-layout">
        <div className="topic-claims">
          <Eyebrow>Filed claims and observations</Eyebrow>
          <p className="desk-statline">Showing {visible.length} of {claims.length} extracted claims</p>
          {visible.length === 0 ? <EmptyState title="No claims match these filters">Choose a different source type or category.</EmptyState> : null}
          {visible.map((claim) => (
            <article className="topic-claim" key={`${claim.event_id}-${claim.position}`}>
              <p>{claim.text}</p>
              <Provenance source={claim.source_channel || claim.source_label || compact(claim.source_title, 56)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} />
              <div className="topic-claim-actions">
                <Link to={`/event/${claim.event_id}`}>Open event</Link>
                <Link to={`/source/${encodeURIComponent(claim.source_id)}`}>Open source</Link>
                {claim.source_url ? <a href={claim.source_url} target="_blank" rel="noreferrer">Original link</a> : null}
              </div>
            </article>
          ))}
        </div>

        <aside className="desk-aside topic-filters">
          <Eyebrow>Source type</Eyebrow>
          <div className="topic-filter-stack">
            {sourceTypes.map((item) => <Chip key={item} active={sourceType === item} onClick={() => setSourceType(item)}>{item}</Chip>)}
          </div>
          <Eyebrow>Category</Eyebrow>
          <div className="topic-filter-stack">
            {categories.map((item) => <Chip key={item} active={category === item} onClick={() => setCategory(item)}>{titleCase(item)}</Chip>)}
          </div>
        </aside>
      </div>
    </section>
  );
}
