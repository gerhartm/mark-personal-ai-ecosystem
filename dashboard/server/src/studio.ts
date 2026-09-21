import { randomUUID } from 'node:crypto';
import { audit, db, one } from './db.js';
import { runHermesAgent } from './hermes-client.js';
import { sourceContent } from './ingestion.js';
import * as tools from './tools.js';

export const STUDIO_TEMPLATES = [
  'speaking_prep',
  'x_post',
  'twitter_thread',
  'linkedin_post',
  'month_in_review',
  'year_in_review',
] as const;

export type StudioTemplate = (typeof STUDIO_TEMPLATES)[number];

export const STUDIO_WRITING_LENSES = ['mark', 'creator_reference'] as const;
export type StudioWritingLens = (typeof STUDIO_WRITING_LENSES)[number];

export interface StudioDraftInput {
  template_type?: string;
  focus?: string;
  date_from?: string | null;
  date_to?: string | null;
  writing_lens?: string;
  source_ids?: unknown;
}

export interface StudioCitation {
  id: string;
  kind: 'event' | 'source';
  title: string;
}

export class StudioInputError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const eventCitation = /\[(\d{4}-\d{2}-\d{2}-\d{4})\]/g;
const sourceCitation = /\[(sha256:[a-f0-9]{64})\]/gi;

const compact = (value: unknown, limit = 1200) => String(value ?? '').trim().slice(0, limit);

function validateDate(value: unknown, field: string) {
  if (value == null || value === '') return null;
  const date = String(value);
  if (!datePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new StudioInputError('invalid_date', `${field} must be a valid date.`);
  }
  return date;
}

export function validateStudioInput(value: StudioDraftInput) {
  const template = String(value?.template_type ?? '') as StudioTemplate;
  if (!STUDIO_TEMPLATES.includes(template)) {
    throw new StudioInputError('invalid_template', 'Choose one of the available draft formats.');
  }
  const focus = String(value?.focus ?? '').trim();
  if (focus.length < 3 || focus.length > 500) {
    throw new StudioInputError('invalid_focus', 'Focus must be between 3 and 500 characters.');
  }
  const dateFrom = validateDate(value.date_from, 'Start date');
  const dateTo = validateDate(value.date_to, 'End date');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new StudioInputError('invalid_window', 'Start date must be before the end date.');
  }
  const writingLens = String(value?.writing_lens ?? 'mark') as StudioWritingLens;
  if (!STUDIO_WRITING_LENSES.includes(writingLens)) {
    throw new StudioInputError('invalid_writing_lens', 'Choose one of the available writing lenses.');
  }
  if ((template === 'month_in_review' || template === 'year_in_review') && (!dateFrom || !dateTo)) {
    throw new StudioInputError('period_required', 'Choose a start and end date for a review brief.');
  }
  const sourceIds = Array.isArray(value?.source_ids)
    ? [...new Set(value.source_ids.map(String).filter((id) => Boolean(tools.getSource(id))))].slice(0, 12)
    : [];
  return { template, focus, dateFrom, dateTo, writingLens, sourceIds };
}

function eventRecord(id: string) {
  const event = tools.getEvent(id) as any;
  if (!event) return null;
  return {
    id: event.id,
    kind: 'event',
    subject_date: event.subject_date,
    category: event.primary_category,
    significance: event.significance,
    summary: compact(event.summary, 800),
    detailed_content: compact(event.detailed_content, 1400),
    key_takeaways: Array.isArray(event.insights)
      ? event.insights.slice(0, 6).map((item: any) => compact(item.text, 500))
      : [],
    source_id: event.source_id,
    source_title: compact(event.source?.title ?? event.source?.source_label, 240),
  };
}

