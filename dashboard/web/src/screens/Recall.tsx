import { Link, useParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatDateTime, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import { QUESTION_TYPE_LABEL } from '../lib/taxonomy';
import './recall.css';

export function Recall() {
  const { id } = useParams();
  const { data, error, refetch } = useQuery('/quiz/sessions');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={56} />;

  const completed = data.sessions.filter((s: any) => s.completed_at).length;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>Recall</h1>
          <p className="page-sub">
            {plural(data.sessions.length, 'preserved session')}, {completed} completed. Every question keeps the events
            it was drawn from, so a weak answer leads straight back to the evidence.
          </p>
        </div>
      </header>

      <div className="recall-columns">
        <Panel title="Sessions">
          <ul className="session-list">
            {data.sessions.map((s: any) => (
              <li key={s.id}>
                <Link to={`/recall/${s.id}`} className={`session-row ${s.id === id ? 'is-active' : ''}`}>
                  <span className="session-score mono">
                    {s.score_total ? `${s.score_correct ?? 0}/${s.score_total}` : `${s.questions}q`}
                  </span>
                  <span className="session-meta">
                    <span className="mono faint">{formatDateTime(s.created_at)}</span>
                    <span className="faint">
                      {s.answers} of {s.questions} answered
                    </span>
                  </span>
                  {s.completed_at ? (
                    <StatusChip tone="good">done</StatusChip>
                  ) : (
                    <StatusChip tone="neutral">open</StatusChip>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="recall-detail">
          {id ? (
            <SessionView id={id} />
          ) : (
            <EmptyState title="Select a session">
              Sessions preserve the question, the guidance, the answer, the feedback, and the linked events.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionView({ id }: { id: string }) {
  const { data, error, refetch } = useQuery(`/quiz/sessions/${id}`, [id]);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} height={80} />;

  return (
    <Panel title={`${plural(data.questions.length, 'question')}`}>
      <ol className="question-list">
        {data.questions.map((q: any) => (
          <li key={q.id} className="question">
            <div className="question-head">
              <span className="chip chip-sm">{QUESTION_TYPE_LABEL[q.question_type] ?? q.question_type}</span>
              {q.category && <CategoryChip category={q.category} size="sm" />}
              <span className="mono faint">#{q.question_number}</span>
            </div>
            <p className="question-text">{q.question_text}</p>

            {q.answer ? (
              <div className="answer-block">
                <p className="label">Your answer</p>
                <p className="read answer-text">{q.answer.answer_text}</p>
                {q.answer.feedback && (
                  <>
                    <p className="label">Feedback</p>
                    <p className="answer-feedback">{q.answer.feedback}</p>
                  </>
                )}
                {q.answer.is_correct != null && (
                  <StatusChip tone={q.answer.is_correct ? 'good' : 'serious'}>
                    {q.answer.is_correct ? 'marked correct' : 'marked incorrect'}
                  </StatusChip>
                )}
              </div>
            ) : (
              <p className="absent">Not answered in this session.</p>
            )}

            {q.answer_guidance && (
              <details className="guidance">
                <summary className="label">Show guidance</summary>
                <p className="read">{q.answer_guidance}</p>
              </details>
            )}

            {q.events?.length > 0 && (
              <div className="question-events">
                <p className="label">Evidence</p>
                <ul>
                  {q.events.map((ev: any) => (
                    <li key={ev.event_id}>
                      <Link to={`/event/${ev.event_id}`} className="table-link">
                        <span className="mono faint">{ev.event_id}</span> {truncate(ev.summary ?? '', 90)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
