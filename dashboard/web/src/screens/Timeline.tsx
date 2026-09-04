import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingRows } from '../components/Desk';
import { ExactDialog } from '../components/ExactDialog';
import { useQuery } from '../lib/api';
import { categoryColor, compact, formatDate, readableText, sourceKind, titleCase } from '../lib/desk';
import './timeline.css';

type Pin = {
  event_id: string;
  position: number;
  date: string;
  precision: string;
  label: string;
  category: string;
  sort_key: string;
  span_end: string;
  primary_category: string;
  significance: number;
  summary: string;
  key_takeaway?: string;
  detailed_content?: string;
  source_id: string;
  source_title?: string;
  source_label?: string;
  source_url?: string;
  reference_count: number;
};

type DossierSource = {
  source_id: string;
  headline: string;
  outlet: string;
  kind: string;
  when?: string;
  url?: string | null;
  event_id: string;
};

type DossierReaction = {
  event_id: string;
  source_id: string;
  who: string;
  stance: string;
  line: string;
};

type Dossier = {
  event: {
    id: string;
    title: string;
    category: string;
    date?: string;
    reference_count: number;
    significance: number;
  };
  significance: string[];
  so_what?: string | null;
  reactions: DossierReaction[];
  sources: DossierSource[];
  watch: string[];
  verified_at?: string | null;
};

const monthShort = (month: number) => new Intl.DateTimeFormat('en', {
  month: 'short',
  timeZone: 'UTC',
}).format(new Date(Date.UTC(2024, month - 1, 1)));

const formatMentions = (value: number) => {
  const count = Number(value || 0);
  if (count < 1_000) return String(count);
  const compacted = count / 1_000;
  return `${compacted >= 10 ? compacted.toFixed(1).replace(/\.0$/, '') : compacted.toFixed(1)}k`;
};

const samePin = (left: Pin, right: Pin) =>
  left.event_id === right.event_id && left.position === right.position;

const pinKey = (pin: Pin) => `${pin.event_id}-${pin.position}`;

const safeExternalUrl = (value?: string | null) => {
  const match = String(value ?? '').match(/https?:\/\/[^\s+]+/i);
  return match?.[0]?.replace(/[),.;]+$/, '') ?? null;
};

