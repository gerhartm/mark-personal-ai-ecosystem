import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatPin, plural, precisionNote, truncate } from '../lib/format';
import { CategoryChip, EmptyState, ErrorState, Panel, SignificanceMeter, Skeleton } from '../components/primitives';
import { FAMILIES, familyOf, hueOf } from '../lib/taxonomy';
import { FilterBar } from '../components/FilterBar';
import './timeline.css';

const CONTEXT_START = 2000;
const FOCUS_START = 2026;

interface Pin {
  event_id: string;
  position: number;
  date: string;
  precision: string;
  label: string | null;
  category: string | null;
  sort_key: string;
  span_end: string;
  primary_category: string;
  significance: number;
  summary: string;
}

export function Timeline() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, refetch } = useQuery('/timeline');
  const [focusFrom, setFocusFrom] = useState('2026-01-01');
  const [focusTo, setFocusTo] = useState('2026-12-31');
  const [hovered, setHovered] = useState<Pin | null>(null);

  const activeFamilies = params.get('family')?.split(',').filter(Boolean) ?? [];
  const categories = useMemo(() => {
    if (!activeFamilies.length) return null;
    return new Set(FAMILIES.filter((f) => activeFamilies.includes(f.key)).flatMap((f) => f.categories));
  }, [activeFamilies.join(',')]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} height={120} />;

  const pins: Pin[] = data.pins.filter((p: Pin) => !categories || categories.has(p.primary_category));
  const captures = data.captures;

  const focusPins = pins.filter((p) => p.span_end >= focusFrom && p.sort_key <= focusTo);
  const contextPins = pins;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Timeline</h1>
          <p className="page-sub">
            Subject time is the primary axis: {plural(pins.length, 'dated reference')} across{' '}
            {data.bounds.min?.slice(0, 4)} to {data.bounds.max?.slice(0, 7)}. Capture time sits below it because 59 of
            66 events were ingested in a single month, which would otherwise read as a spike rather than a history.
          </p>
        </div>
      </header>

      <FilterBar
        value={params}
        onChange={setParams}
        show={['family', 'significance', 'q']}
      />

      <Panel
        title="Subject time"
        action={
          <span className="timeline-legend">
            {(['day', 'month', 'quarter', 'year'] as const).map((p) => (
              <span key={p} className="legend-item">
                <span className={`legend-mark legend-${p}`} aria-hidden="true" />
                <span className="label">{p}</span>
              </span>
            ))}
          </span>
        }
      >
        <div className="timeline-body">
          <ContextBand
            pins={contextPins}
            from={focusFrom}
            to={focusTo}
            onBrush={(f, t) => {
              setFocusFrom(f);
              setFocusTo(t);
            }}
          />

          <div className="focus-band">
            <p className="label focus-label">
              Focus window: {focusFrom.slice(0, 7)} to {focusTo.slice(0, 7)}, {plural(focusPins.length, 'reference')}
            </p>
            <FocusLanes pins={focusPins} from={focusFrom} to={focusTo} onHover={setHovered} />
          </div>

          <CaptureRail captures={captures} />

          {hovered && (
            <div className="timeline-readout" role="status">
              <span className="mono">{formatPin(hovered.date, hovered.precision)}</span>
              <span className="faint">{precisionNote[hovered.precision]}</span>
              <span className="timeline-readout-label">{hovered.label ?? hovered.summary?.slice(0, 90)}</span>
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`References in window (${focusPins.length})`}>
        {focusPins.length === 0 ? (
          <EmptyState title="No references in this window">
            The brush above selects {focusFrom.slice(0, 7)} to {focusTo.slice(0, 7)}. Widen it, or clear the family
            filter, to see references again.
          </EmptyState>
        ) : (
          <ul className="pin-list">
            {focusPins.slice(0, 120).map((p) => (
              <li key={`${p.event_id}-${p.position}`}>
                <Link to={`/event/${p.event_id}`} className="pin-row">
                  <span className="pin-row-date">
                    <span className="mono">{formatPin(p.date, p.precision)}</span>
                    {p.precision !== 'day' && <span className="label pin-row-precision">{p.precision}</span>}
                  </span>
                  <span className="pin-row-body">
                    <span className="pin-row-label">{p.label ?? truncate(p.summary ?? '', 120)}</span>
                    <span className="pin-row-meta">
                      <CategoryChip category={p.primary_category} size="sm" />
                      <SignificanceMeter value={p.significance} showValue={false} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Compressed 2000 to 2025, so the long tail is visible without dominating. */
function ContextBand({
  pins,
  from,
  to,
  onBrush,
}: {
  pins: Pin[];
  from: string;
  to: string;
  onBrush: (from: string, to: string) => void;
}) {
  const thisYear = 2026;
  const years = Array.from({ length: thisYear - CONTEXT_START + 1 }, (_, i) => CONTEXT_START + i);
  const counts = new Map<number, number>();
  for (const p of pins) {
    const y = Number(p.sort_key.slice(0, 4));
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  const focusYear = Number(from.slice(0, 4));

  return (
    <div className="context-band">
      <p className="label context-label">Full span, compressed</p>
      <div className="context-years" role="group" aria-label="Select a year to focus">
        {years.map((y) => {
          const c = counts.get(y) ?? 0;
          const active = y === focusYear;
          return (
            <button
              key={y}
              type="button"
              className={`context-year ${active ? 'is-active' : ''}`}
              onClick={() => onBrush(`${y}-01-01`, `${y}-12-31`)}
              title={`${y}: ${plural(c, 'reference')}`}
            >
              <span className="context-bar" style={{ height: `${Math.max(3, (c / max) * 100)}%` }} />
              {(y === thisYear || (y % 5 === 0 && thisYear - y > 2)) && (
                <span className="context-tick mono">{`'${String(y).slice(2)}`}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Precision is encoded in geometry: a day is a point, a month, quarter, or
 * year is a band of its real width. Precision is also stated in text.
 */
function FocusLanes({
  pins,
  from,
  to,
  onHover,
}: {
  pins: Pin[];
  from: string;
  to: string;
  onHover: (p: Pin | null) => void;
}) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const range = Math.max(1, end - start);
  const pct = (iso: string) => ((Date.parse(iso) - start) / range) * 100;

  return (
    <div className="lanes">
      {FAMILIES.map((family) => {
        const lanePins = pins.filter((p) => family.categories.includes(p.primary_category));
        return (
          <div className="lane" key={family.key}>
            <div className="lane-head">
              <span className="lane-dot" style={{ background: family.hue }} aria-hidden="true" />
              <span className="lane-name">{family.label}</span>
              <span className="mono lane-count">{lanePins.length}</span>
            </div>
            <div className="lane-track">
              {lanePins.map((p) => {
                const left = Math.max(0, Math.min(100, pct(p.sort_key)));
                const right = Math.max(0, Math.min(100, pct(p.span_end)));
                const width = Math.max(p.precision === 'day' ? 0 : 0.6, right - left);
                return (
                  <Link
                    key={`${p.event_id}-${p.position}`}
                    to={`/event/${p.event_id}`}
                    className={`mark mark-${p.precision}`}
                    style={{
                      left: `${left}%`,
                      width: p.precision === 'day' ? undefined : `${width}%`,
                      background: hueOf(p.primary_category),
                    }}
                    onMouseEnter={() => onHover(p)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(p)}
                    onBlur={() => onHover(null)}
                    title={`${formatPin(p.date, p.precision)} (${precisionNote[p.precision]}): ${p.label ?? ''}`}
                  >
                    <span className="sr-only">
                      {formatPin(p.date, p.precision)}, {precisionNote[p.precision]}, {p.label ?? p.summary}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="lane-axis">
        <span className="mono">{from.slice(0, 7)}</span>
        <span className="mono">{to.slice(0, 7)}</span>
      </div>
    </div>
  );
}

/** The capture axis is shown, not hidden: the May cluster is a fact about the migration. */
function CaptureRail({ captures }: { captures: { id: string; date: string; primary_category: string }[] }) {
  const byMonth = new Map<string, number>();
  for (const c of captures) {
    const m = c.date?.slice(0, 7);
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const months = [...byMonth.keys()].sort();
  const max = Math.max(1, ...byMonth.values());

  return (
    <div className="capture-rail">
      <p className="label capture-label">
        Capture time, when the corpus was ingested
      </p>
      <div className="capture-track">
        {months.map((m) => (
          <div key={m} className="capture-month" title={`${m}: ${plural(byMonth.get(m) ?? 0, 'event')} captured`}>
            <span className="capture-bar" style={{ height: `${(byMonth.get(m)! / max) * 100}%` }} />
            <span className="mono capture-tick">{m.slice(2)}</span>
            <span className="mono capture-value">{byMonth.get(m)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
