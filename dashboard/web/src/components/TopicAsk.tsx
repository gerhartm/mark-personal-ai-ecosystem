import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, invalidate } from '../lib/api';
import { compact } from '../lib/desk';
import { EvidenceMarkdown } from './EvidenceMarkdown';
import { IconAsk, IconClose } from './icons';
import './topic-ask.css';

type Evidence = { canonical_id: string; kind: string; title?: string; snippet?: string };
type Turn = { question: string; answer?: string; results?: Evidence[]; error?: string };
type Passage = { highlight: string; around: string };
type Spot = Passage & { left: number; top: number };

const SUGGESTIONS = ['Explain this in plain terms', 'What is the evidence for this?', 'Who disagrees, and why?'];
const MAX_HIGHLIGHT = 2_000;
const BUTTON_WIDTH = 132;

const squeeze = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The text of the paragraph or claim a selection starts in, so a short highlight keeps its sentence. */
function aroundOf(range: Range) {
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  return squeeze(start?.closest('p, li, blockquote, article, h1, h2, h3')?.textContent ?? '').slice(0, 3_000);
}

/**
 * Ask about a topic page. Highlighting text inside `scope` shows an Ask button
 * beside it; the question and Hermes's answer open in a side panel (a bottom
 * sheet on narrow screens) that keeps the page in view. "Ask about this topic"
 * opens the same panel for the whole topic, or for the current highlight, so
 * it also works from the keyboard. Every answer is saved to Ask history.
 */