export function Timeline() {
  const result = useQuery<{ pins: Pin[]; bounds: { min: string; max: string } }>('/timeline');
  const pins = result.data?.pins ?? [];
  const years = useMemo(
    () => [...new Set(pins.map((pin) => Number(pin.sort_key.slice(0, 4))).filter(Boolean))]
      .sort((a, b) => a - b),
    [pins],
  );
  const defaultYear = years.at(-1) ?? new Date().getUTCFullYear();
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [category, setCategory] = useState('All');
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [selected, setSelected] = useState<Pin | null>(null);
  const [highlightedKey, setHighlightedKey] = useState('');
  const activeYear = chosenYear && years.includes(chosenYear) ? chosenYear : defaultYear;

  const yearPins = useMemo(
    () => pins.filter((pin) => Number(pin.sort_key.slice(0, 4)) === activeYear),
    [pins, activeYear],
  );
  const categories = useMemo(
    () => [...new Set(yearPins.map((pin) => pin.primary_category))]
      .sort((a, b) => titleCase(a).localeCompare(titleCase(b))),
    [yearPins],
  );
  const visible = yearPins.filter((pin) => category === 'All' || pin.primary_category === category);
  const topVisible = visible
    .slice()
    .sort((a, b) => Number(b.reference_count) - Number(a.reference_count) || b.significance - a.significance)[0];
  const activeKey = visible.some((pin) => pinKey(pin) === highlightedKey)
    ? highlightedKey
    : topVisible ? pinKey(topVisible) : '';
  const totalReferences = visible.reduce((sum, pin) => sum + Math.max(1, Number(pin.reference_count || 1)), 0);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = visible
      .filter((pin) => Number(pin.sort_key.slice(5, 7)) === month)
      .sort((a, b) => Number(b.reference_count) - Number(a.reference_count) || b.significance - a.significance);
    return { month, rows };
  }).filter((group) => group.rows.length);

  const chooseYear = (year: number) => {
    setChosenYear(year);
    setActiveMonth(null);
    const available = new Set(pins
      .filter((pin) => Number(pin.sort_key.slice(0, 4)) === year)
      .map((pin) => pin.primary_category));
    if (category !== 'All' && !available.has(category)) setCategory('All');
  };

  const chooseCategory = (next: string) => {
    setCategory(next);
    setActiveMonth(null);
  };

  const jumpToMonth = (month: number) => {
    setActiveMonth(month);
    requestAnimationFrame(() => document
      .getElementById(`timeline-month-${month}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const nextSignal = () => {
    if (!selected) return;
    const pool = yearPins
      .filter((pin) => pin.primary_category === selected.primary_category)
      .sort((a, b) => Number(b.reference_count) - Number(a.reference_count) || a.sort_key.localeCompare(b.sort_key));
    const current = pool.findIndex((pin) => samePin(pin, selected));
    const next = pool[(current + 1) % pool.length];
    if (next) {
      setSelected(next);
      setHighlightedKey(pinKey(next));
    }
  };

  const openEvent = (pin: Pin) => {
    setHighlightedKey(pinKey(pin));
    setSelected(pin);
  };

  if (result.loading && !result.data) return <LoadingRows rows={8} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;

  const chipClass = (active: boolean) => `flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-all active:scale-95 ${active ? 'bg-surface-800 text-foreground ring-line-strong' : 'bg-surface-900/50 text-muted-foreground ring-line hover:text-foreground hover:ring-line-strong'}`;
  const peak = Math.max(...visible.map((pin) => Number(pin.reference_count || 1)), 1);

  return (
    <div className="pb-12 md:pb-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <h1 className="text-[23px] font-medium tracking-tight text-foreground">Timeline</h1>
        <dl className="flex shrink-0 gap-6 font-mono">
          <div><dd className="text-lg text-foreground">{visible.length}</dd><dt className="text-[9px] tracking-widest uppercase text-dim">Events</dt></div>
          <div><dd className="text-lg text-foreground">{formatMentions(totalReferences)}</dd><dt className="text-[9px] tracking-widest uppercase text-dim">Mentions</dt></div>
        </dl>
      </div>

      <section aria-label="Select year">
        <YearSelector pins={pins} years={years} activeYear={activeYear} activeCategory={category} onYearSelect={chooseYear} onCategorySelect={(year, next) => { chooseYear(year); setCategory(category === next && year === activeYear ? 'All' : next); }} />
      </section>

      <section className="pt-4" aria-label="Year overview">
        <DensityStrip pins={yearPins} categories={categories} activeCategory={category} activeMonth={activeMonth} onJump={jumpToMonth} onCategorySelect={(next) => chooseCategory(category === next ? 'All' : next)} />
        <p className="mt-2 font-mono text-[9px] tracking-widest uppercase text-dim">{activeYear} · bars split by category · click a color band to filter that category</p>
      </section>

      <nav aria-label="Category filters" className="no-scrollbar flex gap-2 overflow-x-auto py-4">
        <button data-testid="timeline-category" aria-pressed={category === 'All'} type="button" onClick={() => chooseCategory('All')} className={chipClass(category === 'All')}>All Signals</button>
        {categories.map((item) => <button data-testid="timeline-category" aria-pressed={category === item} type="button" key={item} onClick={() => chooseCategory(item)} className={chipClass(category === item)}><span className="size-1.5 rounded-full" style={{ background: categoryColor(item) }} />{titleCase(item)}</button>)}
      </nav>

      {visible.length === 0 ? <EmptyState title="No dated events in this view">Choose another year or category.</EmptyState> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_290px]">
        <div className="divide-y divide-border">
          {months.map((group) => {
            const monthMentions = group.rows.reduce((sum, pin) => sum + Math.max(1, Number(pin.reference_count || 1)), 0);
            return <section key={group.month} id={`timeline-month-${group.month}`} className="scroll-mt-24 py-5">
              <header className="sticky top-0 z-10 -mx-1 flex items-baseline gap-3 bg-background/90 px-1 py-1.5 backdrop-blur-sm">
                <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-heading">{monthShort(group.month)}</h2>
                <span className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10.5px] font-medium text-muted-foreground">{group.rows.length} events · {formatMentions(monthMentions)} mentions</span>
              </header>
              <ul className="mt-1.5">
                {group.rows.map((pin) => {
                  const references = Math.max(1, Number(pin.reference_count || 1));
                  const width = Math.max(2, references / peak * 100);
                  const active = pinKey(pin) === activeKey;
                  return <li key={pinKey(pin)}><button data-testid="timeline-event" type="button" onClick={() => openEvent(pin)} aria-current={active} className={`group grid w-full grid-cols-[28px_1fr] items-center gap-3 rounded-md py-1.5 pr-2 pl-2 text-left transition-colors md:grid-cols-[32px_1fr_120px] ${active ? 'bg-surface-800' : 'hover:bg-surface-900/70'}`}>
                    <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground">{pin.sort_key.slice(8, 10)}</span>
                    <span className="flex min-w-0 items-center gap-2.5"><span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: categoryColor(pin.primary_category), boxShadow: active ? `0 0 8px color-mix(in srgb, ${categoryColor(pin.primary_category)} 16%, transparent)` : undefined }} /><span className={`truncate text-[13px] transition-colors ${active ? 'text-heading' : 'text-foreground group-hover:text-heading'}`}>{pin.label || compact(pin.summary, 100)}</span><span className="hidden shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-widest lg:inline" style={{ color: categoryColor(pin.primary_category) }}>{titleCase(pin.primary_category)}</span></span>
                    <span className="hidden items-center gap-2 md:flex"><span className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-800"><span className="block h-full rounded-full" style={{ width: `${width}%`, background: categoryColor(pin.primary_category) }} /></span><span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{formatMentions(references)}</span></span>
                  </button></li>;
                })}
              </ul>
            </section>;
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg ring-1 ring-line">
            <div className="flex items-baseline justify-between border-b border-border px-3 py-2"><h2 className="font-mono text-[10px] uppercase tracking-widest text-dim">Top signals</h2><span className="font-mono text-[10px] text-dim">{visible.length}</span></div>
            <ul className="max-h-[420px] overflow-y-auto lg:max-h-[560px]">
              {visible.slice().sort((a, b) => Number(b.reference_count) - Number(a.reference_count) || b.significance - a.significance).map((pin) => {
                const active = pinKey(pin) === activeKey;
                return <li key={`signal-${pinKey(pin)}`}><button type="button" onClick={() => openEvent(pin)} className={`flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left transition-colors ${active ? 'bg-surface-800' : 'hover:bg-surface-900/70'}`}><span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(pin.primary_category) }} /><span className="min-w-0 flex-1"><span className={`block truncate text-xs ${active ? 'text-heading' : 'text-foreground'}`}>{pin.label || compact(pin.summary, 70)}</span><span className="font-mono text-[9px] uppercase tracking-widest text-dim">{monthShort(Number(pin.sort_key.slice(5, 7)))} · {titleCase(pin.primary_category)}</span></span><span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatMentions(Math.max(1, Number(pin.reference_count || 1)))}</span></button></li>;
              })}
            </ul>
          </div>
        </div>
      </div>

      {selected ? <TimelineDialog pin={selected} close={() => setSelected(null)} nextSignal={nextSignal} /> : null}
    </div>
  );
}

function YearSelector({ pins, years, activeYear, activeCategory, onYearSelect, onCategorySelect }: {
  pins: Pin[];
  years: number[];
  activeYear: number;
  activeCategory: string;
  onYearSelect: (year: number) => void;
  onCategorySelect: (year: number, category: string) => void;
}) {
  const totals = years.map((year) => {
    const rows = pins.filter((pin) => Number(pin.sort_key.slice(0, 4)) === year);
    const categories = [...new Set(rows.map((pin) => pin.primary_category))]
      .sort((a, b) => titleCase(a).localeCompare(titleCase(b)));
    const segments = categories.map((category) => ({
      category,
      value: rows
        .filter((pin) => pin.primary_category === category)
        .reduce((sum, pin) => sum + Math.max(1, Number(pin.reference_count || 1)), 0),
    }));
    return {
      year,
      count: rows.length,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });
  const peak = Math.max(...totals.map((item) => item.total), 1);

  return (
    <div role="tablist" aria-label="Select year" className="no-scrollbar flex items-end gap-1 overflow-x-auto">
      {totals.map((item) => {
        const active = item.year === activeYear;
        const height = item.total / peak * 100;
        return <button data-testid="timeline-year" key={item.year} role="tab" aria-selected={active} type="button" onClick={() => onYearSelect(item.year)} className={`group flex min-w-[54px] flex-1 flex-col items-center gap-1.5 rounded-md px-1.5 pt-2 pb-1.5 transition-colors ${active ? 'bg-surface-800' : 'hover:bg-surface-900/70'}`}>
          <span className="flex h-8 w-full items-end overflow-hidden rounded-[2px]">
            <span className="flex w-full flex-col-reverse transition-all duration-300" style={{ height: `${Math.max(6, height)}%` }}>
              {item.segments.map((segment) => <span data-testid="timeline-year-segment" key={segment.category} role="button" tabIndex={0} title={`${titleCase(segment.category)} · ${formatMentions(segment.value)} mentions`} aria-label={`${titleCase(segment.category)} in ${item.year}, ${formatMentions(segment.value)} mentions`} className="w-full cursor-pointer transition-opacity" style={{ height: `${segment.value / item.total * 100}%`, background: categoryColor(segment.category), opacity: activeCategory === 'All' || activeCategory === segment.category ? 1 : .18 }} onClick={(event) => { event.stopPropagation(); onCategorySelect(item.year, segment.category); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onCategorySelect(item.year, segment.category); } }} />)}
            </span>
          </span>
          <span className={`font-mono text-[11px] tabular-nums transition-colors ${active ? 'text-heading' : 'text-dim group-hover:text-muted-foreground'}`}>{item.year}</span>
          <span className="font-mono text-[9px] text-dim">{item.count}</span>
        </button>;
      })}
    </div>
  );
}

function DensityStrip({ pins, categories, activeCategory, activeMonth, onJump, onCategorySelect }: {
  pins: Pin[];
  categories: string[];
  activeCategory: string;
  activeMonth: number | null;
  onJump: (month: number) => void;
  onCategorySelect: (category: string) => void;
}) {
  const monthTotals = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = pins.filter((pin) => Number(pin.sort_key.slice(5, 7)) === month);
    const segments = categories.map((category) => ({
      category,
      value: rows
        .filter((pin) => pin.primary_category === category)
        .reduce((sum, pin) => sum + Math.max(1, Number(pin.reference_count || 1)), 0),
    }));
    return { month, rows, segments, total: segments.reduce((sum, segment) => sum + segment.value, 0) };
  });
  const peak = Math.max(...monthTotals.map((item) => item.total), 1);

  return (
    <div className="grid grid-cols-12 gap-1 md:gap-1.5" aria-label="Event density by month">
      {monthTotals.map((item) => {
        const active = activeMonth === item.month;
        const height = item.total / peak * 100;
        return <div key={item.month} className={`group flex flex-col justify-end gap-1.5 rounded-md px-1 pt-2 pb-1.5 transition-colors ${active ? 'bg-surface-800' : 'hover:bg-surface-900/70'}`}>
          <button data-testid="timeline-month" type="button" onClick={() => onJump(item.month)} aria-label={`Jump to ${monthShort(item.month)} — ${item.rows.length} events`} className="flex h-16 w-full items-end overflow-hidden rounded-[3px] md:h-20">
            <span className="flex w-full flex-col-reverse overflow-hidden rounded-[2px] transition-all duration-300" style={{ height: `${Math.max(4, height)}%` }}>
              {item.segments.map((segment) => segment.value ? <span data-testid="timeline-month-segment" key={segment.category} role="button" tabIndex={0} title={`${titleCase(segment.category)} · ${formatMentions(segment.value)} mentions`} className="w-full cursor-pointer transition-opacity" style={{ height: `${segment.value / item.total * 100}%`, background: categoryColor(segment.category), opacity: activeCategory === 'All' || activeCategory === segment.category ? 1 : .18 }} onClick={(event) => { event.stopPropagation(); onJump(item.month); onCategorySelect(segment.category); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onCategorySelect(segment.category); } }} /> : null)}
            </span>
          </button>
          <span className={`text-center font-mono text-[9px] uppercase tracking-widest transition-colors ${active ? 'text-heading' : 'text-dim group-hover:text-muted-foreground'}`}>{monthShort(item.month)}</span>
        </div>;
      })}
    </div>
  );
}

function TimelineDialog({ pin, close, nextSignal }: {
  pin: Pin;
  close: () => void;
  nextSignal: () => void;
}) {
  const dossier = useQuery<Dossier>(`/timeline/${encodeURIComponent(pin.event_id)}/dossier`, [pin.event_id]);
  const data = dossier.data;
  const descriptionId = `timeline-dialog-description-${pin.event_id}`;

  return (
    <ExactDialog open onOpenChange={(open) => { if (!open) close(); }} closeLabel="Close event details" accessibleTitle={pin.label || compact(pin.summary, 140)} labelledBy="timeline-dialog-title" describedBy={descriptionId}>
      <div data-testid="timeline-dossier" className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: categoryColor(pin.primary_category) }}>{titleCase(pin.primary_category)}</span>
            <h2 id="timeline-dialog-title" className="text-lg font-medium leading-snug text-heading md:text-xl">{pin.label || compact(pin.summary, 140)}</h2>
            <span className="block font-mono text-[10px] text-muted-foreground">{formatDate(pin.sort_key)}</span>
          </div>
          <div className="shrink-0 text-right"><div className="font-mono text-xl text-heading">{formatMentions(Math.max(1, Number(pin.reference_count || 1)))}</div><div className="text-[9px] uppercase tracking-tighter text-muted-foreground md:text-[10px]">Mentions</div></div>
        </div>

        {dossier.loading && !data ? <div className="mt-4"><LoadingRows rows={4} /></div> : null}
        {dossier.error ? <div className="mt-4"><ErrorState error={dossier.error} retry={dossier.refetch} /></div> : null}

        {data ? <>
          <div id={descriptionId} className="mt-4 space-y-3 border-l-2 border-[var(--brass)] pl-4">
            {data.significance.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`} className="max-w-[64ch] font-serif text-[15px] leading-relaxed text-pretty text-foreground">{readableText(paragraph, 760)}</p>)}
          </div>

          {data.so_what ? <p className="mt-4 rounded-[5px] bg-surface-800/60 px-4 py-3 text-[12.5px] leading-snug text-foreground"><span className="mr-2 font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">So what</span>{readableText(data.so_what, 520)}</p> : null}

          <div data-testid="timeline-dossier-reactions" className="mt-6 border-t-2 border-[var(--line)] pt-4">
            <span className="mb-3 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Reactions · {data.reactions.length}</span>
            <div className="space-y-2.5">
              {data.reactions.map((reaction) => <div key={`${reaction.event_id}-${reaction.source_id}-${reaction.line.slice(0, 20)}`} className="rounded-[5px] border border-[var(--line)] px-3 py-2.5"><div className="mb-1 flex items-center gap-2"><span className="text-[11.5px] font-medium text-foreground">{readableText(reaction.who, 90)}</span><span className="rounded-[3px] bg-surface-800 px-[5px] py-[1.5px] font-mono text-[9px] text-muted-foreground">{titleCase(reaction.stance)}</span></div><p className="font-serif text-[14px] leading-relaxed text-pretty text-foreground">{readableText(reaction.line, 520)}</p></div>)}
              {!data.reactions.length ? <p className="font-serif text-[13.5px] leading-relaxed text-muted-foreground">No additional sourced positions are linked to this event.</p> : null}
            </div>
          </div>

          <div data-testid="timeline-dossier-sources" className="mt-6 border-t-2 border-[var(--line)] pt-4">
            <span className="mb-3 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">Sources · {data.sources.length}</span>
            <div className="space-y-1.5">
              {data.sources.map((source) => {
                const url = safeExternalUrl(source.url);
                const content = <><div className="flex items-baseline justify-between gap-3"><span className="text-[11.5px] leading-snug text-foreground">{readableText(source.headline, 180)}</span><span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--brass)]">{sourceKind(source.kind)}{url ? ' ↗' : ''}</span></div><span className="mt-1 block font-mono text-[10px] text-muted-foreground">{readableText(source.outlet, 100)} · {formatDate(source.when)}</span></>;
                const className = "block rounded-[5px] border border-[var(--line)] px-3 py-2.5 transition-colors hover:border-[var(--brass)] hover:bg-surface-800/60";
                return url ? <a data-testid="timeline-dossier-source" className={className} key={source.source_id} href={url} target="_blank" rel="noreferrer noopener">{content}</a> : <div data-testid="timeline-dossier-source" className={className} key={source.source_id}>{content}</div>;
              })}
            </div>
          </div>

          <div data-testid="timeline-dossier-watch" className="mt-6 border-t-2 border-[var(--line)] pt-4">
            <span className="mb-2 block font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim">What to watch</span>
            {data.watch.length ? <ul className="space-y-1">{data.watch.map((item) => <li key={item} className="text-[12.5px] leading-snug text-foreground">— {readableText(item, 420)}</li>)}</ul> : <p className="font-serif text-[13.5px] leading-relaxed text-muted-foreground">No forward-looking claim is stored for this event.</p>}
          </div>

          <div data-testid="timeline-dossier-footer" className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" onClick={nextSignal} className="flex items-center gap-2 rounded-md bg-surface-800 py-2 pr-3 pl-2 text-xs font-medium text-foreground ring-1 ring-border transition-all hover:ring-line-strong active:scale-[0.98]"><span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${categoryColor(pin.primary_category)} 16%, transparent)` }}><span className="size-1.5 rounded-full" style={{ background: categoryColor(pin.primary_category) }} /></span>Next {titleCase(pin.primary_category)} Signal</button>
            <span className="font-mono text-[10px] text-dim italic">Verified {formatDate(data.verified_at || pin.sort_key)}</span>
          </div>
        </> : null}
      </div>
    </ExactDialog>
  );
}
