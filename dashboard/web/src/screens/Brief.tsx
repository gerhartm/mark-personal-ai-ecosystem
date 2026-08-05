import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDateTime, plural, relativeTime, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  Panel,
  SignificanceMeter,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import {
  IconAlert,
  IconArrow,
  IconPulse,
  IconRecall,
  IconRefresh,
  IconSearch,
  IconStudio,
} from '../components/icons';
import { prefersReducedMotion, probeWebGL } from '../three/capability';
import './brief.css';

const AmbientField = lazy(() => import('../three/AmbientField'));

type IntelligenceAction = {
  title: string;
  reason: string;
  target: 'ask' | 'quiz' | 'studio' | 'speaking' | 'library';
  query: string;
};

function actionRoute(action: IntelligenceAction) {
  const query = encodeURIComponent(action.query || action.title);
  if (action.target === 'quiz') return `/quiz?focus=${query}`;
  if (action.target === 'studio') return `/studio?new=twitter_thread&focus=${query}`;
  if (action.target === 'speaking') return `/studio?new=speaking_prep&focus=${query}`;
  if (action.target === 'library') return `/library?q=${query}`;
  return `/ask?q=${query}`;
}

export function Brief() {
  const corpus = useQuery('/brief');
  const intelligence = useQuery('/intelligence');
  const [depth, setDepth] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

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

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      await api('/intelligence/refresh', { method: 'POST', body: '{}' });
      invalidate('/intelligence');
      intelligence.refetch();
    } catch (error) {
      setRefreshError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  if (corpus.error) return <ErrorState error={corpus.error} onRetry={corpus.refetch} />;
  if (!corpus.data) return <Skeleton rows={5} height={90} />;

  const { counts, theme, gaps, highSignal, range, recentDrafts, lastRead } = corpus.data;
  const intelligenceState = intelligence.data;
  const current = intelligenceState?.brief;
  const updated = current?.generated_at ? relativeTime(current.generated_at) : null;
  const sourceCount = current?.sources_reviewed ?? 0;

  return (
    <div className="page command-center">
      <header className="hero command-hero">
        <div className="hero-field" aria-hidden="true">
          <StaticField />
          {depth && (
            <Suspense fallback={null}>
              <AmbientField density={counts.events} intensity={gaps.withoutNotes / Math.max(counts.events, 1)} />
            </Suspense>
          )}
        </div>

        <div className="hero-body command-hero-body">
          <div className="command-kicker">
            <p className="label hero-eyebrow">Today</p>
            <span className={`command-live-dot ${current && !intelligenceState?.stale ? 'is-current' : ''}`} aria-hidden="true" />
            <span className="faint">
              {current ? `Refreshed ${updated}` : 'Awaiting first live briefing'}
            </span>
          </div>
          <h1 className="hero-title command-headline">
            {current?.headline ?? theme?.title ?? 'Your intelligence desk is ready'}
          </h1>
          <p className="hero-line read">
            {current?.summary
              ?? theme?.through_line
              ?? 'Run a bounded Hermes briefing to compare live developments with the private research corpus.'}
          </p>
          <div className="command-hero-footer">
            <button
              type="button"
              className={`btn btn-primary command-refresh ${refreshing ? 'is-refreshing' : ''}`}
              onClick={refresh}
              disabled={refreshing || !intelligenceState?.connected}
              aria-busy={refreshing}
            >
              <IconRefresh />
              {refreshing ? 'Hermes is reviewing the market' : current ? 'Refresh intelligence' : 'Run first briefing'}
            </button>
            <p className="hero-scale muted">
              {plural(counts.events, 'stored event')} from {plural(counts.sources, 'source')}
              {current ? `, ${plural(sourceCount, 'live source')} reviewed` : ''}
            </p>
          </div>
          {refreshError && <p className="command-inline-error" role="alert">{refreshError}</p>}
          {intelligence.error && !current && (
            <p className="command-inline-error" role="alert">{intelligence.error.message}</p>
          )}
        </div>
      </header>

      <QuickActions />

      <section className="command-grid">
        <div className="command-main">
          <Panel
            className="attention-panel"
            title={
              <span className="panel-title-with-icon"><IconAlert /> Needs attention</span>
            }
            action={current && <span className="panel-meta mono">{current.needs_attention.length} items</span>}
          >
            {!current ? (
              <EmptyState
                title="No live briefing yet"
                action={
                  <button className="btn btn-primary" type="button" onClick={refresh} disabled={refreshing || !intelligenceState?.connected}>
                    Run briefing
                  </button>
                }
              >
                Hermes will compare current developments with the strongest signals already in the private corpus.
              </EmptyState>
            ) : current.needs_attention.length === 0 ? (
              <EmptyState title="Nothing urgent found">
                The latest review found no time-sensitive item that cleared the evidence threshold.
              </EmptyState>
            ) : (
              <ol className="attention-list">
                {current.needs_attention.map((item: any, index: number) => (
                  <li key={`${item.title}-${index}`} className="attention-item">
                    <span className={`urgency urgency-${item.urgency}`}>{item.urgency}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.why}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title={<span className="panel-title-with-icon"><IconPulse /> What changed</span>}
            action={current && <span className="panel-meta">Verified external sources</span>}
          >
            {!current ? (
              <EmptyState title="Live changes appear after the first briefing">
                Stored research stays available across Ask, Library, Timeline, and Connections in the meantime.
              </EmptyState>
            ) : (
              <ol className="change-list">
                {current.changes.map((change: any, index: number) => (
                  <li key={`${change.source_url}-${index}`} className="change-item">
                    <span className="change-index mono">{String(index + 1).padStart(2, '0')}</span>
                    <div className="change-body">
                      <h3>{change.title}</h3>
                      <p>{change.detail}</p>
                      <a href={change.source_url} target="_blank" rel="noreferrer" className="change-source">
                        <span>{change.source_label}</span>
                        {change.published_at && <span className="mono">{change.published_at.slice(0, 10)}</span>}
                        <IconArrow />
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title="Strongest stored signals"
            action={
              <Link className="panel-action" to="/library?significanceMin=4">
                Review all <IconArrow />
              </Link>
            }
          >
            <ul className="signal-list compact-signals">
              {highSignal.slice(0, 5).map((event: any) => (
                <li key={event.id}>
                  <Link to={`/event/${event.id}`} className="signal-row">
                    <span className="signal-meta">
                      <SignificanceMeter value={event.significance} />
                      <span className="mono signal-date">{event.subject_date?.slice(0, 10)}</span>
                    </span>
                    <span className="signal-body">
                      <span className="signal-summary">{truncate(event.summary ?? '', 180)}</span>
                      <span className="signal-tail">
                        <CategoryChip category={event.primary_category} size="sm" />
                        <span className="faint">{truncate(event.source_title ?? '', 54)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="command-side">
          <Panel title="Suggested actions">
            {!current || current.suggested_actions.length === 0 ? (
              <EmptyState title="No suggestions yet">
                The next briefing will turn live signals into useful work inside the dashboard.
              </EmptyState>
            ) : (
              <ul className="suggestion-list">
                {current.suggested_actions.map((action: IntelligenceAction, index: number) => (
                  <li key={`${action.title}-${index}`}>
                    <Link className="suggestion-row" to={actionRoute(action)}>
                      <span>
                        <strong>{action.title}</strong>
                        <small>{action.reason}</small>
                      </span>
                      <IconArrow />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Watchlists">
            {!current || current.watchlists.length === 0 ? (
              <EmptyState title="Watchlists are being established">
                Hermes derives them from recurring entities and high-signal research.
              </EmptyState>
            ) : (
              <ul className="watch-list">
                {current.watchlists.map((item: any, index: number) => (
                  <li key={`${item.label}-${index}`} className="watch-row">
                    <span className={`watch-state watch-${item.status.toLowerCase()}`} aria-hidden="true" />
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <span className="mono watch-label">{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Continue working">
            {lastRead.length === 0 && recentDrafts.length === 0 ? (
              <EmptyState title="Nothing opened yet">
                Events and drafts you open will stay within reach here.
              </EmptyState>
            ) : (
              <ul className="continue">
                {lastRead.map((item: any) => (
                  <li key={item.canonical_id}>
                    <Link to={`/event/${item.canonical_id}`} className="continue-row">
                      <span className="label">Event</span>
                      <span className="continue-title">{truncate(item.summary ?? '', 90)}</span>
                      <span className="faint">{relativeTime(item.last_read_at)}</span>
                    </Link>
                  </li>
                ))}
                {recentDrafts.slice(0, 2).map((draft: any) => (
                  <li key={draft.id}>
                    <Link to={`/studio/${draft.id}`} className="continue-row">
                      <span className="label">Draft</span>
                      <span className="continue-title">{draft.focus ? truncate(draft.focus, 90) : draft.template_type}</span>
                      <span className="faint">{formatDateTime(draft.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="System activity">
            <dl className="activity-list">
              <Activity label="Hermes" value={intelligenceState?.connected ? 'Connected' : 'Unavailable'} tone={intelligenceState?.connected ? 'good' : 'warning'} />
              <Activity label="Live briefing" value={current ? (intelligenceState?.stale ? 'Ready to refresh' : 'Current') : 'Not generated'} tone={current && !intelligenceState?.stale ? 'good' : 'warning'} />
              <Activity label="Private corpus" value={`${counts.events} events`} />
              <Activity label="Subject range" value={`${range.min?.slice(0, 4)} to ${range.max?.slice(0, 7)}`} />
              <Activity label="Next review" value={intelligenceState?.next_refresh_at ? formatDateTime(intelligenceState.next_refresh_at) : 'After first briefing'} />
            </dl>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function QuickActions() {
  const actions = useMemo(() => [
    { to: '/ask', icon: <IconSearch />, title: 'Ask', copy: 'Grounded answers from private intelligence.' },
    { to: '/quiz', icon: <IconRecall />, title: 'Quiz', copy: 'Test recall and strengthen weak areas.' },
    { to: '/studio?new=twitter_thread', icon: <IconStudio />, title: 'Create', copy: 'Draft for X or LinkedIn with evidence.' },
    { to: '/studio?new=speaking_prep', icon: <IconStudio />, title: 'Speaking prep', copy: 'Prepare a thesis, questions, and counters.' },
  ], []);
  return (
    <section className="intelligence-desk" aria-labelledby="intelligence-desk-title">
      <div className="desk-heading">
        <div>
          <p className="label" id="intelligence-desk-title">Quick actions</p>
          <p className="muted">Every workflow uses the same Hermes brain and private memory.</p>
        </div>
      </div>
      <div className="desk-actions">
        {actions.map((action, index) => (
          <Link key={action.title} to={action.to} className={`desk-action ${index === 0 ? 'desk-action-primary' : ''}`}>
            <span className="desk-action-icon">{action.icon}</span>
            <span className="desk-action-body">
              <strong>{action.title}</strong>
              <span>{action.copy}</span>
            </span>
            <IconArrow />
          </Link>
        ))}
      </div>
    </section>
  );
}

function Activity({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warning' }) {
  return (
    <div className="activity-row">
      <dt>{label}</dt>
      <dd>{tone ? <StatusChip tone={tone}>{value}</StatusChip> : <span>{value}</span>}</dd>
    </div>
  );
}

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
      {Array.from({ length: 54 }, (_, index) => {
        const x = (index * 137.7) % 800;
        const y = (index * 61.3) % 260;
        const radius = 0.7 + ((index * 7) % 5) * 0.32;
        return <circle key={index} cx={x} cy={y} r={radius} fill="var(--accent-strong)" opacity={0.15 + ((index % 7) / 7) * 0.3} />;
      })}
    </svg>
  );
}
