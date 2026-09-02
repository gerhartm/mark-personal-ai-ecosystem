import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, EmptyState, ErrorState, LoadingRows, ViewHead } from '../components/Desk';
import { useQuery } from '../lib/api';
import { categoryColor, compact, formatDate, titleCase } from '../lib/desk';
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
  business_signal?: string;
  detailed_content?: string;
  source_id: string;
  source_title?: string;
  source_label?: string;
  source_url?: string;
  reference_count: number;
};

const monthName = (month: number) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month - 1, 1)));

export function Timeline() {
  const result = useQuery<{ pins: Pin[]; bounds: { min: string; max: string } }>('/timeline');
  const pins = result.data?.pins ?? [];
  const years = useMemo(() => [...new Set(pins.map((pin) => Number(pin.sort_key.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a), [pins]);
  const defaultYear = years.includes(new Date().getUTCFullYear()) ? new Date().getUTCFullYear() : (years[0] ?? new Date().getUTCFullYear());
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Pin | null>(null);
  const activeYear = chosenYear && years.includes(chosenYear) ? chosenYear : defaultYear;

  const yearPins = pins.filter((pin) => Number(pin.sort_key.slice(0, 4)) === activeYear);
  const categories = useMemo(() => ['All', ...new Set(yearPins.map((pin) => pin.primary_category))], [yearPins]);
  const visible = yearPins.filter((pin) => category === 'All' || pin.primary_category === category);
  const uniqueEventCount = new Set(visible.map((pin) => pin.event_id)).size;
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = visible.filter((pin) => Number(pin.sort_key.slice(5, 7)) === month).sort((a, b) => Number(b.reference_count) - Number(a.reference_count) || b.significance - a.significance);
    return { month, rows };
  }).filter((group) => group.rows.length);
  const totalReferences = visible.reduce((sum, pin) => sum + Number(pin.reference_count || 1), 0);

  if (result.loading && !result.data) return <LoadingRows rows={8} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;

  return (
    <section>
      <ViewHead title="Timeline" actions={<div className="timeline-totals"><strong>{uniqueEventCount}</strong><span>events</span><strong>{totalReferences}</strong><span>references</span></div>}>
        Historical moments mentioned across Mark's sources. Rows remain readable even when a month contains many events.
      </ViewHead>

      <div className="timeline-year-row" aria-label="Choose year">
        {years.map((year) => <Chip key={year} active={year === activeYear} onClick={() => { setChosenYear(year); setCategory('All'); }}>{year}</Chip>)}
      </div>

      <DensityStrip pins={yearPins} categories={categories.filter((item) => item !== 'All')} />

      <div className="desk-chip-row timeline-category-row" aria-label="Filter event category">
        {categories.map((item) => <Chip key={item} active={category === item} onClick={() => setCategory(item)}>{titleCase(item)}</Chip>)}
      </div>

      {visible.length === 0 ? <EmptyState title="No dated events in this view">Choose another year or category.</EmptyState> : null}

      <div className="timeline-ledger">
        {months.map((group) => (
          <section className="timeline-month" key={group.month}>
            <header>
              <h2>{monthName(group.month)}</h2>
              <span />
              <small>{new Set(group.rows.map((pin) => pin.event_id)).size} events · {group.rows.length} dated references</small>
            </header>
            <div>
              {group.rows.map((pin) => {
                const references = Math.max(1, Number(pin.reference_count || 1));
                const size = Math.min(28, 8 + Math.sqrt(references) * 4);
                return (
                  <button className="timeline-event-row" type="button" key={`${pin.event_id}-${pin.position}`} onClick={() => setSelected(pin)}>
                    <time>{pin.sort_key.slice(8, 10)}</time>
                    <span className="timeline-dot" style={{ width: size, height: size, background: categoryColor(pin.primary_category) }} aria-hidden="true" />
                    <span className="timeline-event-copy">
                      <strong>{pin.label || compact(pin.summary, 100)}</strong>
                      <small>{titleCase(pin.primary_category)} · {pin.precision} precision</small>
                    </span>
                    <span className="timeline-reference-count">{references} ref.</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected ? <TimelineDialog pin={selected} close={() => setSelected(null)} /> : null}
    </section>
  );
}

function DensityStrip({ pins, categories }: { pins: Pin[]; categories: string[] }) {
  const countEvents = (rows: Pin[]) => new Set(rows.map((pin) => pin.event_id)).size;
  const peak = Math.max(1, ...Array.from({ length: 12 }, (_, index) => countEvents(pins.filter((pin) => Number(pin.sort_key.slice(5, 7)) === index + 1))));
  return (
    <div className="timeline-density" aria-label="Event density by month">
      {Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const rows = pins.filter((pin) => Number(pin.sort_key.slice(5, 7)) === month);
        return (
          <div className="timeline-density-month" key={month} title={`${monthName(month)}: ${countEvents(rows)} events`}>
            <div className="timeline-density-stack" style={{ height: `${Math.max(4, countEvents(rows) / peak * 52)}px` }}>
              {categories.map((category) => {
                const count = rows.filter((row) => row.primary_category === category).length;
                return count ? <span key={category} style={{ flex: count, background: categoryColor(category) }} /> : null;
              })}
            </div>
            <small>{monthName(month).slice(0, 1)}</small>
          </div>
        );
      })}
    </div>
  );
}

function TimelineDialog({ pin, close }: { pin: Pin; close: () => void }) {
  return (
    <div className="desk-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="desk-modal" role="dialog" aria-modal="true" aria-labelledby="timeline-dialog-title">
        <header className="desk-modal-head">
          <div>
            <p className="desk-eyebrow">{titleCase(pin.primary_category)} · {formatDate(pin.sort_key)}</p>
            <h2 id="timeline-dialog-title">{pin.label || compact(pin.summary, 140)}</h2>
          </div>
          <button className="desk-modal-close" type="button" onClick={close}>Close</button>
        </header>
        <div className="desk-modal-body timeline-dialog-body">
          <section>
            <p className="desk-eyebrow">What happened</p>
            <p className="timeline-dialog-prose">{pin.summary}</p>
          </section>
          {pin.business_signal ? <section><p className="desk-eyebrow">Why it matters</p><p className="timeline-dialog-prose">{pin.business_signal}</p></section> : null}
          <section>
            <p className="desk-eyebrow">Source context</p>
            <p className="timeline-dialog-prose">{pin.detailed_content || pin.source_title || pin.source_label || 'Stored source'}</p>
            {pin.detailed_content ? <p className="timeline-dialog-source">From {pin.source_title || pin.source_label || 'the stored source'}</p> : null}
            <div className="timeline-dialog-links">
              <Link to={`/event/${pin.event_id}`}>Open full event</Link>
              <Link to={`/source/${encodeURIComponent(pin.source_id)}`}>Open supporting source</Link>
              {pin.source_url ? <a href={pin.source_url} target="_blank" rel="noreferrer">Open original</a> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
