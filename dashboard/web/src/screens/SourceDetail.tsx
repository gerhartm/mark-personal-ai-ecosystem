import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatDate, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  ErrorState,
  Panel,
  SignificanceMeter,
  Skeleton,
} from '../components/primitives';
import { SOURCE_TYPE_LABEL } from '../lib/taxonomy';
import { IconBack } from '../components/icons';

export function SourceDetail() {
  const { id = '' } = useParams();
  const { data, error, refetch } = useQuery(`/sources/${id}`, [id]);
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={64} />;

  return (
    <div className="page detail">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          <IconBack /> Back
        </button>
        <Link to="/library?scope=sources">Sources</Link>
        <span className="faint">/</span>
        <span className="mono faint">{truncate(data.source_id, 28)}</span>
      </nav>

      <header className="detail-head">
        <div className="detail-head-marks">
          <span className="chip chip-sm">{SOURCE_TYPE_LABEL[data.source_type] ?? data.source_type}</span>
          <span className="faint">{plural(data.events.length, 'derived event')}</span>
        </div>
        <h1 className="detail-title">{data.title}</h1>
        <p className="detail-dates">
          <span>
            <span className="label">Captured</span> <span className="mono">{formatDate(data.captured_at)}</span>
          </span>
          <span>
            <span className="label">Channel</span> {data.source_channel ?? 'none recorded'}
          </span>
        </p>
        {data.source_url && (
          <a className="external" href={data.source_url} target="_blank" rel="noreferrer noopener">
            Open the original, leaves this workspace
          </a>
        )}
      </header>

      <Panel title={`Events from this source (${data.events.length})`}>
        <ul className="signal-list">
          {data.events.map((e: any) => (
            <li key={e.id}>
              <Link to={`/event/${e.id}`} className="signal-row">
                <span className="signal-meta">
                  <SignificanceMeter value={e.significance} />
                  <span className="mono signal-date">{e.subject_date?.slice(0, 10)}</span>
                </span>
                <span className="signal-body">
                  <span className="signal-summary">{truncate(e.summary ?? '', 180)}</span>
                  <span className="signal-tail">
                    <CategoryChip category={e.primary_category} size="sm" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Provenance">
        <dl className="kv rail-block">
          <dt>Source ID</dt>
          <dd className="mono">{data.source_id}</dd>
          <dt>Identity basis</dt>
          <dd className="mono">{data.identity_basis}</dd>
          <dt>Origin</dt>
          <dd>{data.origin}</dd>
          <dt>Label</dt>
          <dd>{data.source_label ?? 'none'}</dd>
        </dl>
      </Panel>
    </div>
  );
}
