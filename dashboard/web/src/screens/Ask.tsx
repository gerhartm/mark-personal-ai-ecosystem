import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { truncate } from '../lib/format';
import { IconArrow, IconSearch } from '../components/icons';
import { Panel, StatusChip } from '../components/primitives';
import './ask.css';

const STARTERS = [
  'What changed around Aave in the most recent stored intelligence?',
  'Which risks recur across the highest-signal protocol events?',
  'What evidence should I review before discussing stablecoins?',
  'Challenge the current working thesis using the strongest stored counterevidence.',
];

type Hit = {
  canonical_id: string;
  kind: string;
  field: string;
  title: string;
  snippet: string;
};

type Turn = {
  question: string;
  answer: any;
};

function routeForHit(hit: Pick<Hit, 'kind' | 'canonical_id'>) {
  if (hit.kind === 'source') return `/source/${hit.canonical_id}`;
  if (hit.kind === 'draft') return `/studio/${hit.canonical_id}`;
  if (hit.kind === 'conversation') return `/archive/${hit.canonical_id}`;
  if (hit.kind === 'theme') return `/theme/${hit.canonical_id}`;
  return `/event/${hit.canonical_id}`;
}

export function Ask() {
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState(() => searchParams.get('q')?.slice(0, 2_000) ?? '');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<'idle' | 'asking' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = question.trim();
    if (value.length < 3 || state === 'asking') return;
    setState('asking');
    setMessage('');
    try {
      const answer = await api('/ask', { method: 'POST', body: JSON.stringify({ question: value }) });
      setTurns((current) => [...current, { question: value, answer }]);
      setQuestion('');
      setState('idle');
    } catch (error) {
      setMessage((error as Error).message);
      setState('error');
    }
  };

  return (
    <div className="page ask-page">
      <header className="page-head ask-head">
        <div className="page-title">
          <p className="label ask-eyebrow">Grounded in private intelligence</p>
          <h1>Ask</h1>
          <p className="page-sub">
            Ask a research question in plain language. Hermes answers from the stored corpus and shows the records it
            reviewed, so every conclusion can be checked.
          </p>
        </div>
        {turns.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setTurns([])}>
            Clear this session
          </button>
        )}
      </header>

      <Panel className="ask-composer">
        <form onSubmit={ask} className="ask-form">
          <label className="field ask-field">
            <span className="field-label">Question</span>
            <textarea
              className="field-control ask-input"
              value={question}
              rows={3}
              maxLength={2_000}
              autoFocus
              placeholder="Ask about a protocol, trend, risk, event, or argument"
              onChange={(event) => {
                setQuestion(event.target.value);
                setState('idle');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) ask();
              }}
            />
          </label>
          <div className="ask-submit-row">
            <button className="btn btn-primary" type="submit" disabled={question.trim().length < 3 || state === 'asking'}>
              <IconSearch />
              {state === 'asking' ? 'Reviewing intelligence' : 'Ask Hermes'}
            </button>
            <span className="ask-shortcut mono faint">Cmd or Ctrl + Enter</span>
          </div>
          {state === 'error' && <p className="ask-error" role="alert">{message}</p>}
        </form>
      </Panel>

      {turns.length === 0 ? (
        <section className="ask-starters" aria-labelledby="ask-starters-title">
          <div className="ask-section-head">
            <p className="label" id="ask-starters-title">Useful starting points</p>
            <span className="faint">Choose one, then make it specific.</span>
          </div>
          <div className="ask-starter-grid">
            {STARTERS.map((starter) => (
              <button key={starter} type="button" className="ask-starter" onClick={() => setQuestion(starter)}>
                <span>{starter}</span>
                <IconArrow />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="ask-thread" aria-label="Current Ask session">
          {turns.map((turn, index) => <AskTurn key={`${turn.question}-${index}`} turn={turn} />)}
        </section>
      )}
    </div>
  );
}

function AskTurn({ turn }: { turn: Turn }) {
  const answer = turn.answer;
  const copy = String(answer.answer ?? answer.message ?? 'No answer was returned.');
  return (
    <article className="ask-turn">
      <div className="ask-question">
        <p className="label">Mark asked</p>
        <p>{turn.question}</p>
      </div>
      <div className="ask-response">
        <div className="ask-response-head">
          <StatusChip tone={answer.mode === 'hermes' ? 'good' : 'warning'}>
            {answer.mode === 'hermes' ? 'Answered from stored intelligence' : 'Intelligence unavailable'}
          </StatusChip>
          {answer.evidence_count != null && <span className="mono faint">{answer.evidence_count} records reviewed</span>}
        </div>
        <div className="ask-answer-copy">{copy}</div>
        {answer.results?.length > 0 && (
          <div className="ask-evidence">
            <p className="label">Evidence reviewed</p>
            <ul>
              {answer.results.map((hit: Hit) => (
                <li key={`${hit.kind}-${hit.canonical_id}-${hit.field}`}>
                  <Link to={routeForHit(hit)}>
                    <span className="ask-evidence-title">{truncate(hit.title || hit.snippet || hit.canonical_id, 118)}</span>
                    <span className="ask-evidence-meta">
                      <span className="mono">{hit.canonical_id}</span>
                      <IconArrow />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