export function relevantPassages(body: string, focus: string, maximum = 4_000) {
  if (body.length <= maximum) return body;
  const terms = [...new Set(focus.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])]
    .filter(term => !['the','and','what','with','from','about','this','that','should','views','opinions','language','structure'].includes(term));
  const windows: { position: number; text: string; score: number }[] = [];
  for (let position = 0; position < body.length; position += 900) {
    const text = body.slice(position, position + 1_200);
    const lower = text.toLowerCase();
    windows.push({ position, text, score: terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0) });
  }
  const chosen: typeof windows = [];
  for (const window of windows.sort((a,b) => b.score - a.score || a.position - b.position)) {
    if (chosen.some(item => Math.abs(item.position - window.position) < 1_200)) continue;
    chosen.push(window);
    if (chosen.length >= Math.floor(maximum / 1_250)) break;
  }
  return chosen.sort((a,b) => a.position - b.position).map(item => `[Excerpt at character ${item.position}]\n${item.text}`).join('\n\n');
}

async function sourceRecord(id: string, focus: string) {
  const source = tools.getSource(id) as any;
  if (!source) return null;
  const indexed = one<{ body: string }>("SELECT body FROM search_index WHERE canonical_id=? AND kind='source' AND field='content' LIMIT 1", id)?.body;
  const content = relevantPassages(indexed || await sourceContent(id, 1_000_000), focus, 4_000);
  return {
    id: source.source_id,
    kind: 'source',
    title: compact(source.title ?? source.source_label, 300),
    source_type: source.source_type,
    captured_at: source.captured_at ?? source.timestamp,
    content: compact(content, 5_000),
    events: Array.isArray(source.events)
      ? source.events.slice(0, 5).map((event: any) => ({
          id: event.id,
          summary: compact(event.summary, 500),
          significance: event.significance,
        }))
      : [],
  };
}

const templateContract: Record<StudioTemplate, string> = {
  speaking_prep:
    'Create a practical speaking brief using these exact sections: Thesis, Talking points, Evidence to cite, Likely questions and concise answers, Counterarguments, Closing takeaway. Make it easy to speak from, not essay-like.',
  x_post:
    'Create one publishable X post of no more than 280 characters, excluding evidence citations. It must sound like a real post, make one clear point, avoid headings and generic hashtags, and use only the strongest supporting evidence.',
  twitter_thread:
    'Create a publishable 5 to 7 post X thread. Number every post, keep each post within 280 characters excluding evidence citations, open with a strong factual hook, and end with a useful synthesis. Do not add generic hashtags or article-style headings.',
  linkedin_post:
    'Create a thoughtful LinkedIn post under 2,000 characters with a clear opening, evidence-led argument, practical implication, and concise closing. Avoid hype and generic hashtags.',
  month_in_review:
    'Create a month-in-review briefing. Begin with the exact date window, then separate What happened, Why it matters, Recurring themes, Risks, and What to watch next.',
  year_in_review:
    'Create a year-in-review briefing. Begin with the exact date window, then separate Major shifts, Durable patterns, Turning points, Risks, and Forward implications.',
};

const anyCitation = /\[(?:\d{4}-\d{2}-\d{2}-\d{4}|sha256:[a-f0-9]{64})\]/gi;

