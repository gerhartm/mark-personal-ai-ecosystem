import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { formatDateTime, plural, truncate } from '../lib/format';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  StatusChip,
} from '../components/primitives';
import { IconArrow } from '../components/icons';
import { QUESTION_TYPE_LABEL } from '../lib/taxonomy';
import './recall.css';

export function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data, error, refetch } = useQuery('/quiz/sessions');
  const status = useQuery('/quiz/status');
  const suggestedFocus = searchParams.get('focus') ?? '';
  const [creating, setCreating] = useState(Boolean(suggestedFocus));

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={6} height={56} />;

  const completed = data.sessions.filter((session: any) => session.completed_at).length;
  const connected = Boolean(status.data?.connected);

  const created = (sessionId: string) => {
    invalidate('/quiz/sessions');
    refetch();
    setCreating(false);
    navigate(`/quiz/${sessionId}`);
  };

  return (
    <div className="page quiz-page">
      <header className="page-head quiz-head">
        <div className="page-title">
          <p className="label quiz-eyebrow">Knowledge retention</p>
          <h1>Quiz</h1>
          <p className="page-sub">
            Test what you remember from the intelligence you have collected. Hermes creates evidence-linked questions,
            grades the full session together, and sends weak answers back to their source records.
          </p>
        </div>
        <div className="quiz-head-actions">
          <StatusChip tone={connected ? 'good' : 'warning'}>
            {connected ? 'Quiz engine ready' : 'Quiz engine unavailable'}
          </StatusChip>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((value) => !value)}
            disabled={!connected}
          >
            {creating ? 'Close setup' : 'Start a new quiz'}
          </button>
        </div>
      </header>

      {creating && <QuizComposer initialFocus={suggestedFocus} onCreated={created} onCancel={() => setCreating(false)} />}

      <div className="quiz-summary" aria-label="Quiz history summary">
        <span><strong className="mono">{data.sessions.length}</strong> preserved sessions</span>
        <span><strong className="mono">{completed}</strong> completed</span>
        <span><strong className="mono">5</strong> questions in each new quiz</span>
      </div>

      <div className="recall-columns">
        <Panel title="Session history">
          {data.sessions.length === 0 ? (
            <EmptyState title="No quiz sessions yet" />
          ) : (
            <ul className="session-list">
              {data.sessions.map((session: any) => (
                <li key={session.id}>
                  <Link to={`/quiz/${session.id}`} className={`session-row ${session.id === id ? 'is-active' : ''}`}>
                    <span className="session-score mono">
                      {session.score_total ? `${session.score_correct ?? 0}/${session.score_total}` : `${session.questions} questions`}
                    </span>
                    <span className="session-meta">
                      <span>{session.completed_at ? 'Completed session' : 'Open session'}</span>
                      <span className="mono faint">{formatDateTime(session.created_at)}</span>
                    </span>
                    <StatusChip tone={session.completed_at ? 'good' : 'neutral'}>
                      {session.completed_at ? 'scored' : `${session.answers} answered`}
                    </StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="recall-detail">
          {id ? (
            <SessionView id={id} onCompleted={refetch} />
          ) : (
            <EmptyState
              title="Choose a session or start a new quiz"
              action={connected ? (
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  Start a five-question quiz
                </button>
              ) : undefined}
            >
              New sessions draw from the strongest stored records and any topic you specify.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function QuizComposer({
  initialFocus,
  onCreated,
  onCancel,
}: {
  initialFocus: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [focus, setFocus] = useState(initialFocus.slice(0, 300));
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state === 'generating') return;
    setState('generating');
    setMessage('');
    try {
      const result = await api<{ id: string }>('/quiz/sessions', {
        method: 'POST',
        body: JSON.stringify({ focus: focus.trim(), question_count: 5 }),
      });
      onCreated(result.id);
    } catch (error) {
      setMessage((error as Error).message);
      setState('error');
    }
  };

  return (
    <Panel title="Build a five-question knowledge check" className="quiz-composer">
      <form className="quiz-compose-form" onSubmit={submit}>
        <label className="field quiz-focus-field">
          <span className="field-label">Topic or goal <span className="field-optional">optional</span></span>
          <textarea
            className="field-control quiz-focus"
            rows={3}
            maxLength={300}
            value={focus}
            placeholder="Example: Aave risk, recent stablecoin changes, or a balanced review across everything"
            onChange={(event) => {
              setFocus(event.target.value);
              setState('idle');
            }}
          />
          <span className="field-help">Leave this empty for a balanced quiz across high-signal intelligence.</span>
        </label>
        <div className="quiz-compose-side">
          <p className="quiz-compose-note">
            Five questions are generated in one pass. All five answers are graded together to keep the process fast and
            cost efficient.
          </p>
          <div className="quiz-compose-actions">
            <button className="btn btn-primary" type="submit" disabled={state === 'generating'}>
              {state === 'generating' ? 'Creating quiz' : 'Create quiz'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={state === 'generating'}>
              Cancel
            </button>
          </div>
          {state === 'error' && <p className="quiz-error" role="alert">{message}</p>}
        </div>
      </form>
    </Panel>
  );
}

function SessionView({ id, onCompleted }: { id: string; onCompleted: () => void }) {
  const { data, error, refetch } = useQuery(`/quiz/sessions/${id}`, [id]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'grading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setAnswers({});
    setState('idle');
    setMessage('');
  }, [id]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <Skeleton rows={4} height={80} />;

  const complete = Boolean(data.completed_at);
  const answered = data.questions.filter((question: any) => answers[question.id]?.trim().length >= 2).length;

  const submit = async () => {
    if (answered !== data.questions.length || state === 'grading') return;
    setState('grading');
    setMessage('');
    try {
      await api(`/quiz/sessions/${id}/answers`, {
        method: 'POST',
        body: JSON.stringify({
          answers: data.questions.map((question: any) => ({
            question_id: question.id,
            answer_text: answers[question.id].trim(),
          })),
        }),
      });
      invalidate('/quiz/sessions');
      refetch();
      onCompleted();
      setState('idle');
    } catch (submitError) {
      setMessage((submitError as Error).message);
      setState('error');
    }
  };

  return (
    <Panel
      title={complete ? 'Quiz results' : `${plural(data.questions.length, 'question')}`}
      action={complete ? (
        <div className="quiz-score" aria-label={`Score ${data.score_correct} of ${data.score_total}`}>
          <span className="mono">{data.score_correct}/{data.score_total}</span>
          <span className="label">score</span>
        </div>
      ) : (
        <span className="mono faint">{answered}/{data.questions.length} answered</span>
      )}
    >
      <ol className="question-list">
        {data.questions.map((question: any) => (
          <li key={question.id} className="question">
            <div className="question-head">
              <span className="question-number mono">{String(question.question_number).padStart(2, '0')}</span>
              <span className="chip chip-sm">{QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}</span>
              {question.category && <CategoryChip category={question.category} size="sm" />}
            </div>
            <p className="question-text">{question.question_text}</p>

            {complete || question.answer ? (
              <AnswerResult question={question} />
            ) : (
              <label className="field quiz-answer-field">
                <span className="field-label">Your answer</span>
                <textarea
                  className="field-control quiz-answer"
                  rows={4}
                  maxLength={4_000}
                  value={answers[question.id] ?? ''}
                  placeholder="Explain it in your own words"
                  onChange={(event) => {
                    setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                    setState('idle');
                  }}
                />
              </label>
            )}

            {question.events?.length > 0 && (
              <div className="question-events">
                <p className="label">Source records</p>
                <ul>
                  {question.events.map((event: any) => (
                    <li key={event.event_id}>
                      <Link to={`/event/${event.event_id}`} className="table-link">
                        <span>{truncate(event.summary ?? event.event_id, 110)}</span>
                        <span className="question-event-meta">
                          <span className="mono faint">{event.event_id}</span>
                          <IconArrow />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>

      {!complete && (
        <div className="quiz-submit-bar">
          <div>
            <p className="quiz-submit-title">Finish when every answer is ready</p>
            <p className="faint">Hermes grades the complete session in one pass.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={answered !== data.questions.length || state === 'grading'}>
            {state === 'grading' ? 'Grading answers' : 'Finish and score quiz'}
          </button>
          {state === 'error' && <p className="quiz-error" role="alert">{message}</p>}
        </div>
      )}
    </Panel>
  );
}

function AnswerResult({ question }: { question: any }) {
  if (!question.answer) {
    return <p className="absent">This preserved question was not answered.</p>;
  }
  return (
    <div className={`answer-block ${question.answer.is_correct ? 'is-correct' : 'is-missed'}`}>
      <div className="answer-result-head">
        <p className="label">Your answer</p>
        <StatusChip tone={question.answer.is_correct ? 'good' : 'serious'}>
          {question.answer.is_correct ? 'understood' : 'review this'}
        </StatusChip>
      </div>
      <p className="read answer-text">{question.answer.answer_text}</p>
      {question.answer.feedback && (
        <div className="answer-feedback-wrap">
          <p className="label">Hermes feedback</p>
          <p className="answer-feedback">{question.answer.feedback}</p>
        </div>
      )}
    </div>
  );
}
