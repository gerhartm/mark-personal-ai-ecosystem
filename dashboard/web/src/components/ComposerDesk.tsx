import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { api, useQuery } from '../lib/api';
import { compact, sourceKind } from '../lib/desk';
import { Chip, EmptyState, Eyebrow } from './Desk';
import '../screens/composer-desk.css';

type Source = { source_id: string; title?: string; source_label?: string; source_type?: string; event_count?: number };

export function ComposerDesk({
  mode,
  title,
  description,
  focusLabel,
  placeholder,
  templateOptions,
  extra,
  creator,
}: {
  mode: 'mark' | 'creator_reference';
  title: string;
  description: string;
  focusLabel: string;
  placeholder: string;
  templateOptions: { value: string; label: string }[];
  extra?: ReactNode;
  creator?: 'Haseeb' | 'Tarun';
}) {
  const sourcesQuery = useQuery<{ sources: Source[] }>('/sources');
  const [focus, setFocus] = useState('');
  const [template, setTemplate] = useState(templateOptions[0]?.value ?? 'speaking_prep');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sources = useMemo(() => {
    const needle = sourceSearch.trim().toLowerCase();
    return (sourcesQuery.data?.sources ?? []).filter((source) => !needle || [source.title, source.source_label, source.source_type].some((value) => String(value ?? '').toLowerCase().includes(needle))).slice(0, 30);
  }, [sourcesQuery.data, sourceSearch]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 12 ? [...current, id] : current);
  const needsPeriod = template === 'month_in_review' || template === 'year_in_review';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (focus.trim().length < 3 || busy || (needsPeriod && (!from || !to))) return;
    setBusy(true);
    setError('');
    try {
      const response = await api('/studio/drafts', {
        method: 'POST',
        body: JSON.stringify({ template_type: template, focus: creator ? `Write through the stored ${creator} creator reference. ${focus.trim()}` : focus.trim(), date_from: from || null, date_to: to || null, writing_lens: mode, source_ids: selected }),
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Hermes could not generate this draft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer-layout">
      <form className="composer-form desk-card" onSubmit={submit}>
        <div className="composer-form-head">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="desk-field">
          <label htmlFor={`${mode}-focus`}>{focusLabel}</label>
          <textarea id={`${mode}-focus`} className="desk-textarea" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder={placeholder} />
        </div>
        <div className="desk-field">
          <label>Output</label>
          <div className="desk-chip-row composer-options">
            {templateOptions.map((option) => <Chip key={option.value} active={template === option.value} onClick={() => setTemplate(option.value)}>{option.label}</Chip>)}
          </div>
        </div>
        {extra}
        <div className="desk-form-row">
          <div className="desk-field"><label htmlFor={`${mode}-from`}>Start date {needsPeriod ? '' : 'optional'}</label><input className="desk-input" id={`${mode}-from`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div className="desk-field"><label htmlFor={`${mode}-to`}>End date {needsPeriod ? '' : 'optional'}</label><input className="desk-input" id={`${mode}-to`} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        </div>

        <div className="composer-sources">
          <div className="composer-source-head"><Eyebrow>Evidence sources</Eyebrow><span>{selected.length ? `${selected.length} selected` : 'Automatic selection'}</span></div>
          <input className="desk-input" type="search" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Find sources to use, or leave blank for automatic selection" />
          <div className="composer-source-list">
            {sources.map((source) => (
              <button type="button" className={selected.includes(source.source_id) ? 'is-selected' : ''} key={source.source_id} onClick={() => toggle(source.source_id)}>
                <span>{selected.includes(source.source_id) ? 'Selected' : sourceKind(source.source_type)}</span>
                <strong>{compact(source.title || source.source_label || 'Untitled source', 110)}</strong>
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="desk-error" role="alert"><strong>Generation failed.</strong><p>{error}</p></div> : null}
        <button className="desk-button composer-submit" type="submit" disabled={busy || focus.trim().length < 3 || (needsPeriod && (!from || !to))}>{busy ? 'Building from evidence' : 'Generate with Hermes'}</button>
      </form>

      <section className="composer-output desk-card">
        <Eyebrow>Output</Eyebrow>
        {!result && !busy ? <EmptyState title="No draft yet">Choose a goal and generate a cited result from the corpus.</EmptyState> : null}
        {busy ? <div className="composer-busy"><span /><p>Hermes is selecting evidence and writing the requested output.</p></div> : null}
        {result ? (
          <>
            <div className="desk-markdown"><ReactMarkdown>{result.body || ''}</ReactMarkdown></div>
            <div className="composer-output-actions">
              <button className="desk-button secondary" type="button" onClick={() => navigator.clipboard?.writeText(result.body || '')}>Copy</button>
              <Link className="desk-button secondary" to={`/studio/${result.id}`}>Open saved draft</Link>
            </div>
            {result.citations?.length ? <div className="composer-citations"><Eyebrow>Supporting records</Eyebrow>{result.citations.map((citation: any) => <Link key={citation.id} to={citation.kind === 'source' ? `/source/${encodeURIComponent(citation.id)}` : `/event/${citation.id}`}>{citation.title}</Link>)}</div> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
