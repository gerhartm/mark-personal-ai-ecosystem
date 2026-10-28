import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chip, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { FundingRounds } from '../components/FundingRounds';
import { useQuery } from '../lib/api';
import { CATEGORIES } from '../lib/categories';
import { categoryColor, categoryLabel, formatDate, plural, titleCase } from '../lib/desk';
import { IconBookmark, IconCheck, IconStar } from '../components/icons';

type LegacyTopic = {
  tag: string;
  title?: string;
  unfiled?: boolean;
  event_count: number;
  claim_count: number;
  source_count: number;
  latest_subject_date: string | null;
  max_significance: number;
  tags: string[];
};

type Reading = { read: boolean; read_at: string | null; rating: number | null; bookmarked: boolean; new_claims: number };
type CategoryTopic = {
  tag: string;
  title: string;
  dek: string;
  description?: string;
  category: string;
  claim_count: number;
  source_count: number;
  latest_subject_date: string | null;
  latest_added_at: string | null;
  reading?: Reading | null;
};

type CategorySummary = { id: string; label: string; scope: string; topic_count: number; claim_count: number; unsorted_count: number };
type WaitingClaim = { ref: string; source_id: string; text: string; source: string; category: string; added_at: string | null };
type TopicsPayload =
  | { version: 2; categories: CategorySummary[]; topics: CategoryTopic[]; unsorted: WaitingClaim[] }
  | { version?: undefined; topics: LegacyTopic[] };

const PAGE = 60;
const SOURCE_PAGE = 20;
const TOP_TAGS = 12;
const searchField = 'w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-[13px] text-foreground placeholder:text-dim sm:w-72';
const moreButton = 'mt-4 w-full cursor-pointer rounded-lg border border-[var(--line-strong)] py-2.5 font-mono text-[12px] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground';
const accentLink = 'cursor-pointer text-[var(--accent-text)] underline-offset-2 hover:underline';

export function Topics() {
  const result = useQuery<TopicsPayload>('/topics', [], 30_000);
  if (result.loading && !result.data) return <LoadingRows rows={8} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;
  if (result.data?.version === 2) return <CategoryTopics data={result.data} />;
  return <LegacyTopics topics={(result.data?.topics ?? []) as LegacyTopic[]} />;
}

/* ------------------------------------------------------------------ *
 * Topics organized into the thirteen research categories
 * ------------------------------------------------------------------ */

type Sort = 'claims' | 'recent' | 'sources' | 'rating' | 'az';
const SORTS: Record<Sort, string> = { claims: 'Most claims', recent: 'Recently added', sources: 'Most sources', rating: 'Highest rated', az: 'A to Z' };
const byClaims = (a: CategoryTopic, b: CategoryTopic) => b.claim_count - a.claim_count || b.source_count - a.source_count || a.title.localeCompare(b.title);
const sorters: Record<Sort, (a: CategoryTopic, b: CategoryTopic) => number> = {
  claims: byClaims,
  recent: (a, b) => String(b.latest_added_at).localeCompare(String(a.latest_added_at)) || b.claim_count - a.claim_count,
  sources: (a, b) => b.source_count - a.source_count || b.claim_count - a.claim_count || a.title.localeCompare(b.title),
  rating: (a, b) => (b.reading?.rating ?? 0) - (a.reading?.rating ?? 0) || byClaims(a, b),
  az: (a, b) => a.title.localeCompare(b.title),
};

/** Reading filter: all topics, ones not yet read, bookmarked ones, or ones already read. */
type Show = 'all' | 'unread' | 'bookmarked' | 'read';
const SHOWS: Record<Show, string> = { all: 'All topics', unread: 'Unread', bookmarked: 'Bookmarked', read: 'Read' };
const shows: Record<Show, (topic: CategoryTopic) => boolean> = {
  all: () => true,
  unread: (topic) => !topic.reading?.read,
  bookmarked: (topic) => Boolean(topic.reading?.bookmarked),
  read: (topic) => Boolean(topic.reading?.read),
};
const isShow = (value: string | null): value is Show => value != null && Object.hasOwn(SHOWS, value);

