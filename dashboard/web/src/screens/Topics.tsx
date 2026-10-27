import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { plural, titleCase } from '../lib/desk';

type Topic = {
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
type Sort = 'claims' | 'sources' | 'az';

const PAGE = 60;
const TOP_TAGS = 12;
const SORTS: Record<Sort, string> = { claims: 'Most claims', sources: 'Most sources', az: 'A to Z' };

const titleOf = (topic: Topic) => topic.title ?? titleCase(topic.tag);
const compare: Record<Sort, (a: Topic, b: Topic) => number> = {
  claims: (a, b) => b.claim_count - a.claim_count || b.source_count - a.source_count || titleOf(a).localeCompare(titleOf(b)),
  sources: (a, b) => b.source_count - a.source_count || b.claim_count - a.claim_count || titleOf(a).localeCompare(titleOf(b)),
  az: (a, b) => titleOf(a).localeCompare(titleOf(b)),
};

export function Topics() {
  const result = useQuery<{ topics: Topic[] }>('/topics', [], 10_000);
  const [active, setActive] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('claims');
  const [shown, setShown] = useState(PAGE);
  const [allTags, setAllTags] = useState(false);
  const [singlesOpen, setSinglesOpen] = useState(false);
  const [singlesShown, setSinglesShown] = useState(PAGE);
  const topics = result.data?.topics ?? [];

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
    .sort(compare[sort]), [topics, active, query, sort]);
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

  if (result.loading && !result.data) return <LoadingRows rows={8} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;

  return (
    <section>
      <ViewHead
        title="Topics"
        actions={<input type="search" aria-label="Search topics and tags" placeholder="Search topics and tags" value={search} onChange={(event) => { setSearch(event.target.value); resetPaging(); }} className="w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 text-[13px] text-foreground placeholder:text-dim sm:w-72" />}
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
            ? <>{plural(grouped.length, 'topic')} and {plural(singles.length, 'single claim')} match · <button type="button" onClick={clearFilters} className="cursor-pointer text-[var(--accent-text)] underline-offset-2 hover:underline">Clear filters</button></>
            : <span className="hidden sm:inline">Updates as sources finish processing · <Link className="text-[var(--accent-text)] underline-offset-2 hover:underline" to="/sources">Sources and processing</Link></span>}
        </p>
        <label className="flex shrink-0 items-center gap-2">
          <span>Sort</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as Sort); resetPaging(); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground">
            {(Object.keys(SORTS) as Sort[]).map((key) => <option key={key} value={key}>{SORTS[key]}</option>)}
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
        <button type="button" onClick={() => setShown((count) => count + PAGE)} className="mt-4 w-full cursor-pointer rounded-lg border border-[var(--line-strong)] py-2.5 font-mono text-[12px] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground">
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
                <button type="button" onClick={() => setSinglesShown((count) => count + PAGE)} className="mt-3 w-full cursor-pointer rounded-lg border border-[var(--line-strong)] py-2.5 font-mono text-[12px] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground">
                  Show {Math.min(PAGE, singles.length - singlesShown)} more of {singles.length - singlesShown} remaining
                </button>
              ) : null}
              <p className="mt-3 font-mono text-[11px] text-dim"><Link className="text-[var(--accent-text)] underline-offset-2 hover:underline" to="/control-center">Open Control center to rebuild Topics</Link></p>
            </>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
