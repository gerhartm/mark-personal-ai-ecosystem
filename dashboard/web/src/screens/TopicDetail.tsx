import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Eyebrow, LoadingRows, Provenance } from '../components/Desk';
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

type RelatedTag = { tag: string; event_count: number };
type FilterItem = { label: string; n: number };

const claimSpeaker = (claim: Claim) => claim.source_channel || claim.source_label || compact(claim.source_title, 56) || 'Stored source';

export function TopicDetail() {
  const { tag = '' } = useParams();
  const topic = decodeURIComponent(tag);
  const result = useQuery<any>(`/topics?tag=${encodeURIComponent(topic)}`, [topic]);
  const [speaker, setSpeaker] = useState('Everyone');
  const [sourceType, setSourceType] = useState('All');
  const [window, setWindow] = useState('All time');
  const claims: Claim[] = result.data?.claims ?? [];
  const relatedTags: RelatedTag[] = result.data?.related_tags ?? [];

  const speakers = useMemo<FilterItem[]>(() => {
    const counts = new Map<string, number>();
    claims.forEach((claim) => counts.set(claimSpeaker(claim), (counts.get(claimSpeaker(claim)) ?? 0) + 1));
    return [
      { label: 'Everyone', n: claims.length },
      ...Array.from(counts, ([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    ];
  }, [claims]);
  const sourceTypes = useMemo<FilterItem[]>(() => {
    const counts = new Map<string, number>();
    claims.forEach((claim) => {
      const label = sourceKind(claim.source_type);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [
      { label: 'All', n: claims.length },
      ...Array.from(counts, ([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    ];
  }, [claims]);
  const windows = useMemo<FilterItem[]>(() => {
    const countWithin = (days: number) => claims.filter((claim) => Date.now() - new Date(`${claim.subject_date}T00:00:00Z`).getTime() <= days * 86400000).length;
    return [
      { label: 'All time', n: claims.length },
      { label: 'Last 30d', n: countWithin(30) },
      { label: 'Last 90d', n: countWithin(90) },
    ];
  }, [claims]);
  const visible = claims.filter((claim) => {
    if (speaker !== 'Everyone' && claimSpeaker(claim) !== speaker) return false;
    if (sourceType !== 'All' && sourceKind(claim.source_type) !== sourceType) return false;
    if (window === 'Last 30d' || window === 'Last 90d') {
      const days = window === 'Last 30d' ? 30 : 90;
      return Date.now() - new Date(`${claim.subject_date}T00:00:00Z`).getTime() <= days * 86400000;
    }
    return true;
  });
  const groups = useMemo(
    () => Array.from(new Set(visible.map((claim) => claim.primary_category))).map((category) => ({
      category,
      items: visible.filter((claim) => claim.primary_category === category),
    })),
    [visible],
  );
  const groupWeights = useMemo(() => {
    const values = groups.map((group) => new Set(group.items.map(claimSpeaker)).size);
    const total = values.reduce((sum, count) => sum + count, 0) || 1;
    return values.map((count) => Math.round((count / total) * 100));
  }, [groups]);
  const filtered = speaker !== 'Everyone' || sourceType !== 'All' || window !== 'All time';
  const years = claims.map((claim) => Number(claim.subject_date?.slice(0, 4))).filter(Boolean);
  const coverage = years.length
    ? Math.min(...years) === Math.max(...years)
      ? String(Math.min(...years))
      : `${Math.min(...years)} to ${Math.max(...years)}`
    : '';

  if (result.loading && !result.data) return <LoadingRows rows={7} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;

  return (
    <section>
      <Link className="topic-back" to="/">← all topics</Link>
      <div className="topic-exact-head">
        <h1>{titleCase(topic)}</h1>
        <p>
          {claims.length} claims · {new Set(claims.map(claimSpeaker)).size} speakers · {result.data?.sources?.length ?? 0} sources
          {coverage ? ` · ${coverage}` : ''}
        </p>
      </div>

      {relatedTags.length ? (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {relatedTags.slice(0, 6).map((item) => (
            <span key={item.tag} className="rounded-[3px] bg-surface-800 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {item.tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="topic-exact-layout">
        <div>
          <Eyebrow>Where the evidence sits</Eyebrow>
          <div className="topic-stance-bar">
            {groups.map((group, index) => (
              <span key={group.category} title={titleCase(group.category)} style={{ width: `${Math.max(8, groupWeights[index])}%` }}>
                {String.fromCharCode(65 + index)} · {groupWeights[index]}%
              </span>
            ))}
          </div>
          <p className="topic-stance-note">Share of evidence categories, weighted by distinct source identity rather than repeated claims.</p>

          {groups.length > 1 && visible.length > 1 ? <div className="topic-contested"><span>Multiple perspectives</span><p>The retained material approaches this topic through {groups.length} evidence categories. Open the claims and original sources before treating one view as consensus.</p></div> : null}

          {filtered ? <div className="topic-filter-status"><span>showing {visible.length} of {claims.length} filed claims</span><button type="button" onClick={() => { setSpeaker('Everyone'); setSourceType('All'); setWindow('All time'); }}>clear filters</button></div> : null}

          {visible.length === 0 ? (
            <EmptyState title="No claims match those filters">Choose another source, window, or source type.</EmptyState>
          ) : groups.map((group) => (
            <div className="topic-position" key={group.category}>
              <h2>{titleCase(group.category)}</h2>
              <p className="topic-position-meta">{group.items.length} claims · grounded in stored sources</p>
              {group.items.map((claim) => (
                <article key={`${claim.event_id}-${claim.position}`}>
                  <p>{claim.text}</p>
                  <Provenance source={claimSpeaker(claim)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} />
                  {claim.source_url ? <a className="topic-source-link" href={claim.source_url} target="_blank" rel="noreferrer">Open original source</a> : null}
                </article>
              ))}
            </div>
          ))}
        </div>

        <aside>
          <Filter label="Filter by source" values={speakers} active={speaker} setActive={setSpeaker} />
          <Filter label="Window" values={windows} active={window} setActive={setWindow} />
          <Filter label="Source type" values={sourceTypes} active={sourceType} setActive={setSourceType} />
        </aside>
      </div>
    </section>
  );
}

function Filter({ label, values, active, setActive }: { label: string; values: FilterItem[]; active: string; setActive: (value: string) => void }) {
  return (
    <div className="mb-[18px]">
      <Eyebrow>{label}</Eyebrow>
      {values.map((item) => {
        const selected = active === item.label;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => setActive(item.label)}
            className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-[5px] text-left text-[12.5px] transition-colors ${selected ? 'bg-[var(--panel-2)] text-foreground' : 'text-muted-foreground hover:bg-[var(--panel)] hover:text-foreground'}`}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-mono text-[9.5px] text-dim">{item.n}</span>
          </button>
        );
      })}
    </div>
  );
}