export function studioPublishableText(body: string) {
  return body
    .replace(anyCitation, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

export function studioFormatIssues(
  template: StudioTemplate,
  body: string,
  window: { dateFrom?: string | null; dateTo?: string | null } = {},
) {
  const clean = studioPublishableText(body);
  const issues: string[] = [];
  if (!clean) return ['The draft is empty after evidence markers are removed.'];

  if (template === 'x_post') {
    if (clean.length > 280) issues.push(`The X post is ${clean.length} characters and must be 280 or fewer.`);
    if (/^#{1,6}\s/m.test(body)) issues.push('The X post must not use an article heading.');
    if (clean.split(/\n\s*\n/).filter(Boolean).length > 2) issues.push('The X post must read as one concise post.');
  }

  if (template === 'twitter_thread') {
    const markers = [...clean.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+/g)];
    if (markers.length < 5 || markers.length > 7) issues.push('The X thread must contain 5 to 7 numbered posts.');
    markers.forEach((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[index + 1]?.index ?? clean.length;
      const post = clean.slice(start, end).trim();
      if (post.length > 280) issues.push(`Thread post ${marker[1]} is ${post.length} characters and must be 280 or fewer.`);
    });
  }

  if (template === 'linkedin_post' && clean.length > 2_000) {
    issues.push(`The LinkedIn post is ${clean.length} characters and must be 2,000 or fewer.`);
  }

  if (template === 'speaking_prep') {
    for (const heading of ['thesis', 'talking points', 'evidence to cite', 'likely questions', 'counterarguments', 'closing takeaway']) {
      if (!clean.toLowerCase().includes(heading)) issues.push(`The speaking brief is missing the ${heading} section.`);
    }
  }

  if (template === 'month_in_review' || template === 'year_in_review') {
    if (window.dateFrom && !clean.includes(window.dateFrom)) issues.push('The review must show its start date.');
    if (window.dateTo && !clean.includes(window.dateTo)) issues.push('The review must show its end date.');
  }
  return issues;
}

export async function buildStudioContext(value: StudioDraftInput) {
  const input = validateStudioInput(value);
  const hits = input.sourceIds.length
    ? input.sourceIds.map((id) => ({ kind: 'source', canonical_id: id }))
    : tools.search(input.focus, 16).results as any[];
  const records: any[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const key = `${hit.kind}:${hit.canonical_id}`;
    if (seen.has(key)) continue;
    const record = hit.kind === 'event'
      ? eventRecord(hit.canonical_id)
      : hit.kind === 'source'
        ? await sourceRecord(hit.canonical_id, input.focus)
        : null;
    if (!record) continue;
    seen.add(key);
    records.push(record);
    if (records.length >= 14) break;
  }

  const periodEvents = input.sourceIds.length ? [] : tools.findEvents({
    from: input.dateFrom ?? undefined,
    to: input.dateTo ?? undefined,
    sort: 'significance',
    limit: 16,
  }).events as any[];
  for (const event of periodEvents) {
    const key = `event:${event.id}`;
    if (seen.has(key)) continue;
    const record = eventRecord(event.id);
    if (!record) continue;
    seen.add(key);
    records.push(record);
    if (records.length >= 18) break;
  }

  if (!records.length) {
    throw new StudioInputError(
      'evidence_unavailable',
      'No supporting records were found for this draft. Try a more specific focus.',
      422,
    );
  }

  const period = input.dateFrom || input.dateTo
    ? `${input.dateFrom ?? 'earliest available'} to ${input.dateTo ?? 'latest available'}`
    : 'all available dates';
  const evidence: string[] = [];
  let evidenceLength = 0;
  for (const record of records) {
    const serialized = JSON.stringify(record);
    if (evidenceLength + serialized.length > 28_000) continue;
    evidence.push(serialized);
    evidenceLength += serialized.length;
  }

  const prompt = [
    input.writingLens === 'creator_reference'
      ? '/creator-reference /humanized-content'
      : '/crypto-intelligence /humanized-content',
    `DRAFT FORMAT\n${input.template}`,
    `FOCUS\n${input.focus}`,
    `DATE WINDOW\n${period}`,
    `WRITING LENS\n${input.writingLens === 'creator_reference' ? 'Creator Reference' : 'Mark'}`,
    `SOURCE SELECTION\n${input.sourceIds.length ? input.sourceIds.join('\n') : 'Automatically selected from the corpus'}`,
    `OUTPUT CONTRACT\n${templateContract[input.template]}`,
    input.writingLens === 'creator_reference'
      ? 'CREATOR REFERENCE CONTRACT\nUse the shared Creator Reference corpus only for tone, phrasing, argument structure, and supported opinion patterns. Keep all factual claims grounded in the supplied crypto evidence. Search and read the unified OpenViking memory for the Creator Reference profile and sources before deciding they are unavailable. If no usable Creator Reference material exists after that native retrieval, return exactly CREATOR_REFERENCE_UNAVAILABLE.'
      : 'VOICE CONTRACT\nWrite for Mark without applying the Creator Reference lens.',
    'QUALITY CONTRACT\nLead with the point, use plain language, and remove filler. Make every paragraph do one job. Do not invent certainty, predictions, or quotations. Match the requested platform instead of writing an article in every format. Use the writing lens only for expression and structure.',
    'CITATION CONTRACT\nEvery factual claim must cite one or more supplied records using the exact canonical ID in square brackets. Event citations look like [2026-04-01-0001]. Source citations look like [sha256: followed by 64 hexadecimal characters]. Do not cite any ID that is not present below. Preserve citation IDs through the final writing pass. Return only the finished draft.',
    `CORPUS EVIDENCE\n${evidence.join('\n')}`,
  ].join('\n\n').slice(0, 36_000);

  return { ...input, prompt, evidenceCount: evidence.length, evidenceRecords: records };
}

export function extractCitationIds(body: string) {
  const ids = new Set<string>();
  for (const match of body.matchAll(eventCitation)) ids.add(match[1]);
  for (const match of body.matchAll(sourceCitation)) ids.add(match[1].toLowerCase());
  return [...ids];
}

export function resolveStudioCitations(body: string): StudioCitation[] {
  const citations: StudioCitation[] = [];
  for (const id of extractCitationIds(body)) {
    if (id.startsWith('sha256:')) {
      const source = one<any>('SELECT source_id, title, source_label FROM sources WHERE source_id = ?', id);
      if (source) citations.push({ id, kind: 'source', title: compact(source.title ?? source.source_label, 180) });
      continue;
    }
    const event = one<any>('SELECT id, summary FROM events WHERE id = ?', id);
    if (event) citations.push({ id, kind: 'event', title: compact(event.summary, 180) });
  }
  return citations;
}

export function validateStudioCitations(body: string) {
  const ids = extractCitationIds(body);
  if (!ids.length) {
    throw new StudioInputError(
      'citations_missing',
      'Hermes returned a draft without verifiable evidence, so it was not saved.',
      503,
    );
  }
  const citations = resolveStudioCitations(body);
  const resolved = new Set(citations.map((citation) => citation.id));
  const invalid = ids.filter((id) => !resolved.has(id));
  if (invalid.length) {
    throw new StudioInputError(
      'citations_invalid',
      'Hermes returned a draft with an unverified citation, so it was not saved.',
      503,
    );
  }
  return citations;
}

export function studioConfigured() {
  return Boolean(process.env.HERMES_BASE_URL);
}

export async function createStudioDraft(value: StudioDraftInput, actor: string) {
  if (!studioConfigured()) {
    throw new StudioInputError(
      'intelligence_plane_not_connected',
      'Draft generation is unavailable because the intelligence plane is not connected.',
      503,
    );
  }
  const context = await buildStudioContext(value);
  const generate = (prompt: string) => runHermesAgent(prompt, {
    title: context.writingLens === 'creator_reference'
      ? 'Creator reference Studio draft'
      : 'Crypto intelligence Studio draft',
    reasoningEffort: 'low',
    timeoutMs: 180_000,
  });
  let body = (await generate(context.prompt)).text.trim();
  if (context.writingLens === 'creator_reference' && body.includes('CREATOR_REFERENCE_UNAVAILABLE')) {
    body = (await generate(`${context.prompt}\n\nRETRY REQUIREMENT\nThe shared Creator Reference material is known to exist. Use native OpenViking search and read now, then produce the requested cited draft.`)).text.trim();
  }
  if (body.includes('CREATOR_REFERENCE_UNAVAILABLE')) {
    throw new StudioInputError(
      'creator_reference_unavailable',
      'Add source material to the Creator Reference context before using this writing lens.',
      422,
    );
  }
  if (!body || body.length > 40_000) {
    throw new StudioInputError('invalid_generation', 'Hermes returned an invalid draft, so it was not saved.', 503);
  }
  let formatIssues = studioFormatIssues(context.template, body, context);
  let citationIssue = '';
  try {
    validateStudioCitations(body);
  } catch (error) {
    citationIssue = error instanceof Error ? error.message : 'The draft does not contain verifiable citations.';
  }
  if (formatIssues.length || citationIssue) {
    const requirements = [...formatIssues, citationIssue].filter(Boolean).map((issue) => `- ${issue}`).join('\n');
    body = (await generate([
      context.prompt,
      'REVISION REQUIREMENT',
      'Rewrite the draft once so it passes every requirement below. Keep only verified claims and preserve valid evidence IDs. Return only the corrected draft.',
      requirements,
      `PRIOR DRAFT\n${body}`,
    ].join('\n\n').slice(0, 40_000))).text.trim();
    formatIssues = studioFormatIssues(context.template, body, context);
  }
  if (!body || body.length > 40_000 || formatIssues.length) {
    throw new StudioInputError(
      'format_validation_failed',
      `Hermes could not produce a publishable ${context.template.replaceAll('_', ' ')} draft, so it was not saved.`,
      503,
    );
  }
  const citations = validateStudioCitations(body);
  const id = `draft_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO content_drafts
       (id, template_type, date_from, date_to, focus, raw_output, edited_output, created_at, updated_at, origin)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'ingested')`,
    ).run(id, context.template, context.dateFrom, context.dateTo, context.focus, body, createdAt, createdAt);
    db.prepare(
      'INSERT INTO draft_revisions (draft_id, revision, body, author, created_at) VALUES (?, 0, ?, ?, ?)',
    ).run(id, body, 'Hermes', createdAt);
    db.prepare(
      'INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)',
    ).run(`draft_lens:${id}`, context.writingLens);
    audit(actor, 'draft.generate', id, {
      template: context.template,
      writing_lens: context.writingLens,
      evidence_count: context.evidenceCount,
      citation_count: citations.length,
      source_count: context.sourceIds.length,
    });
  })();
  return { id, body, citations, revision: 0, writing_lens: context.writingLens };
}

