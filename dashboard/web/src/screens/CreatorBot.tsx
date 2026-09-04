import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { Eyebrow, ViewHead } from '../components/Desk';
import { compact, formatDate, sourceKind } from '../lib/desk';
import './creator-bot.css';

const TONES = ['contrarian', 'analytical', 'wry', 'earnest', 'punchy'];
const LENGTHS = ['short', 'medium', 'long'];

type CreatorFormat = 'tweet' | 'blog';
type Citation = {
  id: string;
  quote: string | null;
  inference: string;
  source: {
    id: string;
    kind: 'event' | 'source';
    title: string;
    who: string;
    when: string;
    source_type: string;
    url: string;
  };
};
type Output = { text: string; angle: string; citations: Citation[] };
type CreatorResult = { id: string; revision: number; outputs: Output[]; format: CreatorFormat };

export function CreatorBot({ creator }: { creator: 'Haseeb' | 'Tarun' }) {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<CreatorFormat>('tweet');
  const [count, setCount] = useState('3');
  const [tone, setTone] = useState(creator === 'Haseeb' ? 'contrarian' : 'analytical');
  const [length, setLength] = useState('medium');
  const [customTone, setCustomTone] = useState('');
  const [result, setResult] = useState<CreatorResult | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (revision = '') => {
    if (!prompt.trim() || busy || (revision && !result?.outputs.length)) return;
    setBusy(true);
    setError('');
    try {
      const response = await api<CreatorResult>('/creator', {
        method: 'POST',
        body: JSON.stringify({
          creator,
          format,
          count: Number(count),
          tone,
          custom_tone: customTone.trim(),
          length,
          prompt: prompt.trim(),
          feedback: revision,
          prior_output: revision ? result?.outputs.map((output) => output.text) : [],
          draft_id: revision ? result?.id : undefined,
        }),
      });
      setResult(response);
      if (revision) setFeedback('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const outputs = result?.outputs ?? [];
  const renderedFormat = result?.format ?? format;
  return (
    <section>
      <ViewHead title={`${creator} bot`} />
      <div className="creator-bot-wrap">
        <div className="creator-bot-card">
          <Eyebrow>{creator === 'Haseeb' ? 'What should he tweet about?' : 'What should he write about?'}</Eyebrow>
          <textarea
            className="creator-prompt"
            rows={3}
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value); setResult(null); setFeedback(''); setError(''); }}
            placeholder={creator === 'Haseeb'
              ? 'e.g. why perp DEX fee compression is a distribution story, not an execution story'
              : 'e.g. why token governance is really a legitimacy problem, not a voting problem'}
          />
          <OptionRow label="Format" values={['tweet', 'blog post']} active={format === 'tweet' ? 'tweet' : 'blog post'} setActive={(value) => { setFormat(value === 'tweet' ? 'tweet' : 'blog'); setResult(null); setFeedback(''); setError(''); }} />
          {format === 'tweet' ? <OptionRow label="Tweets" values={['1', '3', '5']} active={count} setActive={setCount} /> : null}
          <OptionRow label="Tone" values={TONES} active={tone} setActive={setTone} />
          <label className="creator-custom">
            <span>Your own tone</span>
            <textarea rows={2} value={customTone} onChange={(event) => setCustomTone(event.target.value)} placeholder="Describe the voice you want in your own words" />
          </label>
          <div className="creator-last-row">
            <OptionRow label="Length" values={LENGTHS} active={length} setActive={setLength} />
            <button type="button" onClick={() => run()} disabled={busy || !prompt.trim()}>{busy ? 'Writing...' : 'Generate'}</button>
          </div>
          <p className="creator-count">Creator Reference memory and Crypto evidence connected</p>
        </div>

        <div className="creator-bot-card creator-output">
          <Eyebrow>Output</Eyebrow>
          {error ? <p className="creator-error" role="alert">{error}</p> : null}
          {!outputs.length && !busy ? <p className="creator-empty">Nothing generated yet. Write a prompt above and select Generate.</p> : null}
          {busy && !outputs.length ? <p className="creator-empty">Pulling voice and evidence from memory...</p> : null}
          {outputs.map((output, index) => (
            <article className="creator-draft" key={`${output.angle}-${index}`}>
              <div className="creator-draft-head">
                <span>{output.angle || `angle ${index + 1}`}</span>
                <small>{renderedFormat === 'blog' ? `${output.text.trim().split(/\s+/).length} words` : `${output.text.length}/280`}</small>
                <button type="button" onClick={() => navigator.clipboard?.writeText(output.text)}>Copy</button>
              </div>
              {renderedFormat === 'blog' ? <div className="desk-markdown"><ReactMarkdown>{output.text}</ReactMarkdown></div> : <p className="creator-tweet">{output.text}</p>}
            </article>
          ))}
          {outputs.length ? (
            <div className="creator-feedback">
              <Eyebrow>Feedback · suggest changes</Eyebrow>
              <textarea rows={2} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="e.g. make the second angle sharper and cut the final sentence" />
              <div className="creator-feedback-foot">
                <p>Keeps everything you did not ask to change</p>
                <button type="button" onClick={() => run(feedback.trim())} disabled={busy || !feedback.trim()}>{busy ? 'Revising...' : 'Revise'}</button>
              </div>
            </div>
          ) : null}
        </div>

        {outputs.length ? (
          <div className="creator-bot-card">
            <Eyebrow>Works cited · quotes &amp; inferences</Eyebrow>
            {outputs.map((output, outputIndex) => (
              <section className="creator-citation-group" key={`citations-${outputIndex}`}>
                <p className="creator-citation-label">{outputs.length > 1 ? `${output.angle} · ` : ''}{output.citations.length} source{output.citations.length === 1 ? '' : 's'}</p>
                {output.citations.map((citation) => (
                  <div className="creator-citation" key={`${outputIndex}-${citation.id}`}>
                    <span>{sourceKind(citation.source.source_type)} · {compact(citation.source.title, 110)}</span>
                    {citation.quote ? <blockquote>“{citation.quote}”</blockquote> : null}
                    <p><b>Inference · </b>{citation.inference}</p>
                    <small>{citation.source.who}{citation.source.when ? ` · ${formatDate(citation.source.when)}` : ''}</small>
                    {citation.source.url ? <a href={citation.source.url} target="_blank" rel="noreferrer">Open original</a> : null}
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OptionRow({ label, values, active, setActive }: { label: string; values: string[]; active: string; setActive: (value: string) => void }) {
  return <div className="creator-option-row"><span>{label}</span>{values.map((value) => <button key={value} type="button" className={active === value ? 'is-active' : ''} onClick={() => setActive(value)}>{value}</button>)}</div>;
}
