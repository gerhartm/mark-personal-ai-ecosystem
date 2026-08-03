import * as tools from './tools.js';

export interface EvidenceHit {
  canonical_id: string;
  kind: string;
  field: string;
  title: string;
  snippet: string;
}

const text = (value: unknown, limit = 1200) => String(value ?? '').trim().slice(0, limit);
const list = (value: unknown, limit = 8) => Array.isArray(value) ? value.slice(0, limit) : [];

function recordFor(hit: EvidenceHit) {
  if (hit.kind === 'event') {
    const event = tools.getEvent(hit.canonical_id) as any;
    if (!event) return null;
    return {
      id: event.id,
      kind: 'event',
      summary: text(event.summary),
      business_signal: text(event.business_signal),
      significance: event.significance,
      category: event.primary_category,
      subject_date: event.subject_date,
      source: text(event.source?.title ?? event.source?.source_label),
      insights: list(event.insights).map((item: any) => text(item.text, 500)),
      tags: list(event.tags),
    };
  }
  if (hit.kind === 'source') {
    const source = tools.getSource(hit.canonical_id) as any;
    if (!source) return null;
    return {
      id: source.source_id,
      kind: 'source',
      title: text(source.title ?? source.source_label),
      label: text(source.source_label),
      type: source.source_type,
      captured_at: source.timestamp,
      events: list(source.events, 6).map((event: any) => ({
        id: event.id,
        summary: text(event.summary, 600),
        significance: event.significance,
      })),
    };
  }
  if (hit.kind === 'theme') {
    const theme = tools.getTheme(hit.canonical_id) as any;
    if (!theme) return null;
    return {
      id: theme.id,
      kind: 'theme',
      title: text(theme.title),
      through_line: text(theme.through_line, 1600),
      events: list(theme.events, 8).map((event: any) => ({
        id: event.id,
        summary: text(event.summary, 500),
      })),
    };
  }
  if (hit.kind === 'draft') {
    const draft = tools.getDraft(hit.canonical_id) as any;
    if (!draft) return null;
    return {
      id: draft.id,
      kind: 'draft',
      template: draft.template_type,
      focus: text(draft.focus),
      latest_revision: text(draft.revisions?.[0]?.body, 1800),
    };
  }
  if (hit.kind === 'conversation') {
    const conversation = tools.getConversation(hit.canonical_id) as any;
    if (!conversation) return null;
    return {
      id: conversation.id,
      kind: 'conversation',
      messages: list(conversation.messages, 8).map((message: any) => ({
        role: message.role,
        content: text(message.content, 700),
      })),
    };
  }
  return null;
}

export function buildAskContext(question: string) {
  const lexical = tools.search(question, 10).results as EvidenceHit[];
  const hits = [...lexical];
  const seen = new Set(hits.map((hit) => `${hit.kind}:${hit.canonical_id}`));

  if (hits.length < 6) {
    const highSignal = (tools.brief().highSignal ?? []) as any[];
    for (const event of highSignal) {
      const key = `event:${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        canonical_id: event.id,
        kind: 'event',
        field: 'summary',
        title: text(event.source_title ?? event.summary, 180),
        snippet: text(event.summary, 360),
      });
      if (hits.length >= 10) break;
    }
  }

  const records = hits.map(recordFor).filter(Boolean);
  const input = [
    `CURRENT QUESTION\n${question}`,
    `CORPUS EVIDENCE\n${records.map((record) => JSON.stringify(record)).join('\n')}`,
  ].join('\n\n').slice(0, 28_000);

  return { input, hits, records: records.length };
}