export function appendStudioRevision(id: string, bodyValue: unknown, actor: string) {
  const body = String(bodyValue ?? '').trim();
  if (!body || body.length > 40_000) {
    throw new StudioInputError('invalid_draft', 'Draft text must be between 1 and 40,000 characters.');
  }
  const draft = one<{ origin: 'migrated' | 'ingested' }>('SELECT origin FROM content_drafts WHERE id = ?', id);
  if (!draft) {
    throw new StudioInputError('not_found', 'Draft not found.', 404);
  }
  const citations = draft.origin === 'ingested'
    ? validateStudioCitations(body)
    : resolveStudioCitations(body);
  const createdAt = new Date().toISOString();
  const revision = db.transaction(() => {
    const next = one<{ revision: number }>(
      'SELECT COALESCE(MAX(revision), -1) + 1 AS revision FROM draft_revisions WHERE draft_id = ?',
      id,
    )!.revision;
    db.prepare("DELETE FROM search_index WHERE canonical_id = ? AND kind = 'draft'").run(id);
    db.prepare(
      'INSERT INTO draft_revisions (draft_id, revision, body, author, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, next, body, actor, createdAt);
    db.prepare('UPDATE content_drafts SET edited_output = ?, updated_at = ? WHERE id = ?').run(body, createdAt, id);
    audit(actor, 'draft.revision.append', id, { revision: next, citation_count: citations.length });
    return next;
  })();
  return { id, revision, updated_at: createdAt, citations };
}

export function studioStatus() {
  return {
    connected: studioConfigured(),
    templates: [...STUDIO_TEMPLATES],
    writing_lenses: [...STUDIO_WRITING_LENSES],
  };
}

export function draftCitations(id: string) {
  const draft = one<any>('SELECT COALESCE(edited_output, raw_output) AS body FROM content_drafts WHERE id = ?', id);
  return draft?.body ? resolveStudioCitations(draft.body) : [];
}
