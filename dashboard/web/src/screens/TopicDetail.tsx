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
const sourceFilterLabel = (claim: Claim) => {
  const label = sourceKind(claim.source_type);
  return label === 'Transcript' ? 'Transcripts' : label;
};

export function TopicDetail() {
  const { tag = '' } = useParams();
  const topic = decodeURIComponent(tag);
  const result = useQuery<any>(`/topics?tag=${encodeURIComponent(topic)}`, [topic]);
  const [speaker, setSpeaker] = useState('Everyone');
  const [sourceType, setSourceType] = useState<string | null>(null);
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
    const labels = ['Transcripts', 'Tweet', 'Blog post', 'Your notes'];
    return labels.map((label) => ({
      label,
      n: claims.filter((claim) => sourceFilterLabel(claim) === label).length,
    }));
  }, [claims]);
  const windows = useMemo<FilterItem[]>(() => {
    const countWithin = (days: number) => claims.filter((claim) => Date.now() - new Date(`${claim.subject_date}T00:00:00Z`).getTime() <= days * 86400000).length;
    return [
      { label: 'All time', n: claims.length },
      { label: 'Last 30 days', n: countWithin(30) },
      { label: 'Last 90 days', n: countWithin(90) },
    ];
  }, [claims]);
  const visible = claims.filter((claim) => {
    if (speaker !== 'Everyone' && claimSpeaker(claim) !== speaker) return false;
    if (sourceType && sourceFilterLabel(claim) !== sourceType) return false;
    if (window === 'Last 30 days' || window === 'Last 90 days') {
      const days = window === 'Last 30 days' ? 30 : 90;
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
  const filtered = speaker !== 'Everyone' || sourceType !== null || window !== 'All time';
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
      <Link className="mb-4 inline-block font-mono text-[10px] text-dim hover:text-[var(--brass)]" to="/">← all topics</Link>
      <div className="mb-5 border-b border-[var(--line)] pb-4">
        <h1 className="mb-[7px] text-[26px] font-medium tracking-[-0.025em] text-foreground">{titleCase(topic)}</h1>
        <p className="font-mono text-[10px] text-dim">
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

      <div data-testid="topic-layout" className="grid items-start gap-7 lg:grid-cols-[1fr_214px]">
        <div>
          <Eyebrow>Where the argument sits</Eyebrow>
          <div className="mb-1.5 flex h-[26px] overflow-hidden rounded border border-[var(--line)]">
            {groups.map((group, index) => (
              <span key={group.category} title={titleCase(group.category)} className="flex items-center px-[9px] font-mono text-[9.5px] font-bold tracking-[0.04em] text-background" style={{ width: `${groupWeights[index]}%`, background: ['var(--cat-red)', 'var(--cat-blue)', 'var(--cat-green)', 'var(--cat-gold)'][index % 4] }}>
                {String.fromCharCode(65 + index)} · {groupWeights[index]}%
              </span>
            ))}
          </div>
          <p className="mb-6 font-mono text-[9.5px] text-dim">Share of claims per position, weighted by distinct speaker, not raw mentions.</p>

          {groups.length > 1 && visible.length > 1 ? <div className="mb-6 rounded-md border-2 border-[var(--line-strong)] bg-[var(--panel)] px-[15px] py-[13px]"><div className="mb-[7px] font-mono text-[9.5px] tracking-[0.1em] uppercase text-[var(--rose)]">Actively contested</div><p className="m-0 font-serif text-[14.5px] leading-relaxed text-pretty text-foreground">The retained material approaches this topic through {groups.length} evidence positions. Open the claims and their sources before treating one view as consensus.</p></div> : null}

          {filtered ? <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[9.5px] text-dim"><span>showing {visible.length} of {claims.length} filed claims</span><button className="rounded-[3px] bg-surface-800 px-[6px] py-[2px] text-[9.5px] text-[var(--brass)]" type="button" onClick={() => { setSpeaker('Everyone'); setSourceType(null); setWindow('All time'); }}>clear filters</button></div> : null}

          {visible.length === 0 ? (
            <EmptyState title="No claims match those filters">Choose another source, window, or source type.</EmptyState>
          ) : groups.map((group, groupIndex) => (
            <div className="mb-6 border-l-2 pl-4" style={{ borderLeftColor: ['var(--cat-red)', 'var(--cat-blue)', 'var(--cat-green)', 'var(--cat-gold)'][groupIndex % 4] }} key={group.category}>
              <h2 className="mb-[5px] text-[14.5px] font-medium tracking-tight text-foreground">{titleCase(group.category)}</h2>
              <p className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[9.5px] text-dim"><span className="text-[var(--brass)]">{new Set(group.items.map(claimSpeaker)).size} speakers</span> · {group.items.length} claims · grounded in stored sources</p>
              {group.items.map((claim) => (
                <article data-testid="topic-claim" className="mb-3 border-b border-[var(--line)] pb-3 last:mb-0 last:border-0 last:pb-0" key={`${claim.event_id}-${claim.position}`}>
                  <p className="mb-[7px] font-serif text-[15px] leading-relaxed text-pretty text-foreground">{claim.text}</p>
                  {claim.source_url ? <a href={claim.source_url} target="_blank" rel="noreferrer" aria-label={`Open original source for ${claimSpeaker(claim)}`} className="block no-underline"><Provenance source={claimSpeaker(claim)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} /></a> : <Provenance source={claimSpeaker(claim)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} />}
                </article>
              ))}
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-[34px]">
          <Filter label="Filter by source" values={speakers} active={speaker} setActive={setSpeaker} />
          <Filter label="Window" values={windows} active={window} setActive={setWindow} />
          <Filter label="Source type" values={sourceTypes} active={sourceType ?? ''} setActive={(value) => setSourceType(value === sourceType ? null : value)} />
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
