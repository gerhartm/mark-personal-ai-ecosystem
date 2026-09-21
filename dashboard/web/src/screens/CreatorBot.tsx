import { useWorkflowRestore, WorkflowHistory } from './SavedWork';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, useQuery } from '../lib/api';
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
  const brief = useQuery<any>('/brief');
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
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (text: string, index: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(index); window.setTimeout(() => setCopied(null), 2500); }
    catch { setError('Copy could not access the clipboard. Select the output text and copy it directly.'); }
  };

  const saved = useWorkflowRestore((result, input) => { if (result.creator !== creator) { setError('This saved draft belongs to another creator. Open it from Saved work.'); return; } setResult(result); setPrompt(input.prompt); setFormat(input.format); setCount(String(input.count)); setTone(input.tone); setLength(input.length); setCustomTone(input.customTone || ''); setFeedback(''); });

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
      setResult(response); saved.remember(response.id); saved.query.refetch();
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
      <WorkflowHistory id={result?.id} query={saved.query} />
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
            <textarea
              rows={2}
              value={customTone}
              onChange={(event) => setCustomTone(event.target.value)}
              placeholder={creator === 'Haseeb'
                ? 'Describe the voice you want in your own words — e.g. blunter, more first-principles, fewer hedges, one concrete example per point.'
                : 'Describe the voice you want in your own words — e.g. more patient, more first-principles, fewer asides, one concrete example per point.'}
            />
          </label>
          <div className="creator-last-row">
            <OptionRow label="Length" values={LENGTHS} active={length} setActive={setLength} />
            <button type="button" onClick={() => run()} disabled={busy || !prompt.trim()}>{busy ? 'Writing…' : 'Generate'}</button>
          </div>
          <p className="creator-count">{brief.data?.counts?.sources ?? 0} sources in corpus</p>
        </div>

        <div className="creator-bot-card creator-output">
          <Eyebrow>Output</Eyebrow>
          {error ? <p className="creator-error" role="alert">{error}</p> : null}
          {!outputs.length && !busy ? <p className="creator-empty">Nothing generated yet — write a prompt above and hit Generate.</p> : null}
          {busy && !outputs.length ? <p className="creator-empty">Pulling voice from corpus…</p> : null}
          {outputs.map((output, index) => (
            <article data-testid="creator-draft" className="mb-2.5 rounded-[7px] border border-[var(--line)] bg-card px-[14px] py-[13px] transition-colors last:mb-0 hover:border-[var(--brass)]" key={`${output.angle}-${index}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[9.5px] tracking-[0.09em] uppercase text-dim">{output.angle || `angle ${index + 1}`}</span>
                <small className="ml-auto font-mono text-[9px] text-dim">{renderedFormat === 'blog' ? `${output.text.trim().split(/\s+/).length} words` : `${output.text.length}/280`}</small>
                <button className="rounded border border-[var(--line)] px-2 py-[3px] font-mono text-[9px] text-muted-foreground transition-colors hover:border-[var(--brass)] hover:text-foreground" type="button" onClick={() => copy(output.text, index)}>{copied === index ? 'Copied' : 'Copy'}</button>
              </div>
              {renderedFormat === 'blog' ? <BlogOutput text={output.text} /> : <p data-testid="creator-tweet" className="m-0 text-[15px] leading-[1.55] text-pretty text-foreground">{output.text}</p>}
            </article>
          ))}
          {outputs.length ? (
            <div data-testid="creator-feedback" className="mt-4 border-t border-[var(--line)] pt-4">
              <Eyebrow>Feedback · suggest changes</Eyebrow>
              <textarea className="mt-1.5 w-full resize-none rounded-[5px] border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-[12.5px] leading-relaxed text-foreground placeholder:text-dim focus-visible:border-[var(--brass)] focus-visible:outline-none" rows={2} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="e.g. make the second angle sharper and cut the final sentence" />
              <div className="mt-2 flex items-center gap-3">
                <p className="m-0 font-mono text-[9.5px] text-dim">Regenerates the draft above with your notes applied</p>
                <button className="ml-auto rounded border border-[var(--brass)] px-[13px] py-1.5 font-mono text-[10px] tracking-[0.05em] text-[var(--brass)] transition-colors disabled:opacity-40" type="button" onClick={() => run(feedback.trim())} disabled={busy || !feedback.trim()}>{busy ? 'Revising…' : 'Revise'}</button>
              </div>
            </div>
          ) : null}
        </div>

        {outputs.length ? (
          <div className="creator-bot-card">
            <Eyebrow>Works cited · quotes &amp; inferences</Eyebrow>
            <div className="mt-1 space-y-4">
              {outputs.map((output, outputIndex) => (
                <section key={`citations-${outputIndex}`}>
                  <p className="mb-1.5 font-mono text-[9px] tracking-[0.12em] uppercase text-dim">{outputs.length > 1 ? `${output.angle} · ` : ''}{output.citations.length} source{output.citations.length === 1 ? '' : 's'}</p>
                  <div className="space-y-2.5">
                    {output.citations.map((citation) => (
                      <div data-testid="creator-citation" className="border-l-2 border-[var(--brass)] pl-3" key={`${outputIndex}-${citation.id}`}>
                        <p className="m-0 font-mono text-[9px] tracking-[0.09em] uppercase text-[var(--brass)]">{sourceKind(citation.source.source_type)} · {compact(citation.source.title, 110)}</p>
                        {citation.quote ? <blockquote className="mt-1 mb-0 font-serif text-[13.5px] leading-relaxed text-muted-foreground">“{citation.quote}”</blockquote> : null}
                        <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-muted-foreground"><span className="font-mono text-[9px] tracking-[0.09em] uppercase text-dim">Inference · </span>{citation.inference}</p>
                        <small className="mt-1 block font-mono text-[9px] text-dim">{citation.source.who}{citation.source.when ? ` · ${formatDate(citation.source.when)}` : ''}</small>
                        {citation.source.url ? <a className="mt-1 inline-block font-mono text-[9px] text-[var(--brass)] no-underline" href={citation.source.url} target="_blank" rel="noreferrer">Open original</a> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BlogOutput({ text }: { text: string }) {
  return <div className="font-serif text-[15.5px] leading-[1.7] text-foreground"><ReactMarkdown components={{
    h1: ({ children }) => <h3 className="mt-5 mb-1.5 font-sans text-[13px] tracking-[0.02em] text-[var(--brass)] first:mt-0">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-5 mb-1.5 font-sans text-[13px] tracking-[0.02em] text-[var(--brass)] first:mt-0">{children}</h3>,
    h3: ({ children }) => <h3 className="mt-5 mb-1.5 font-sans text-[13px] tracking-[0.02em] text-[var(--brass)] first:mt-0">{children}</h3>,
    p: ({ children }) => <p className="mb-3 text-pretty last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-pretty">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-pretty">{children}</ol>,
    a: ({ children, href }) => <a className="text-[var(--brass)] underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{children}</a>,
  }}>{text}</ReactMarkdown></div>;
}

function OptionRow({ label, values, active, setActive }: { label: string; values: string[]; active: string; setActive: (value: string) => void }) {
  return <div className="creator-option-row"><span>{label}</span>{values.map((value) => <button key={value} type="button" className={active === value ? 'is-active' : ''} onClick={() => setActive(value)}>{value}</button>)}</div>;
}
