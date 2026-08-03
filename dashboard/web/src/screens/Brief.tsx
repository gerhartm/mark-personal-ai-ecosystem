import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatDateTime, plural, relativeTime, truncate } from '../lib/format';
import { CategoryChip, EmptyState, ErrorState, Panel, SignificanceMeter, Skeleton, StatLine } from '../components/primitives';
import { IconArrow } from '../components/icons';
import { prefersReducedMotion, probeWebGL } from '../three/capability';
import './brief.css';

const AmbientField = lazy(() => import('../three/AmbientField'));

export function Brief() {
  const { data, error, loading, refetch } = useQuery('/brief');
  const [depth, setDepth] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (localStorage.getItem('depth') === 'off') return;
    if (!probeWebGL()) return;
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => setDepth(true), { timeout: 2500 })
      : window.setTimeout(() => setDepth(true), 900);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id as number);
      else clearTimeout(id as number);
    };
  }, []);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={90} />;

  const { counts, theme, gaps, highSignal, range, recentDrafts, lastRead, categories } = data;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-field" aria-hidden="true">
          {/* The static field is always the ground layer, so the header is
              never empty while depth is loading, paused, or unavailable.
              Depth adds to it rather than replacing it. */}
          <StaticField />
          {depth && (
            <Suspense fallback={null}>
              <AmbientField density={counts.events} intensity={gaps.withoutNotes / Math.max(counts.events, 1)} />
            </Suspense>
          )}
        </div>

        <div className="hero-body">
          <p className="label hero-eyebrow">Working theme</p>
          <h1 className="hero-title">{theme?.title ?? 'No theme synthesised'}</h1>
          {theme?.through_line && (
            <p className="hero-line read">{truncate(theme.through_line, 420)}</p>
          )}
          <p className="hero-scale muted">
            {plural(counts.events, 'event')} from {plural(counts.sources, 'source')}, subject range{' '}
            <span className="mono">{range.min?.slice(0, 4)}</span> to{' '}
            <span className="mono">{range.max?.slice(0, 7)}</span>
          </p>
          {theme && (
            <Link className="hero-link" to={`/theme/${theme.id}`}>
              Read the through line <IconArrow />
            </Link>
          )}
        </div>
      </header>

      <section className="brief-columns">
        <div className="brief-main">
          <Panel
            title="High signal"
            action={
              <Link className="panel-action" to="/library?significanceMin=4">
                All {counts.events} events <IconArrow />
              </Link>
            }
          >
            {highSignal.length === 0 ? (
              <EmptyState title="Nothing at significance 4 or above">
                Events rated 4 and 5 appear here once they exist in the corpus.
              </EmptyState>
            ) : (
              <ul className="signal-list">
                {highSignal.map((e: any) => (
                  <li key={e.id}>
                    <Link to={`/event/${e.id}`} className="signal-row">
                      <span className="signal-meta">
                        <SignificanceMeter value={e.significance} />
                        <span className="mono signal-date">{e.subject_date?.slice(0, 10)}</span>
                      </span>
                      <span className="signal-body">
                        <span className="signal-summary">{truncate(e.summary ?? '', 170)}</span>
                        <span className="signal-tail">
                          <CategoryChip category={e.primary_category} size="sm" />
                          <span className="faint">{truncate(e.source_title ?? '', 54)}</span>
                        </span>
                        {e.note && <span className="signal-note">{truncate(e.note, 150)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Corpus shape">
            <div className="shape">
              <div className="shape-block">
                <p className="label">Events by category</p>
                <ul className="bars">
                  {categories.map((c: any) => (
                    <li key={c.category} className="bar-row">
                      <Link to={`/library?category=${encodeURIComponent(c.category)}`} className="bar-label">
                        <CategoryChip category={c.category} size="sm" />
                      </Link>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{
                            width: `${(c.count / categories[0].count) * 100}%`,
                            background: `color-mix(in oklab, var(--accent) 55%, transparent)`,
                          }}
                        />
                      </span>
                      <span className="mono bar-value">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="brief-side">
          <Panel title="Gaps">
            <ul className="gaps">
              <GapRow
                label="Events with no notes from you"
                value={gaps.withoutNotes}
                to="/library?hasNotes=false"
              />
              <GapRow label="Events outside the theme" value={gaps.outsideTheme} to={theme ? `/theme/${theme.id}` : '/library'} />
              <GapRow label="Never quizzed" value={gaps.neverQuizzed} to="/recall" />
              <GapRow
                label="Unresolved connections"
                value={gaps.unresolvedConnections}
                to="/connections"
                tone={gaps.unresolvedConnections ? 'warn' : 'ok'}
              />
            </ul>
          </Panel>

          <Panel title="Continue">
            {lastRead.length === 0 && recentDrafts.length === 0 ? (
              <EmptyState title="Nothing opened yet">
                Events and drafts you open will show up here so you can pick the thread back up.
              </EmptyState>
            ) : (
              <ul className="continue">
                {lastRead.map((r: any) => (
                  <li key={r.canonical_id}>
                    <Link to={`/event/${r.canonical_id}`} className="continue-row">
                      <span className="label">Event</span>
                      <span className="continue-title">{truncate(r.summary ?? '', 90)}</span>
                      <span className="faint">{relativeTime(r.last_read_at)}</span>
                    </Link>
                  </li>
                ))}
                {recentDrafts.slice(0, 2).map((d: any) => (
                  <li key={d.id}>
                    <Link to={`/studio/${d.id}`} className="continue-row">
                      <span className="label">Draft</span>
                      <span className="continue-title">{d.focus ? truncate(d.focus, 90) : d.template_type}</span>
                      <span className="faint">{formatDateTime(d.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Preserved">
            <StatLine
              items={[
                { label: 'Drafts', value: counts.drafts, to: '/studio' },
                { label: 'Quiz sessions', value: counts.quiz_sessions, to: '/recall' },
                { label: 'Conversations', value: counts.conversations, to: '/archive' },
                { label: 'Media', value: counts.media, to: '/library?scope=media' },
              ]}
            />
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function GapRow({
  label,
  value,
  to,
  tone = 'ok',
}: {
  label: string;
  value: number;
  to: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <li>
      <Link to={to} className="gap-row">
        <span className={`gap-value mono ${tone === 'warn' && value > 0 ? 'is-warn' : ''}`}>{value}</span>
        <span className="gap-label">{label}</span>
        <IconArrow />
      </Link>
    </li>
  );
}

/** The non-3D default. Same composition, zero runtime cost. */
function StaticField() {
  return (
    <svg className="static-field" viewBox="0 0 800 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="f1" cx="30%" cy="30%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="f2" cx="70%" cy="60%">
          <stop offset="0%" stopColor="var(--family-narrative)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--family-narrative)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="260" fill="url(#f1)" />
      <rect width="800" height="260" fill="url(#f2)" />
      {Array.from({ length: 54 }, (_, i) => {
        const x = (i * 137.7) % 800;
        const y = (i * 61.3) % 260;
        const r = 0.7 + ((i * 7) % 5) * 0.32;
        return <circle key={i} cx={x} cy={y} r={r} fill="var(--accent-strong)" opacity={0.15 + ((i % 7) / 7) * 0.3} />;
      })}
    </svg>
  );
}