/** Claims that are not in a topic, kept together under the source they came from. */
type SourceGroup = { source_id: string; source: string; latest: string; claims: WaitingClaim[] };
function bySourceGroups(claims: WaitingClaim[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const claim of claims) {
    const group = groups.get(claim.source_id) ?? { source_id: claim.source_id, source: claim.source, latest: '', claims: [] };
    group.claims.push(claim);
    if (String(claim.added_at ?? '') > group.latest) group.latest = String(claim.added_at ?? '');
    groups.set(claim.source_id, group);
  }
  return [...groups.values()].sort((a, b) => b.claims.length - a.claims.length || b.latest.localeCompare(a.latest));
}

/** Read, rating, bookmark and new-claim marks shown on a topic card. */
function ReadingMarks({ reading }: { reading?: Reading | null }) {
  if (!reading) return null;
  const parts: string[] = [];
  if (reading.bookmarked) parts.push('bookmarked');
  if (reading.read) parts.push('read');
  if (reading.rating) parts.push(`rated ${reading.rating} of 5`);
  if (reading.read && reading.new_claims) parts.push(`${plural(reading.new_claims, 'new claim')} since you read it`);
  return (
    <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] normal-case tracking-normal" aria-label={parts.join(', ')} data-testid="topic-reading-marks">
      {reading.read && reading.new_claims ? <span aria-hidden="true" className="rounded-[3px] bg-[var(--brass)]/15 px-1.5 py-[1px] text-[var(--accent-text)]">{reading.new_claims} new</span> : null}
      {reading.rating ? <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-[var(--brass)]"><IconStar filled size={12} />{reading.rating}</span> : null}
      {reading.read ? <span aria-hidden="true" className="text-[var(--sage)]"><IconCheck size={13} /></span> : null}
      {reading.bookmarked ? <span aria-hidden="true" className="text-[var(--brass)]"><IconBookmark filled size={13} /></span> : null}
    </span>
  );
}

