import { Link, useParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { paragraphs, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  ErrorState,
  Panel,
  SignificanceMeter,
  Skeleton,
} from '../components/primitives';

export function ThemeDetail() {
  const { id = '' } = useParams();
  const { data, error, refetch } = useQuery(`/themes/${id}`, [id]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={64} />;

  return (
    <div className="page detail">
      <header className="detail-head">
        <p className="label">Theme</p>
        <h1 className="detail-title">{data.title}</h1>
      </header>

      <Panel title="Through line">
        <div className="rail-block">
          <div className="read">
            {paragraphs(data.through_line).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={`Sequence (${data.events.length} events)`}>
        <ol className="theme-sequence">
          {data.events.map((e: any) => (
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
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title={`Outside the theme (${data.unplaced.length})`}>
        <p className="rail-block muted">
          {plural(data.unplaced.length, 'event')} were not placed in this synthesis. They are listed rather than hidden,
          because an unplaced event is usually the next thing worth reading.
        </p>
        <ul className="signal-list">
          {data.unplaced.map((e: any) => (
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
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