export function TopicAsk({ tag, title, scope }: { tag: string; title: string; scope: RefObject<HTMLElement | null> }) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);

  // The current highlight inside the page, placed just below its last line.
  const read = useCallback(() => {
    const selection = document.getSelection();
    const root = scope.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const highlight = squeeze(selection.toString());
    if (highlight.length < 3) return null;
    const box = range.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left + box.width / 2 - BUTTON_WIDTH / 2), globalThis.innerWidth - BUTTON_WIDTH - 8);
    return { highlight: highlight.slice(0, MAX_HIGHLIGHT), around: aroundOf(range), left, top: Math.min(box.bottom + 8, globalThis.innerHeight - 52) };
  }, [scope]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSpot(read()));
    };
    const settle = () => setTimeout(update, 0);
    const clear = () => { if (document.getSelection()?.isCollapsed) setSpot(null); };
    document.addEventListener('mouseup', settle);
    document.addEventListener('keyup', settle);
    document.addEventListener('touchend', settle);
    document.addEventListener('selectionchange', clear);
    globalThis.addEventListener('scroll', update, true);
    globalThis.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mouseup', settle);
      document.removeEventListener('keyup', settle);
      document.removeEventListener('touchend', settle);
      document.removeEventListener('selectionchange', clear);
      globalThis.removeEventListener('scroll', update, true);
      globalThis.removeEventListener('resize', update);
    };
  }, [read]);

  useEffect(() => {
    if (passage) input.current?.focus();
  }, [passage]);
  // On wide screens the page makes room for the panel instead of sliding under it.
  const isOpen = Boolean(passage);
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('topic-ask-open');
    return () => document.documentElement.classList.remove('topic-ask-open');
  }, [isOpen]);
  useEffect(() => {
    const last = thread.current?.lastElementChild;
    if (last && turns.length) last.scrollIntoView({ block: 'nearest' });
  }, [turns, busy]);

  const open = (next: Passage) => {
    setPassage(next);
    setTurns([]);
    setQuestion('');
    setSpot(null);
  };
  const close = () => {
    setPassage(null);
    setTurns([]);
    opener.current?.focus();
  };

  const ask = async (text: string) => {
    const asked = text.trim();
    if (!passage || asked.length < 3 || busy) return;
    const history = turns.filter((turn) => turn.answer).map((turn) => ({ question: turn.question, answer: turn.answer! }));
    setTurns((current) => [...current, { question: asked }]);
    setQuestion('');
    setBusy(true);
    try {
      const reply = await api<{ answer?: string; message?: string; results?: Evidence[] }>(`/topics/${encodeURIComponent(tag)}/ask`, {
        method: 'POST',
        body: JSON.stringify({ question: asked, highlight: passage.highlight, surrounding: passage.around, history }),
      });
      setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, answer: reply.answer || reply.message || '', results: reply.results ?? [] } : turn));
      invalidate('/ask/history');
    } catch (failure) {
      setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, error: failure instanceof Error ? failure.message : 'Hermes could not answer that question.' } : turn));
      setQuestion(asked);
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <>
      <button ref={opener} type="button" data-testid="topic-ask-open"
        // Keeps a highlight selected while the button is pressed, so it can be asked about.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { const current = read(); open(current ? { highlight: current.highlight, around: current.around } : { highlight: '', around: '' }); }}
        className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--brass)] hover:text-foreground">
        <IconAsk />Ask about this topic
      </button>
      <span className="font-mono text-[11px] text-dim">or highlight any passage to ask about it</span>

      {spot && !busy ? createPortal(
        <button type="button" data-testid="topic-ask-highlight" className="topic-ask-spot" style={{ left: spot.left, top: spot.top, width: BUTTON_WIDTH }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => open({ highlight: spot.highlight, around: spot.around })}>
          <IconAsk />Ask about this
        </button>, document.body) : null}

      {passage ? createPortal(
        <aside role="dialog" aria-modal="false" aria-labelledby="topic-ask-title" data-testid="topic-ask-panel" className="topic-ask-panel"
          onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="min-w-0">
              <h2 id="topic-ask-title" className="text-[14px] font-medium text-foreground">Ask about this</h2>
              <p className="mt-0.5 truncate font-mono text-[11px] text-dim">{title}</p>
            </div>
            <button type="button" aria-label="Close" onClick={close} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded text-dim hover:text-foreground"><IconClose /></button>
          </header>

          <div ref={thread} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
            {passage.highlight
              ? <blockquote data-testid="topic-ask-quote" className="mb-4 line-clamp-6 border-l-2 border-[var(--brass)] pl-3 font-serif text-[14px] leading-relaxed text-muted-foreground">{passage.highlight}</blockquote>
              : <p className="mb-4 font-serif text-[14px] leading-relaxed text-muted-foreground">Ask anything about this topic. Answers draw on its claims first, then the rest of your research.</p>}
            {turns.map((turn, index) => (
              <div key={index} className="mb-5" data-testid="topic-ask-turn">
                <p className="mb-2 rounded-md bg-surface-800 px-3 py-2 text-[13.5px] text-foreground">{turn.question}</p>
                {turn.answer ? <div className="desk-markdown text-[14px]" data-testid="topic-ask-answer"><EvidenceMarkdown>{turn.answer}</EvidenceMarkdown></div> : null}
                {turn.results?.length ? (
                  <details className="mt-2 font-mono text-[11px] text-dim">
                    <summary className="cursor-pointer">{turn.results.length === 1 ? '1 record' : `${turn.results.length} records`} behind this answer</summary>
                    <ul className="mt-1.5 space-y-1">
                      {turn.results.map((item) => (
                        <li key={`${item.kind}-${item.canonical_id}`}>
                          <Link className="text-[var(--accent-text)] underline-offset-2 hover:underline" to={item.kind === 'source' ? `/source/${encodeURIComponent(item.canonical_id)}` : `/event/${item.canonical_id}`}>{compact(item.title || item.canonical_id, 70)}</Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {turn.error ? <p role="alert" className="font-mono text-[11.5px] text-[var(--danger-text)]">{turn.error}</p> : null}
              </div>
            ))}
            {busy ? <p role="status" className="topic-ask-working font-mono text-[11.5px] text-muted-foreground"><span aria-hidden="true" />Reading this topic's evidence. Answers take up to a minute.</p> : null}
          </div>

          <form onSubmit={submit} className="border-t border-[var(--line)] px-4 py-3">
            {!turns.length ? (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" disabled={busy} onClick={() => void ask(suggestion)}
                    className="cursor-pointer rounded-full border border-[var(--line-strong)] px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground">{suggestion}</button>
                ))}
              </div>
            ) : null}
            <label htmlFor="topic-ask-question" className="sr-only">Your question</label>
            <textarea id="topic-ask-question" ref={input} value={question} rows={2} maxLength={2_000}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(question); } }}
              placeholder={turns.length ? 'Ask a follow-up' : 'What do you want to know about this?'}
              className="w-full resize-none rounded-[5px] border border-[var(--line-strong)] bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-dim focus:border-[var(--brass)] focus:outline-none" />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10.5px] text-dim">Enter to send · Shift+Enter for a new line · saved to Ask history</span>
              <button type="submit" className="desk-button" disabled={busy || question.trim().length < 3}>{busy ? 'Answering' : 'Send'}</button>
            </div>
          </form>
        </aside>, document.body) : null}
    </>
  );
}