function CategoryTopics({ data }: { data: Extract<TopicsPayload, { version: 2 }> }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('category');
  const category = CATEGORIES.some((item) => item.id === requested) ? requested! : 'all';
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('claims');
  const [shown, setShown] = useState(PAGE);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [waitingShown, setWaitingShown] = useState(SOURCE_PAGE);
  const requestedShow = params.get('show');
  const show: Show = isShow(requestedShow) ? requestedShow : 'all';
  const query = search.trim().toLowerCase();

  const chips = useMemo(() => [...data.categories].sort((a, b) => b.topic_count - a.topic_count
    || CATEGORIES.findIndex((item) => item.id === a.id) - CATEGORIES.findIndex((item) => item.id === b.id)), [data.categories]);
  const scope = data.categories.find((item) => item.id === category)?.scope;
  const inView = useMemo(() => data.topics
    .filter((topic) => category === 'all' || topic.category === category)
    .filter((topic) => !query || `${topic.title} ${topic.dek} ${topic.description ?? ''} ${categoryLabel(topic.category)}`.toLowerCase().includes(query)), [data.topics, category, query]);
  const showCounts = useMemo(() => Object.fromEntries((Object.keys(SHOWS) as Show[]).map((key) => [key, inView.filter(shows[key]).length])) as Record<Show, number>, [inView]);
  const topics = useMemo(() => inView.filter(shows[show]).sort(sorters[sort]), [inView, show, sort]);
  const waiting = useMemo(() => data.unsorted
    .filter((claim) => category === 'all' || claim.category === category)
    .filter((claim) => !query || `${claim.text} ${claim.source}`.toLowerCase().includes(query))
    .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at))), [data.unsorted, category, query]);
  const waitingGroups = useMemo(() => bySourceGroups(waiting), [waiting]);
  const filtering = category !== 'all' || Boolean(query) || show !== 'all';
  const showWaiting = show === 'all' && (waitingOpen || (filtering && topics.length === 0 && waiting.length > 0));

  const resetPaging = () => { setShown(PAGE); setWaitingShown(SOURCE_PAGE); };
  const chooseShow = (value: Show) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('show'); else next.set('show', value);
    setParams(next, { replace: true });
    resetPaging();
  };
  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'all' || id === category) next.delete('category'); else next.set('category', id);
    setParams(next, { replace: true });
    resetPaging();
  };
  const clearFilters = () => {
    setSearch('');
    const next = new URLSearchParams(params);
    next.delete('category');
    next.delete('show');
    setParams(next, { replace: true });
    resetPaging();
  };

  return (
    <section>
      <ViewHead
        title="Topics"
        actions={<input type="search" aria-label="Search topics" placeholder="Search topics" value={search} onChange={(event) => { setSearch(event.target.value); resetPaging(); }} className={searchField} />}
      >
        {plural(data.topics.length, 'topic')} across {CATEGORIES.length} categories{data.unsorted.length ? `, plus ${plural(data.unsorted.length, 'claim')} not in a topic yet` : ''}.
      </ViewHead>

      <div aria-label="Filter by category" className="no-scrollbar -mx-5 mb-3 flex items-center gap-1.5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>button]:shrink-0">
        <Chip active={category === 'all'} onClick={() => choose('all')}>All</Chip>
        {chips.map((item) => (
          <Chip key={item.id} active={category === item.id} onClick={() => choose(item.id)} label={`${item.label}, ${plural(item.topic_count, 'topic')}`}>
            <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ background: categoryColor(item.id) }} />
            {item.label} <span className="text-dim">{item.topic_count}</span>
          </Chip>
        ))}
      </div>
      {scope ? <p className="mb-3 max-w-[72ch] font-serif text-[14px] leading-relaxed text-muted-foreground">{scope}</p> : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--line)] pb-3 font-mono text-[11px] text-dim">
        <p role="status" className="min-w-0">
          {filtering
            ? <>{plural(topics.length, 'topic')}{show === 'all' ? <> and {plural(waiting.length, 'unfiled claim')}</> : null} match · <button type="button" onClick={clearFilters} className={accentLink}>Clear filters</button></>
            : <span className="hidden sm:inline">New claims are filed as sources finish processing · <Link className={accentLink} to="/sources">Sources and processing</Link></span>}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            <span>Show</span>
            <select data-testid="topics-show" value={show} onChange={(event) => chooseShow(event.target.value as Show)} className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground">
              {(Object.keys(SHOWS) as Show[]).map((key) => <option key={key} value={key}>{SHOWS[key]} ({showCounts[key]})</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span>Sort</span>
            <select value={sort} onChange={(event) => { setSort(event.target.value as Sort); resetPaging(); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground">
              {(Object.keys(SORTS) as Sort[]).map((key) => <option key={key} value={key}>{SORTS[key]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {category === 'venture' ? <FundingRounds search={query} /> : null}

      {topics.length === 0 ? (
        <p className="mb-6 rounded-lg border border-dashed border-[var(--line-strong)] p-5 text-[13.5px] text-muted-foreground">
          {show === 'bookmarked' && !showCounts.bookmarked ? 'No bookmarks yet. Bookmark a topic from its page to come back to it.'
            : show === 'read' && !showCounts.read ? 'Nothing marked read yet. Mark a topic read from its page.'
              : filtering ? 'No topics match.' : 'No topics yet.'}
          {' '}{show === 'all' && waiting.length ? 'Matching claims that are not in a topic yet are listed below.' : ''}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {topics.slice(0, shown).map((topic) => (
            <li key={topic.tag} className="flex">
              <Link to={`/topics/${encodeURIComponent(topic.tag)}`} className="group flex min-h-[150px] w-full flex-col rounded-lg border-2 border-[var(--line-strong)] bg-card p-4 transition-colors hover:border-[var(--brass)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)]">
                <p className="mb-2 flex items-center justify-between gap-2 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ background: categoryColor(topic.category) }} />
                    {categoryLabel(topic.category)}
                  </span>
                  <ReadingMarks reading={topic.reading} />
                </p>
                <h2 className="text-[15px] leading-snug font-medium tracking-tight text-foreground">{topic.title}</h2>
                {topic.dek ? <p className="mt-1.5 font-serif text-[14px] leading-relaxed text-muted-foreground">{topic.dek}</p> : null}
                <div className="mt-auto flex items-baseline justify-between gap-3 pt-3 font-mono text-[11px] text-dim">
                  <span><b className="font-medium text-muted-foreground">{topic.claim_count}</b> {topic.claim_count === 1 ? 'claim' : 'claims'} · {plural(topic.source_count, 'source')}</span>
                  {topic.latest_added_at ? <span>Added {formatDate(topic.latest_added_at)}</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {topics.length > shown ? (
        <button type="button" onClick={() => setShown((count) => count + PAGE)} className={moreButton}>
          Show {Math.min(PAGE, topics.length - shown)} more of {topics.length - shown} remaining topics
        </button>
      ) : null}

      {show === 'all' && waiting.length ? (
        <section className="mt-10 border-t border-[var(--line)] pt-5" aria-labelledby="waiting-heading" data-testid="topics-unfiled">
          <h2 id="waiting-heading" className="text-[15px] font-medium text-foreground">
            <button type="button" aria-expanded={showWaiting} aria-controls="waiting-claims" onClick={() => setWaitingOpen(!showWaiting)} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left">
              <span>Points not in a topic yet <span className="font-normal text-dim">({plural(waiting.length, 'claim')} from {plural(waitingGroups.length, 'source')})</span></span>
              <span aria-hidden="true" className="font-mono text-[15px] text-dim">{showWaiting ? '−' : '+'}</span>
            </button>
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">One-off points stay with their source. A point joins a topic when another claim tells the same story.</p>
          {showWaiting ? (
            <>
              <div id="waiting-claims" className="mt-4 space-y-5">
                {waitingGroups.slice(0, waitingShown).map((group) => (
                  <section key={group.source_id} aria-label={group.source} className="border-l-2 border-[var(--line-strong)] pl-4">
                    <h3 className="text-[14px] font-medium leading-snug text-foreground">
                      <Link to={`/sources/${encodeURIComponent(group.source_id)}`} className="hover:text-[var(--accent-text)]">{group.source}</Link>
                    </h3>
                    <p className="mb-1.5 font-mono text-[11px] text-dim">{plural(group.claims.length, 'point')}</p>
                    <ul className="divide-y divide-[var(--line)]">
                      {group.claims.map((claim) => (
                        <li key={claim.ref} className="py-2">
                          <span className="block text-[13.5px] leading-relaxed text-foreground">{claim.text}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-dim">
                            <span aria-hidden="true" className="size-[6px] shrink-0 rounded-full" style={{ background: categoryColor(claim.category) }} />
                            {categoryLabel(claim.category)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              {waitingGroups.length > waitingShown ? (
                <button type="button" onClick={() => setWaitingShown((count) => count + SOURCE_PAGE)} className={moreButton}>
                  Show {Math.min(SOURCE_PAGE, waitingGroups.length - waitingShown)} more of {waitingGroups.length - waitingShown} remaining sources
                </button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Earlier organization, shown until the first rebuild with categories
 * ------------------------------------------------------------------ */

type LegacySort = 'claims' | 'sources' | 'az';
const LEGACY_SORTS: Record<LegacySort, string> = { claims: 'Most claims', sources: 'Most sources', az: 'A to Z' };
const titleOf = (topic: LegacyTopic) => topic.title ?? titleCase(topic.tag);
const legacyCompare: Record<LegacySort, (a: LegacyTopic, b: LegacyTopic) => number> = {
  claims: (a, b) => b.claim_count - a.claim_count || b.source_count - a.source_count || titleOf(a).localeCompare(titleOf(b)),
  sources: (a, b) => b.source_count - a.source_count || b.claim_count - a.claim_count || titleOf(a).localeCompare(titleOf(b)),
  az: (a, b) => titleOf(a).localeCompare(titleOf(b)),
};

function LegacyTopics({ topics }: { topics: LegacyTopic[] }) {
  const [active, setActive] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LegacySort>('claims');
  const [shown, setShown] = useState(PAGE);
  const [allTags, setAllTags] = useState(false);
  const [singlesOpen, setSinglesOpen] = useState(false);
  const [singlesShown, setSinglesShown] = useState(PAGE);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const topic of topics) for (const tag of topic.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || titleCase(a[0]).localeCompare(titleCase(b[0])));
  }, [topics]);
  const tagRow = useMemo(() => {
    if (allTags) return [...tagCounts].sort((a, b) => titleCase(a[0]).localeCompare(titleCase(b[0])));
    const top = tagCounts.slice(0, TOP_TAGS);
    const extra = tagCounts.filter(([tag]) => active.includes(tag) && !top.some(([kept]) => kept === tag));
    return [...top, ...extra];
  }, [tagCounts, allTags, active]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => topics
    .filter((topic) => active.length === 0 || active.some((tag) => topic.tags.includes(tag)))
    .filter((topic) => !query || `${titleOf(topic)} ${topic.tags.map(titleCase).join(' ')}`.toLowerCase().includes(query))
    .sort(legacyCompare[sort]), [topics, active, query, sort]);
  // A topic groups two or more claims; one-claim entries are evidence the last
  // Topics rebuild has not grouped yet, so they get their own section.
  const grouped = filtered.filter((topic) => topic.claim_count > 1 && !topic.unfiled);
  const unfiled = filtered.filter((topic) => topic.unfiled);
  const singles = filtered.filter((topic) => topic.claim_count <= 1 && !topic.unfiled);
  const groupedTotal = topics.filter((topic) => topic.claim_count > 1 && !topic.unfiled).length;
  const singlesTotal = topics.filter((topic) => topic.claim_count <= 1 && !topic.unfiled).length;
  const filtering = active.length > 0 || Boolean(query);
  const showSingles = singlesOpen || (filtering && grouped.length === 0 && singles.length > 0);

  const resetPaging = () => { setShown(PAGE); setSinglesShown(PAGE); };
  const toggle = (tag: string) => {
    setActive((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    resetPaging();
  };
  const clearFilters = () => { setActive([]); setSearch(''); resetPaging(); };

  return (
    <section>
      <ViewHead
        title="Topics"
        actions={<input type="search" aria-label="Search topics and tags" placeholder="Search topics and tags" value={search} onChange={(event) => { setSearch(event.target.value); resetPaging(); }} className={searchField} />}
      >
        {plural(groupedTotal, 'topic')} grouped from your sources, plus {plural(singlesTotal, 'single claim')} not yet grouped.
      </ViewHead>

      <div aria-label="Filter by tag" className={`mb-3 flex items-center gap-1.5 ${allTags ? 'max-h-72 flex-wrap overflow-y-auto rounded-lg border border-[var(--line)] p-2' : 'no-scrollbar -mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>button]:shrink-0'}`}>
        <Chip active={active.length === 0} onClick={() => { setActive([]); resetPaging(); }}>All</Chip>
        {tagRow.map(([tag, count]) => (
          <Chip key={tag} active={active.includes(tag)} onClick={() => toggle(tag)} label={`${titleCase(tag)}, ${plural(count, 'topic')}`}>
            {titleCase(tag)} <span className="text-dim">{count}</span>
          </Chip>
        ))}
        <button type="button" aria-expanded={allTags} onClick={() => setAllTags((open) => !open)} className="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-[11.5px] text-[var(--accent-text)] underline-offset-2 hover:underline">
          {allTags ? 'Show fewer tags' : `All ${tagCounts.length} tags`}
        </button>
      </div>

      <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 font-mono text-[11px] text-dim">
        <p role="status" className="min-w-0">
          {filtering
            ? <>{plural(grouped.length, 'topic')} and {plural(singles.length, 'single claim')} match · <button type="button" onClick={clearFilters} className={accentLink}>Clear filters</button></>
            : <span className="hidden sm:inline">Updates as sources finish processing · <Link className={accentLink} to="/sources">Sources and processing</Link></span>}
        </p>
        <label className="flex shrink-0 items-center gap-2">
          <span>Sort</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as LegacySort); resetPaging(); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground">
            {(Object.keys(LEGACY_SORTS) as LegacySort[]).map((key) => <option key={key} value={key}>{LEGACY_SORTS[key]}</option>)}
          </select>
        </label>
      </div>

      {grouped.length === 0 && unfiled.length === 0 ? (
        <p className="mb-6 rounded-lg border border-dashed border-[var(--line-strong)] p-5 text-[13.5px] text-muted-foreground">
          {filtering ? 'No grouped topics match.' : 'No grouped topics yet.'} {singles.length ? 'Matching single claims are listed below.' : ''}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...grouped.slice(0, shown), ...unfiled].map((topic) => (
            <li key={topic.tag} className="flex">
              <Link to={`/topics/${encodeURIComponent(topic.tag)}`} className={`group flex min-h-[132px] w-full flex-col rounded-lg border-2 bg-card p-3.5 transition-colors hover:border-[var(--brass)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)] ${topic.unfiled ? 'border-dashed border-[var(--line-strong)]' : 'border-[var(--line-strong)]'}`}>
                <h2 className="text-[14px] font-medium leading-snug tracking-tight text-foreground">{titleOf(topic)}</h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {topic.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-[3px] bg-surface-800 px-1.5 py-[2px] font-mono text-[11px] text-muted-foreground">{titleCase(tag)}</span>)}
                </div>
                <div className="mt-auto flex items-baseline justify-between pt-3 font-mono text-[11px] text-dim">
                  <span><b className="font-medium text-muted-foreground">{topic.claim_count}</b> {topic.claim_count === 1 ? 'claim' : 'claims'}</span>
                  <span>{plural(topic.source_count, 'source')}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {grouped.length > shown ? (
        <button type="button" onClick={() => setShown((count) => count + PAGE)} className={moreButton}>
          Show {Math.min(PAGE, grouped.length - shown)} more of {grouped.length - shown} remaining topics
        </button>
      ) : null}

      {singles.length ? (
        <section className="mt-10 border-t border-[var(--line)] pt-5" aria-labelledby="single-claims-heading">
          <h2 id="single-claims-heading" className="text-[15px] font-medium text-foreground">
            <button type="button" aria-expanded={showSingles} aria-controls="single-claims" onClick={() => setSinglesOpen(!showSingles)} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left">
              <span>Single claims not yet in a topic <span className="font-normal text-dim">({singles.length})</span></span>
              <span aria-hidden="true" className="font-mono text-[15px] text-dim">{showSingles ? '−' : '+'}</span>
            </button>
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">Each holds one claim from one source. Rebuilding Topics in Control center can group them.</p>
          {showSingles ? (
            <>
              <ul id="single-claims" className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {singles.slice(0, singlesShown).map((topic) => (
                  <li key={topic.tag}>
                    <Link to={`/topics/${encodeURIComponent(topic.tag)}`} className="flex items-baseline justify-between gap-4 py-2.5 text-[13.5px] text-foreground hover:text-[var(--accent-text)]">
                      <span className="min-w-0">{titleOf(topic)}</span>
                      {topic.tags[0] ? <span className="shrink-0 font-mono text-[11px] text-dim">{titleCase(topic.tags[0])}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {singles.length > singlesShown ? (
                <button type="button" onClick={() => setSinglesShown((count) => count + PAGE)} className={moreButton}>
                  Show {Math.min(PAGE, singles.length - singlesShown)} more of {singles.length - singlesShown} remaining
                </button>
              ) : null}
              <p className="mt-3 font-mono text-[11px] text-dim"><Link className={accentLink} to="/control-center">Open Control center to rebuild Topics</Link></p>
            </>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
