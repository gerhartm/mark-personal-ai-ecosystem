import { Link, useParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatBytes, formatDateTime, plural, truncate } from '../lib/format';
import { EmptyState, ErrorState, Panel, Skeleton, StatusChip } from '../components/primitives';
import './archive.css';

export function Archive() {
  const { id } = useParams();
  const { data, error, refetch } = useQuery('/conversations');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={5} height={60} />;

  const totalMessages = data.sessions.reduce((n: number, s: any) => n + s.messages, 0);

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Archive</h1>
          <p className="page-sub">
            {plural(data.sessions.length, 'preserved conversation')} carrying {plural(totalMessages, 'message')} from the
            previous system. Read only by design.
          </p>
        </div>
      </header>

      <div className="notice">
        <StatusChip tone="neutral">Sanitised history</StatusChip>
        <p>
          Tool calls, tool results, credentials, cookies, caches, and runtime logs were deliberately excluded during
          migration. What remains is the user and assistant text needed for product continuity, which is why some
          exchanges refer to actions whose payloads are not here.
        </p>
      </div>

      <div className="archive-columns">
        <Panel title="Sessions">
          <ul className="archive-list">
            {data.sessions.map((s: any) => (
              <li key={s.id}>
                <Link to={`/archive/${s.id}`} className={`archive-row ${s.id === id ? 'is-active' : ''}`}>
                  <span className="archive-row-head">
                    <span className="mono faint">{s.first_timestamp?.slice(0, 10) ?? 'undated'}</span>
                    <span className="mono faint">{plural(s.messages, 'msg')}</span>
                  </span>
                  <span className="archive-row-opening">{truncate(s.opening ?? 'No opening message', 110)}</span>
                  <span className="mono archive-row-size faint">{formatBytes(s.original_bytes)} original</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="archive-detail">
          {id ? (
            <SessionTranscript id={id} />
          ) : (
            <EmptyState title="Select a conversation">
              Each session keeps its archive reference and the checksum of the original file, so any message can be
              traced back to the preserved export.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionTranscript({ id }: { id: string }) {
  const { data, error, refetch } = useQuery(`/conversations/${id}`, [id]);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={64} />;

  return (
    <Panel
      title={`${plural(data.messages.length, 'message')}`}
      action={<span className="mono faint">{data.original_sha256.slice(0, 16)}</span>}
    >
      <ol className="transcript-list">
        {data.messages.map((m: any) => (
          <li key={m.sequence} className={`turn turn-${m.role}`}>
            <div className="turn-head">
              <span className="label">{m.role}</span>
              {m.timestamp && <span className="mono faint">{formatDateTime(m.timestamp)}</span>}
            </div>
            <div className={m.role === 'user' ? 'turn-body' : 'turn-body turn-body-assistant'}>{m.content}</div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
