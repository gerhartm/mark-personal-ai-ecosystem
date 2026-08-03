import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, qs } from '../lib/api';
import { formatBytes, formatDate, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  Panel,
  Segmented,
  SignificanceMeter,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import { FilterBar } from '../components/FilterBar';
import { FAMILIES, SOURCE_TYPE_LABEL } from '../lib/taxonomy';
import { IconNote } from '../components/icons';
import './library.css';

type Scope = 'events' | 'sources' | 'media';

export function Library() {
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as Scope) ?? 'events';

  const families = params.get('family')?.split(',').filter(Boolean) ?? [];
  const familyCategories = useMemo(
    () => FAMILIES.filter((f) => families.includes(f.key)).flatMap((f) => f.categories),
    [families.join(',')],
  );
  const categories = [
    ...new Set([...(params.get('category')?.split(',').filter(Boolean) ?? []), ...familyCategories]),
  ];

  const query = qs({
    q: params.get('q'),
    category: categories,
    sourceType: params.get('sourceType'),
    significanceMin: params.get('significanceMin'),
    hasNotes: params.get('hasNotes'),
    sort: params.get('sort') ?? 'subject',
    limit: 300,
  });

  const events = useQuery(scope === 'events' ? `/events${query}` : null, [query]);
  const sources = useQuery(scope === 'sources' ? '/sources' : null);
  const media = useQuery(scope === 'media' ? '/media' : null);

  const setScope = (s: Scope) => {
    const next = new URLSearchParams(params);
    if (s === 'events') next.delete('scope');
    else next.set('scope', s);
    setParams(next);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Library</h1>
          <p className="page-sub">
            Every object in the workspace, filterable by any attribute. Migrated records and anything captured after
            migration sit in the same tables and answer the same queries.
          </p>
        </div>
        <Segmented<Scope>
          label="Collection"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'events', label: 'Events', count: events.data?.total },
            { value: 'sources', label: 'Sources', count: sources.data?.sources?.length },
            { value: 'media', label: 'Media', count: media.data?.assets?.length },
          ]}
        />
      </header>

      {scope === 'events' && (
        <>
          <FilterBar
            value={params}
            onChange={setParams}
            show={['q', 'family', 'category', 'significance', 'sourceType', 'notes', 'sort']}
          />
          <EventsTable state={events} onClear={() => setParams(new URLSearchParams())} />
        </>
      )}
      {scope === 'sources' && <SourcesTable state={sources} />}
      {scope === 'media' && <MediaTable state={media} />}
    </div>
  );
}

function EventsTable({ state, onClear }: { state: any; onClear: () => void }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.refetch} />;
  if (!state.data) return <Skeleton rows={8} height={52} />;
  const { events, total } = state.data;

  if (!events.length) {
    return (
      <EmptyState
        title="No events match these filters"
        action={
          <button type="button" className="btn" onClick={onClear}>
            Clear all filters
          </button>
        }
      >
        The filter row above is scoping this list. Widen the significance floor or drop a family to see events again.
      </EmptyState>
    );
  }

  return (
    <Panel title={`${plural(total, 'event')}`}>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="col-sig">Signif.</th>
              <th scope="col" className="col-date">Subject</th>
              <th scope="col">Summary</th>
              <th scope="col" className="col-cat">Category</th>
              <th scope="col" className="col-source">Source</th>
              <th scope="col" className="col-num">Insights</th>
              <th scope="col" className="col-flags">Notes</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e: any) => (
              <tr key={e.id}>
                <td>
                  <SignificanceMeter value={e.significance} />
                </td>
                <td className="mono col-date">{e.subject_date?.slice(0, 10) ?? 'no date'}</td>
                <td>
                  <Link to={`/event/${e.id}`} className="table-link">
                    {truncate(e.summary ?? '', 150)}
                  </Link>
                  {e.tags?.length > 0 && (
                    <span className="table-tags">
                      {e.tags.slice(0, 4).map((t: string) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </span>
                  )}
                </td>
                <td>
                  <CategoryChip category={e.primary_category} size="sm" />
                </td>
                <td className="col-source">
                  <Link to={`/source/${e.source_id}`} className="table-link faint-link">
                    {truncate(e.source_title ?? e.source_label ?? '', 42)}
                  </Link>
                </td>
                <td className="mono col-num">{e.insight_count}</td>
                <td className="col-flags">
                  {e.note ? (
                    <span className="note-flag" title="You have written a note on this event">
                      <IconNote />
                    </span>
                  ) : (
                    <span className="faint">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SourcesTable({ state }: { state: any }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.refetch} />;
  if (!state.data) return <Skeleton rows={8} height={52} />;
  const { sources } = state.data;

  return (
    <Panel title={`${plural(sources.length, 'source')}`}>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="col-type">Type</th>
              <th scope="col">Title</th>
              <th scope="col" className="col-channel">Channel</th>
              <th scope="col" className="col-date">Captured</th>
              <th scope="col" className="col-num">Events</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s: any) => (
              <tr key={s.source_id}>
                <td>
                  <span className="chip chip-sm">{SOURCE_TYPE_LABEL[s.source_type] ?? s.source_type}</span>
                </td>
                <td>
                  <Link to={`/source/${s.source_id}`} className="table-link">
                    {truncate(s.title, 110)}
                  </Link>
                </td>
                <td className="faint col-channel">{truncate(s.source_channel ?? '', 46)}</td>
                <td className="mono col-date">{formatDate(s.captured_at)}</td>
                <td className="mono col-num">{s.event_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MediaTable({ state }: { state: any }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.refetch} />;
  if (!state.data) return <Skeleton rows={8} height={52} />;
  const { assets, available } = state.data;

  return (
    <>
      {!available && (
        <div className="notice">
          <StatusChip tone="warning">Archive not mounted</StatusChip>
          <p>
            The private media archive is not attached in this environment, so files cannot be streamed. Every record
            below is still reconciled: the checksum and byte count come from the verified manifest, which is what an
            explicitly documented unavailable state looks like.
          </p>
        </div>
      )}
      <Panel title={`${plural(assets.length, 'asset')}`}>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="col-type">Kind</th>
                <th scope="col">Path</th>
                <th scope="col" className="col-num">Size</th>
                <th scope="col" className="col-flags">In memory</th>
                <th scope="col" className="col-source">Event</th>
                <th scope="col" className="col-sha">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((m: any) => (
                <tr key={m.archive_ref}>
                  <td>
                    <span className="chip chip-sm">{m.kind}</span>
                  </td>
                  <td className="mono table-path">{m.relative_path}</td>
                  <td className="mono col-num">{formatBytes(m.bytes)}</td>
                  <td className="col-flags">
                    {m.semantic_memory ? <StatusChip tone="good">yes</StatusChip> : <span className="faint">no</span>}
                  </td>
                  <td className="col-source">
                    {m.event_id ? (
                      <Link to={`/event/${m.event_id}`} className="table-link faint-link mono">
                        {m.event_id}
                      </Link>
                    ) : (
                      <span className="faint">unlinked</span>
                    )}
                  </td>
                  <td className="mono col-sha faint">{m.sha256.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
