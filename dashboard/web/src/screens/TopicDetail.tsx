import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Eyebrow, LoadingRows, Provenance } from '../components/Desk';
import { api, invalidate, useQuery } from '../lib/api';
import { IconBookmark, IconCheck, IconStar } from '../components/icons';
import { categoryColor, categoryLabel, compact, formatDate, plural, sourceKind, titleCase } from '../lib/desk';
import './topics.css';

type Claim = {
  event_id: string;
  evidence_quote?: string;
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
type Reading = { read: boolean; read_at: string | null; rating: number | null; bookmarked: boolean; new_claims: number; new_refs: string[] };
const NO_READING: Reading = { read: false, read_at: null, rating: null, bookmarked: false, new_claims: 0, new_refs: [] };
const RATING_WORDS = ['', 'Not for me', 'Somewhat interesting', 'Interesting', 'Very interesting', 'Must read'];
type FilterItem = { label: string; n: number };

const claimSpeaker = (claim: Claim) => claim.source_channel || claim.source_label || compact(claim.source_title, 56) || 'Stored source';
const sourceFilterLabel = (claim: Claim) => {
  const label = sourceKind(claim.source_type);
  return label === 'Transcript' ? 'Transcripts' : label;
};

export function TopicDetail() {
  const { tag = '' } = useParams();
  const topic = decodeURIComponent(tag);
  const result = useQuery<any>(`/topics?tag=${encodeURIComponent(topic)}`, [topic], 30_000);
  const [speaker, setSpeaker] = useState('Everyone');
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [window, setWindow] = useState('All time');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const claims: Claim[] = result.data?.claims ?? [];
  const relatedTags: RelatedTag[] = result.data?.related_tags ?? [];
  const category: string | null = result.data?.version === 2 ? result.data?.category ?? null : null;
  const dek: string = result.data?.topic_dek ?? '';
  const description: string = result.data?.topic_description ?? '';
  // The page and its reading bar share one copy, so a change shows everywhere at once.
  const savedReading: Reading = result.data?.reading ?? NO_READING;
  const [reading, setReading] = useState<Reading>(savedReading);
  useEffect(() => { setReading(savedReading); }, [savedReading]);
  const newRefs = useMemo(() => new Set(reading.new_refs), [reading.new_refs]);

  const speakers = useMemo<FilterItem[]>(() => {
    const counts = new Map<string, number>();
    claims.forEach((claim) => counts.set(claimSpeaker(claim), (counts.get(claimSpeaker(claim)) ?? 0) + 1));
    return [
      { label: 'Everyone', n: claims.length },
      ...Array.from(counts, ([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    ];
  }, [claims]);
  const sourceTypes = useMemo<FilterItem[]>(() => {
    const labels = [...new Set(claims.map(sourceFilterLabel))].sort();
    return labels.map((label) => ({
      label,
      n: claims.filter((claim) => sourceFilterLabel(claim) === label).length,
    }));
  }, [claims]);
  const windows = useMemo<FilterItem[]>(() => {
    const countWithin = (days: number) => claims.filter((claim) => Date.now() >= new Date(`${claim.subject_date}T00:00:00Z`).getTime() && Date.now() - new Date(`${claim.subject_date}T00:00:00Z`).getTime() <= days * 86400000).length;
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
      return Date.now() >= new Date(`${claim.subject_date}T00:00:00Z`).getTime() && Date.now() - new Date(`${claim.subject_date}T00:00:00Z`).getTime() <= days * 86400000;
    }
    return true;
  });
  // Topics built from categories hold one category, so their evidence reads best grouped by source.
  const bySource = result.data?.version === 2;
  const groups = useMemo(() => {
    const keyOf = (claim: Claim) => (bySource ? claim.source_id : claim.primary_category);
    return Array.from(new Set(visible.map(keyOf))).map((key) => {
      const items = visible.filter((claim) => keyOf(claim) === key);
      return { key, heading: bySource ? compact(items[0].source_title, 110) || claimSpeaker(items[0]) : titleCase(key), items };
    });
  }, [visible, bySource]);
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
      {category ? (
        <Link className="mb-4 inline-block font-mono text-[11.5px] text-dim hover:text-[var(--accent-text)]" to={`/?category=${encodeURIComponent(category)}`}>← {categoryLabel(category)} topics</Link>
      ) : (
        <Link className="mb-4 inline-block font-mono text-[11.5px] text-dim hover:text-[var(--accent-text)]" to="/">← All topics</Link>
      )}
      <div className="mb-5 border-b border-[var(--line)] pb-4">
        {category ? (
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
            <span aria-hidden="true" className="size-[7px] rounded-full" style={{ background: categoryColor(category) }} />
            {categoryLabel(category)}
          </p>
        ) : null}
        <h1 className="mb-[7px] text-[23px] leading-tight font-medium tracking-[-0.025em] text-foreground md:text-[26px]">{result.data?.topic_title ?? titleCase(topic)}</h1>
        {dek ? <p className="mb-2.5 max-w-[70ch] font-serif text-[16px] leading-relaxed text-pretty text-muted-foreground">{dek}</p> : null}
        <p className="font-mono text-[11px] text-dim">
          {plural(claims.length, 'claim')}
          {bySource ? '' : ` · ${plural(new Set(claims.map(claimSpeaker)).size, 'source label')}`} · {plural(result.data?.sources?.length ?? 0, 'source')}
          {coverage ? ` · ${coverage}` : ''}
        </p>
        {category ? <ReadingBar tag={topic} reading={reading} setReading={setReading} onSaved={result.refetch} /> : null}
      </div>

      {relatedTags.length ? (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {relatedTags.slice(0, 6).map((item) => (
            <span key={item.tag} className="rounded-[3px] bg-surface-800 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {item.tag}
            </span>
          ))}
        </div>
      ) : null}

      <button type="button" aria-expanded={filtersOpen} aria-controls="claim-filters" onClick={() => setFiltersOpen((open) => !open)} className="mb-5 flex w-full cursor-pointer items-center justify-between rounded-lg border border-[var(--line-strong)] px-3.5 py-2.5 text-left text-[13.5px] lg:hidden">
        <span>Filter claims <span className="font-mono text-[11px] text-dim">· {[speaker, window, sourceType].filter((value) => value && value !== 'Everyone' && value !== 'All time').join(' · ') || 'none applied'}</span></span>
        <span aria-hidden="true" className="font-mono text-[15px] text-dim">{filtersOpen ? '−' : '+'}</span>
      </button>
      <div data-testid="topic-layout" className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_214px]">
        <div className="min-w-0">
          <Eyebrow>{bySource ? 'Evidence by source' : 'Evidence by category'}</Eyebrow>
          <p className="mb-6 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">{bySource
            ? description || 'Each source\'s claims are listed together. Read them to judge agreement, disagreement and uncertainty.'
            : 'Categories organize the retained claims. Read the evidence to assess agreement, disagreement, and uncertainty.'}</p>

          {filtered ? <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim"><span>showing {visible.length} of {claims.length} filed claims</span><button className="cursor-pointer rounded-[3px] bg-surface-800 px-[6px] py-[2px] text-[11px] text-[var(--accent-text)]" type="button" onClick={() => { setSpeaker('Everyone'); setSourceType(null); setWindow('All time'); }}>clear filters</button></div> : null}

          {visible.length === 0 ? (
            <EmptyState title="No claims match those filters">Choose another source, window, or source type.</EmptyState>
          ) : groups.map((group, groupIndex) => (
            <div className="mb-6 border-l-2 pl-4" style={{ borderLeftColor: ['var(--cat-red)', 'var(--cat-blue)', 'var(--cat-green)', 'var(--cat-gold)'][groupIndex % 4] }} key={group.key}>
              <h2 className="mb-[5px] text-[14.5px] font-medium tracking-tight text-foreground">{group.heading}</h2>
              {/* Separators end each item so a wrapped line never starts with one. */}
              {bySource ? (
                <p className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-dim"><span>{plural(group.items.length, 'claim')} ·</span><span>{sourceKind(group.items[0].source_type)}</span></p>
              ) : (
                <p className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-dim"><span><span className="text-[var(--accent-text)]">{plural(new Set(group.items.map(claimSpeaker)).size, 'source label')}</span> ·</span><span>{plural(group.items.length, 'claim')} ·</span><span>grounded in stored sources</span></p>
              )}
              {group.items.map((claim) => (
                <article data-testid="topic-claim" className="mb-3 border-b border-[var(--line)] pb-3 last:mb-0 last:border-0 last:pb-0" key={`${claim.event_id}-${claim.position}`}>
                  {newRefs.has(`${claim.event_id}:${claim.position}`) ? <p className="mb-1 font-mono text-[10.5px] tracking-[0.06em] text-[var(--accent-text)] uppercase" data-testid="topic-claim-new">New since you read</p> : null}
                  <p className="mb-[7px] font-serif text-[15px] leading-relaxed text-pretty text-foreground">{claim.text}</p>
                  {claim.evidence_quote ? <details className="mb-2 text-[13px] text-muted-foreground"><summary className="cursor-pointer">Supporting passage</summary><blockquote className="mt-2 border-l-2 border-[var(--brass)] pl-3">{claim.evidence_quote}</blockquote></details> : null}
                  <Link to={`/sources/${encodeURIComponent(claim.source_id)}`} className="mb-2 inline-block font-mono text-[11.5px] text-[var(--accent-text)] underline decoration-[var(--line-strong)] underline-offset-2 hover:decoration-current">Read retained source</Link>
                  {claim.source_url ? <a href={claim.source_url} target="_blank" rel="noreferrer" aria-label={`Open original source for ${claimSpeaker(claim)}`} className="block no-underline"><Provenance source={claimSpeaker(claim)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} /></a> : <Provenance source={claimSpeaker(claim)} kind={sourceKind(claim.source_type)} when={formatDate(claim.subject_date)} />}
                </article>
              ))}
            </div>
          ))}
        </div>

        <aside id="claim-filters" aria-label="Filter claims" className={`${filtersOpen ? 'block' : 'hidden'} order-first lg:order-none lg:sticky lg:top-[34px] lg:block`}>
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
    <div className="mb-3 lg:mb-[18px]">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap gap-1.5 lg:block">
      {values.map((item) => {
        const selected = active === item.label;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => setActive(item.label)}
            aria-pressed={selected}
            className={`flex max-w-full cursor-pointer items-baseline justify-between gap-2 rounded border px-2.5 py-[6px] text-left text-[13px] transition-colors lg:w-full lg:border-transparent lg:px-2 lg:py-[5px] lg:text-[12.5px] ${selected ? 'border-[var(--brass)] bg-[var(--panel-2)] text-foreground' : 'border-[var(--line-strong)] text-muted-foreground hover:bg-[var(--panel)] hover:text-foreground'}`}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-dim">{item.n}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}

/**
 * Mark read, rate how interesting the topic was, and bookmark it to come back
 * to. Each change shows at once and is saved straight away; the Topics list
 * shows the same marks.
 */
function ReadingBar({ tag, reading, setReading, onSaved }: { tag: string; reading: Reading; setReading: (reading: Reading) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (patch: { read?: boolean; rating?: number | null; bookmarked?: boolean }) => {
    const before = reading;
    setReading({
      ...reading, ...patch,
      read_at: patch.read ? new Date().toISOString() : patch.read === false ? null : reading.read_at,
      new_claims: patch.read !== undefined ? 0 : reading.new_claims,
      new_refs: patch.read !== undefined ? [] : reading.new_refs,
    } as Reading);
    setSaving(true);
    setError(null);
    try {
      setReading(await api<Reading>(`/topics/${encodeURIComponent(tag)}/reading`, { method: 'POST', body: JSON.stringify(patch) }));
      invalidate('/topics');
      onSaved();
    } catch (failure) {
      setReading(before);
      setError(failure instanceof Error ? failure.message : 'That change was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const pill = 'inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1 font-mono text-[11.5px] transition-colors disabled:cursor-wait';
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3" data-testid="topic-reading">
      {reading.read ? (
        <span className="inline-flex items-center gap-2.5 font-mono text-[11.5px]">
          <span className="inline-flex items-center gap-1 text-[var(--sage)]"><IconCheck size={15} />Read{reading.read_at ? ` ${formatDate(reading.read_at)}` : ''}</span>
          <button type="button" disabled={saving} onClick={() => change({ read: false })} className="cursor-pointer text-dim underline-offset-2 hover:text-foreground hover:underline">Mark unread</button>
        </span>
      ) : (
        <button type="button" disabled={saving} onClick={() => change({ read: true })} className={`${pill} border-[var(--line-strong)] text-foreground hover:border-[var(--brass)]`}>
          <IconCheck size={14} />Mark as read
        </button>
      )}

      <div role="radiogroup" aria-label="How interesting was this topic?" className="inline-flex items-center">
        <span className="mr-1.5 font-mono text-[11px] text-dim">Interest</span>
        {[1, 2, 3, 4, 5].map((value) => {
          const on = (reading.rating ?? 0) >= value;
          return (
            <button key={value} type="button" role="radio" aria-checked={reading.rating === value} disabled={saving}
              aria-label={`${value} of 5: ${RATING_WORDS[value]}${reading.rating === value ? ' (select again to clear)' : ''}`}
              title={RATING_WORDS[value]}
              onClick={() => change({ rating: reading.rating === value ? null : value })}
              className={`grid size-8 cursor-pointer place-items-center rounded transition-colors ${on ? 'text-[var(--brass)]' : 'text-dim hover:text-muted-foreground'}`}>
              <IconStar filled={on} size={18} />
            </button>
          );
        })}
        {reading.rating ? <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{RATING_WORDS[reading.rating]}</span> : null}
      </div>

      <button type="button" aria-pressed={reading.bookmarked} disabled={saving} onClick={() => change({ bookmarked: !reading.bookmarked })}
        className={`${pill} ${reading.bookmarked ? 'border-[var(--brass)] bg-[var(--panel-2)] text-foreground' : 'border-[var(--line-strong)] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground'}`}>
        <span className={reading.bookmarked ? 'text-[var(--brass)]' : ''}><IconBookmark filled={reading.bookmarked} size={15} /></span>
        {reading.bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>

      {reading.read && reading.new_claims ? (
        <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--accent-text)]">
          <span>{plural(reading.new_claims, 'claim')} added since you read this</span>
          <button type="button" disabled={saving} onClick={() => change({ read: true })} className="cursor-pointer underline underline-offset-2 hover:text-foreground">Mark read again</button>
        </span>
      ) : null}
      {error ? <span role="alert" className="font-mono text-[11px] text-[var(--danger-text)]">{error}</span> : null}
    </div>
  );
}
