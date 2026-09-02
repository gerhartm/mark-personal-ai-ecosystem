import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useQuery } from '../lib/api';
import { EmptyState, ErrorState, Eyebrow, LoadingRows, Provenance, ViewHead } from '../components/Desk';
import { EvidenceMarkdown } from '../components/EvidenceMarkdown';
import { compact, formatDate, sourceKind, titleCase } from '../lib/desk';
import './library.css';

export function SourceDetail() {
  const { id = '' } = useParams();
  const sourceId = decodeURIComponent(id);
  const result = useQuery<any>(`/sources/${encodeURIComponent(sourceId)}`, [sourceId]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (question.trim().length < 3 || asking) return;
    setAsking(true);
    setAskError('');
    try {
      const response = await api<any>('/ask', { method: 'POST', body: JSON.stringify({ question: question.trim(), source_ids: [sourceId] }) });
      setAnswer(response.answer || response.message || 'No answer was returned.');
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'The question could not be answered.');
    } finally {
      setAsking(false);
    }
  };

  if (result.loading && !result.data) return <LoadingRows rows={7} />;
  if (result.error) return <ErrorState error={result.error} retry={result.refetch} />;
  const source = result.data;
  const brief = source?.research_brief;
  if (!source) return <EmptyState title="Source not found">The source may have been removed or is not available in this workspace.</EmptyState>;

  return (
    <section>
      <Link className="topic-back" to="/library">Back to sources</Link>
      <ViewHead title={source.title || source.source_label || 'Untitled source'} actions={source.source_url ? <a className="desk-button secondary" href={source.source_url} target="_blank" rel="noreferrer">Open original</a> : undefined}>
        {sourceKind(source.source_type)} from {source.source_channel || source.source_label || 'the private corpus'}, captured {formatDate(source.captured_at)}.
      </ViewHead>

      <div className="source-detail-layout">
        <article>
          <Eyebrow>Source overview</Eyebrow>
          {brief?.overview ? (
            <div className="source-summary">
              <p>{brief.overview}</p>
              <Provenance
                when={brief.date_from && brief.date_to ? `${formatDate(brief.date_from)} to ${formatDate(brief.date_to)}` : undefined}
                kind={`${brief.event_count ?? source.events?.length ?? 0} linked records`}
              />
            </div>
          ) : <EmptyState title="No extracted summary">The source is stored, but it does not yet have a readable overview.</EmptyState>}

          {brief?.key_points?.length ? (
            <section className="source-key-points">
              <Eyebrow>Key arguments and evidence</Eyebrow>
              <ul>{brief.key_points.map((point: string) => <li key={point}>{point}</li>)}</ul>
            </section>
          ) : null}

          {source.content ? (
            <details className="source-body">
              <summary>Read stored source text</summary>
              <pre>{source.content}</pre>
            </details>
          ) : null}

          <Eyebrow>Extracted events and claims</Eyebrow>
          <div className="source-event-list">
            {(source.events ?? []).map((event: any) => (
              <Link to={`/event/${event.id}`} className="source-event" key={event.id}>
                <div>
                  <span className="desk-tag">{titleCase(event.primary_category)}</span>
                  <h2>{compact(event.summary, 220)}</h2>
                  {event.insight_text ? <p>{compact(event.insight_text, 260)}</p> : null}
                  <Provenance when={formatDate(event.subject_date)} kind={`signal ${event.significance}/5`} />
                </div>
                <span>Open</span>
              </Link>
            ))}
          </div>
        </article>

        <aside className="desk-aside source-ask-panel desk-card">
          <Eyebrow>Ask this source</Eyebrow>
          <p>Hermes will answer from this source only and cite the supporting record.</p>
          <form className="desk-form" onSubmit={ask}>
            <textarea className="desk-textarea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What argument is the speaker making here?" />
            <button className="desk-button" type="submit" disabled={asking || question.trim().length < 3}>{asking ? 'Reading source' : 'Ask'}</button>
          </form>
          {askError ? <p className="source-ask-error" role="alert">{askError}</p> : null}
          {answer ? <div className="desk-markdown source-answer"><EvidenceMarkdown>{answer}</EvidenceMarkdown></div> : null}
        </aside>
      </div>
    </section>
  );
}
