import { randomUUID } from 'node:crypto';
import { audit, db, one } from './db.js';
import { runHermesAgent } from './hermes-client.js';
import {
  StudioInputError,
  appendStudioRevision,
  buildStudioContext,
  type StudioTemplate,
  type StudioWritingLens,
} from './studio.js';

export const CREATOR_TONES = ['contrarian', 'analytical', 'wry', 'earnest', 'punchy'] as const;
export const CREATOR_LENGTHS = ['short', 'medium', 'long'] as const;
export const CREATOR_FORMATS = ['tweet', 'blog'] as const;
export const CREATOR_NAMES = ['Haseeb', 'Tarun'] as const;

type CreatorTone = (typeof CREATOR_TONES)[number];
type CreatorLength = (typeof CREATOR_LENGTHS)[number];
type CreatorFormat = (typeof CREATOR_FORMATS)[number];
type CreatorName = (typeof CREATOR_NAMES)[number];

type EvidenceRecord = Record<string, unknown> & { id: string; kind: 'event' | 'source' };

export interface EvidenceCard {
  id: string;
  kind: 'event' | 'source';
  title: string;
  who: string;
  when: string;
  source_type: string;
  url: string;
}

export interface WorkflowCitation {
  id: string;
  quote: string | null;
  inference: string;
  speaker?: string;
  locator?: string;
  when?: string;
}

export interface PrepPoint {
  title: string;
  body: string;
  detail: string[];
  counter: string;
  citations: WorkflowCitation[];
  sources: string[];
  quotes: Array<{
    quote: string;
    speaker: string;
    locator: string;
    when: string;
    read: string;
  }>;
  window: string;
  tag: string | null;
}

export interface PrepBrief {
  id: string;
  revision: number;
  overview: string;
  suggested_tangents: string[];
  points: PrepPoint[];
  sources: EvidenceCard[];
}

export interface CreatorOutput {
  text: string;
  angle: string;
  citations: Array<WorkflowCitation & { source: EvidenceCard }>;
}

export interface CreatorDraft {
  id: string;
  revision: number;
  creator: CreatorName;
  format: CreatorFormat;
  outputs: CreatorOutput[];
}

export interface PrepInput {
  topic?: unknown;
  lens?: unknown;
  tangents?: unknown;
}

export interface CreatorInput {
  creator?: unknown;
  format?: unknown;
  count?: unknown;
  tone?: unknown;
  custom_tone?: unknown;
  length?: unknown;
  prompt?: unknown;
  feedback?: unknown;
  prior_output?: unknown;
  draft_id?: unknown;
}

const trim = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);
const normalized = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const markdownToken = /(^|\n)\s*#{1,6}\s|\*\*|```/;

export function parseHermesJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new StudioInputError('invalid_generation', 'Hermes returned an unreadable result, so it was not saved.', 503);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    throw new StudioInputError('invalid_generation', 'Hermes returned malformed structured content, so it was not saved.', 503);
  }
}

function evidencePayload(records: EvidenceRecord[], maximum = 18_000) {
  const rows: string[] = [];
  let size = 0;
  for (const record of records) {
    const row = JSON.stringify(record);
    if (size + row.length > maximum) continue;
    rows.push(row);
    size += row.length;
  }
  return rows.join('\n');
}

function evidenceMap(records: EvidenceRecord[]) {
  return new Map(records.map((record) => [record.id, record]));
}

function sourceCard(id: string): EvidenceCard | null {
  if (id.startsWith('sha256:')) {
    const source = one<any>(
      `SELECT source_id AS id, COALESCE(NULLIF(title,''), NULLIF(source_label,''), 'Stored source') AS title,
              COALESCE(NULLIF(source_channel,''), NULLIF(source_label,''), 'Stored source') AS who,
              COALESCE(NULLIF(captured_at,''), NULLIF(timestamp,''), '') AS date_value,
              COALESCE(source_type, 'source') AS source_type, COALESCE(source_url, '') AS url
         FROM sources WHERE source_id = ?`,
      id,
    );
    return source ? { ...source, kind: 'source', when: source.date_value ?? '' } : null;
  }
  const event = one<any>(
    `SELECT e.id, COALESCE(NULLIF(e.summary,''), 'Stored event') AS title,
            COALESCE(NULLIF(s.source_channel,''), NULLIF(s.source_label,''), NULLIF(s.title,''), 'Stored source') AS who,
            COALESCE((SELECT MIN(d.sort_key) FROM event_dates d WHERE d.event_id = e.id), NULLIF(e.timestamp,''), '') AS date_value,
            COALESCE(s.source_type, 'source') AS source_type, COALESCE(s.source_url, '') AS url
       FROM events e JOIN sources s ON s.source_id=e.source_id WHERE e.id = ?`,
    id,
  );
  return event ? { ...event, kind: 'event', when: event.date_value ?? '' } : null;
}

function citationIssues(citations: unknown, records: Map<string, EvidenceRecord>, label: string) {
  const issues: string[] = [];
  if (!Array.isArray(citations) || citations.length === 0) return [`${label} needs at least one supporting source.`];
  citations.forEach((item, index) => {
    const citation = item as Partial<WorkflowCitation>;
    const id = trim(citation?.id, 100);
    const record = records.get(id);
    if (!record) issues.push(`${label} citation ${index + 1} uses an unknown evidence ID.`);
    if (trim(citation?.inference, 500).length < 12) issues.push(`${label} citation ${index + 1} needs a plain-language inference.`);
    const quote = citation?.quote == null ? '' : trim(citation.quote, 300);
    if (quote && record && !normalized(JSON.stringify(record)).includes(normalized(quote))) {
      issues.push(`${label} citation ${index + 1} quote is not an exact excerpt from its source.`);
    }
  });
  return issues;
}

function cleanCitation(value: any): WorkflowCitation {
  return {
    id: trim(value?.id, 100),
    quote: value?.quote == null || !trim(value.quote, 300) ? null : trim(value.quote, 240),
    inference: trim(value?.inference, 500),
    speaker: trim(value?.speaker, 140),
    locator: trim(value?.locator, 100),
    when: trim(value?.when, 80),
  };
}

function saveWorkflowDraft(options: {
  template: StudioTemplate;
  focus: string;
  body: string;
  lens: StudioWritingLens;
  actor: string;
  evidenceCount: number;
  draftId?: string;
}) {
  if (options.draftId) {
    const revision = appendStudioRevision(options.draftId, options.body, options.actor);
    return { id: options.draftId, revision: revision.revision };
  }
  const id = `draft_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO content_drafts
       (id, template_type, date_from, date_to, focus, raw_output, edited_output, created_at, updated_at, origin)
       VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, 'ingested')`,
    ).run(id, options.template, options.focus, options.body, createdAt, createdAt);
    db.prepare(
      'INSERT INTO draft_revisions (draft_id, revision, body, author, created_at) VALUES (?, 0, ?, ?, ?)',
    ).run(id, options.body, 'Hermes', createdAt);
    db.prepare('INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)')
      .run(`draft_lens:${id}`, options.lens);
    audit(options.actor, 'draft.generate.structured', id, {
      template: options.template,
      writing_lens: options.lens,
      evidence_count: options.evidenceCount,
    });
  })();
  return { id, revision: 0 };
}

function prepInput(value: PrepInput) {
  const topic = trim(value?.topic, 500);
  if (topic.length < 3) throw new StudioInputError('invalid_focus', 'Enter a specific question or topic.');
  const lens = Number(value?.lens ?? 3);
  if (!Number.isInteger(lens) || lens < 1 || lens > 5) {
    throw new StudioInputError('invalid_lens', 'Lens must be between 1 and 5.');
  }
  const tangents = Array.isArray(value?.tangents)
    ? [...new Set(value.tangents.map((item) => trim(item, 80)).filter(Boolean))].slice(0, 6)
    : [];
  return { topic, lens, tangents, pointCount: lens + 2 };
}

type RawPrep = {
  overview?: unknown;
  suggested_tangents?: unknown;
  points?: unknown;
};

export function prepIssues(raw: RawPrep, records: EvidenceRecord[], pointCount: number) {
  const issues: string[] = [];
  const overview = trim(raw?.overview, 1_000);
  if (overview.length < 80 || overview.length > 800) issues.push('Overview must be a clear 2 to 4 sentence synthesis.');
  if (markdownToken.test(overview)) issues.push('Overview must be plain text without raw Markdown markers.');
  if (!Array.isArray(raw?.suggested_tangents) || raw.suggested_tangents.length < 2 || raw.suggested_tangents.length > 6) {
    issues.push('Return 2 to 6 useful tangential subjects.');
  }
  const points = Array.isArray(raw?.points) ? raw.points : [];
  if (points.length !== pointCount) issues.push(`Return exactly ${pointCount} supporting points for this lens.`);
  const recordsById = evidenceMap(records);
  points.forEach((item: any, index) => {
    const label = `Point ${index + 1}`;
    if (trim(item?.title, 180).length < 5) issues.push(`${label} needs a useful title.`);
    const body = trim(item?.body, 900);
    if (body.length < 50 || body.length > 700) issues.push(`${label} needs a concise, readable explanation.`);
    if (markdownToken.test(body)) issues.push(`${label} must not contain raw Markdown markers.`);
    if (!Array.isArray(item?.detail) || item.detail.length < 1 || item.detail.length > 3) issues.push(`${label} needs 1 to 3 detail paragraphs.`);
    if (trim(item?.counter, 600).length < 20) issues.push(`${label} needs a concrete weakness or counterargument.`);
    issues.push(...citationIssues(item?.citations, recordsById, label));
  });
  return issues;
}

function prepBody(overview: string, points: PrepPoint[]) {
  return [
    '## Overview',
    overview,
    ...points.flatMap((point) => [
      `## ${point.title}`,
      point.body,
      ...point.detail,
      `Where it is weak: ${point.counter}`,
      `Evidence: ${point.sources.map((id) => `[${id}]`).join(' ')}`,
    ]),
  ].join('\n\n');
}

export async function generatePrepBrief(value: PrepInput, actor: string): Promise<PrepBrief> {
  const input = prepInput(value);
  const focus = [input.topic, input.tangents.length ? `Tangential subjects: ${input.tangents.join(', ')}` : ''].filter(Boolean).join('. ');
  const context = await buildStudioContext({
    template_type: 'speaking_prep',
    focus,
    writing_lens: 'mark',
    source_ids: [],
  });
  const records = context.evidenceRecords as EvidenceRecord[];
  const prompt = [
    '/crypto-intelligence /humanized-content',
    'Build a speaking preparation brief for Mark from the supplied corpus evidence only.',
    `Question or topic: ${input.topic}`,
    `Lens: ${input.lens} of 5. Return exactly ${input.pointCount} supporting points.`,
    input.tangents.length ? `Include these selected tangents only when evidence supports them: ${input.tangents.join(', ')}.` : '',
    'Writing rules: lead with the answer, use plain language, explain the mechanism, keep every paragraph focused, and make the result easy to speak from. Do not dump disconnected statistics. Do not invent facts, quotations, consensus, or certainty.',
    'Evidence rules: every point must cite at least one exact ID below. A quote is optional, but if used it must be an exact substring of that evidence record. Each citation needs one plain sentence explaining how the source supports the point.',
    `Return only valid JSON with this shape: {"overview":"2 to 4 sentence synthesis","suggested_tangents":["subject"],"points":[{"title":"clear claim","body":"short explanation","detail":["deeper paragraph"],"counter":"where the point is weak or uncertain","tag":null,"citations":[{"id":"exact evidence ID","quote":null,"speaker":"source speaker if known","locator":"timestamp or section if known","when":"source date if known","inference":"how this evidence supports the point"}]}]}. Do not wrap JSON in Markdown.`,
    `CORPUS EVIDENCE\n${evidencePayload(records)}`,
  ].filter(Boolean).join('\n\n');

  const generate = (text: string) => runHermesAgent(text, {
    title: 'Structured speaking preparation',
    reasoningEffort: 'low',
    timeoutMs: 180_000,
  });
  let rawText = (await generate(prompt.slice(0, 32_000))).text;
  let raw = parseHermesJson<RawPrep>(rawText);
  let issues = prepIssues(raw, records, input.pointCount);
  if (issues.length) {
    rawText = (await generate([
      prompt,
      'Correct the previous JSON once. Keep valid content, fix every issue below, and return only the corrected JSON.',
      issues.map((issue) => `* ${issue}`).join('\n'),
      `PREVIOUS JSON\n${rawText}`,
    ].join('\n\n').slice(0, 38_000))).text;
    raw = parseHermesJson<RawPrep>(rawText);
    issues = prepIssues(raw, records, input.pointCount);
  }
  if (issues.length) {
    throw new StudioInputError('format_validation_failed', 'Hermes could not produce a clear, fully sourced preparation brief, so it was not saved.', 503);
  }

  const points: PrepPoint[] = (raw.points as any[]).map((item) => {
    const citations: WorkflowCitation[] = item.citations.map(cleanCitation);
    const cards = new Map<string, EvidenceCard | null>(citations.map((citation) => [citation.id, sourceCard(citation.id)]));
    const dated = citations.map((citation) => citation.when || cards.get(citation.id)?.when || '').filter(Boolean);
    return {
      title: trim(item.title, 180),
      body: trim(item.body, 700),
      detail: item.detail.map((paragraph: unknown) => trim(paragraph, 1_000)).filter(Boolean).slice(0, 3),
      counter: trim(item.counter, 600),
      citations,
      sources: [...new Set<string>(citations.map((citation) => citation.id))],
      quotes: citations.filter((citation) => citation.quote).map((citation) => ({
        quote: citation.quote as string,
        speaker: citation.speaker || cards.get(citation.id)?.who || 'Stored source',
        locator: citation.locator || '',
        when: citation.when || cards.get(citation.id)?.when || 'Date retained in source',
        read: citation.inference,
      })),
      window: dated.length ? dated.join(' to ') : 'Stored corpus',
      tag: item.tag == null ? null : trim(item.tag, 80),
    };
  });
  const overview = trim(raw.overview, 800);
  const usedIds = [...new Set(points.flatMap((point) => point.sources))];
  const sources = usedIds.map(sourceCard).filter((card): card is EvidenceCard => Boolean(card));
  const saved = saveWorkflowDraft({
    template: 'speaking_prep',
    focus,
    body: prepBody(overview, points),
    lens: 'mark',
    actor,
    evidenceCount: records.length,
  });
  return {
    ...saved,
    overview,
    suggested_tangents: (raw.suggested_tangents as unknown[]).map((item) => trim(item, 80)).filter(Boolean).slice(0, 6),
    points,
    sources,
  };
}

function creatorInput(value: CreatorInput) {
  const creator = trim(value?.creator, 20) as CreatorName;
  const format = trim(value?.format, 20) as CreatorFormat;
  const tone = trim(value?.tone, 30) as CreatorTone;
  const length = trim(value?.length, 20) as CreatorLength;
  const prompt = trim(value?.prompt, 500);
  if (!CREATOR_NAMES.includes(creator)) throw new StudioInputError('invalid_creator', 'Choose Haseeb or Tarun.');
  if (!CREATOR_FORMATS.includes(format)) throw new StudioInputError('invalid_format', 'Choose tweet or blog post.');
  if (!CREATOR_TONES.includes(tone)) throw new StudioInputError('invalid_tone', 'Choose an available tone.');
  if (!CREATOR_LENGTHS.includes(length)) throw new StudioInputError('invalid_length', 'Choose an available length.');
  if (prompt.length < 3) throw new StudioInputError('invalid_focus', 'Enter a specific subject.');
  const count = format === 'blog' ? 1 : Number(value?.count ?? 3);
  if (![1, 3, 5].includes(count)) throw new StudioInputError('invalid_count', 'Choose 1, 3, or 5 tweets.');
  const customTone = trim(value?.custom_tone, 600);
  const feedback = trim(value?.feedback, 1_200);
  const priorOutput = Array.isArray(value?.prior_output)
    ? value.prior_output.map((item) => trim(item, 12_000)).filter(Boolean).slice(0, 5)
    : [];
  const draftId = trim(value?.draft_id, 100);
  if (feedback && priorOutput.length === 0) throw new StudioInputError('revision_missing', 'A revision needs the previous draft.');
  if (draftId && !one('SELECT id FROM content_drafts WHERE id = ?', draftId)) {
    throw new StudioInputError('not_found', 'The previous draft could not be found.', 404);
  }
  return { creator, format, tone, length, prompt, count, customTone, feedback, priorOutput, draftId };
}

type RawCreator = { outputs?: unknown };

const creatorLengthRule = (format: CreatorFormat, length: CreatorLength) => {
  if (format === 'tweet') return {
    short: 'Each tweet must be 40 to 120 characters.',
    medium: 'Each tweet must be 140 to 220 characters.',
    long: 'Each tweet must be 230 to 280 characters.',
  }[length];
  return {
    short: 'The blog must be 250 to 350 words.',
    medium: 'The blog must be 600 to 800 words.',
    long: 'The blog must be 1200 to 1600 words.',
  }[length];
};

export function creatorIssues(raw: RawCreator, records: EvidenceRecord[], options: { format: CreatorFormat; length: CreatorLength; count: number }) {
  const issues: string[] = [];
  const outputs = Array.isArray(raw?.outputs) ? raw.outputs : [];
  if (outputs.length !== options.count) issues.push(`Return exactly ${options.count} output${options.count === 1 ? '' : 's'}.`);
  const recordsById = evidenceMap(records);
  outputs.forEach((item: any, index) => {
    const text = trim(item?.text, 20_000);
    const label = `Output ${index + 1}`;
    if (trim(item?.angle, 120).length < 2) issues.push(`${label} needs a short angle label.`);
    if (options.format === 'tweet') {
      const limits = options.length === 'short' ? [40, 120] : options.length === 'medium' ? [140, 220] : [230, 280];
      if (text.length < limits[0] || text.length > limits[1]) issues.push(`${label} must be ${limits[0]} to ${limits[1]} characters.`);
      if (markdownToken.test(text) || /(^|\n)\s*[-*]\s/.test(text)) issues.push(`${label} must read as a real tweet, not an article or list.`);
      if (/#[\p{L}\p{N}_]+/u.test(text)) issues.push(`${label} must not use generic hashtags.`);
      if (/\p{Extended_Pictographic}/u.test(text)) issues.push(`${label} must not use emoji.`);
    } else {
      const words = text.split(/\s+/).filter(Boolean).length;
      const limits = options.length === 'short' ? [250, 350] : options.length === 'medium' ? [600, 800] : [1_200, 1_600];
      if (words < limits[0] || words > limits[1]) issues.push(`${label} must be ${limits[0]} to ${limits[1]} words.`);
      if (/^#\s/m.test(text)) issues.push(`${label} must keep the title separate from the article body.`);
    }
    if (records.some((record) => text.includes(record.id))) {
      issues.push(`${label} must keep internal evidence IDs out of the publishable copy.`);
    }
    issues.push(...citationIssues(item?.citations, recordsById, label));
  });
  return issues;
}

function creatorBody(outputs: CreatorOutput[]) {
  return outputs.flatMap((output) => [
    `## ${output.angle}`,
    output.text,
    `Evidence: ${output.citations.map((citation) => `[${citation.id}]`).join(' ')}`,
  ]).join('\n\n');
}

export async function generateCreatorDraft(value: CreatorInput, actor: string): Promise<CreatorDraft> {
  const input = creatorInput(value);
  const context = await buildStudioContext({
    template_type: input.format === 'tweet' ? 'x_post' : 'linkedin_post',
    focus: input.prompt,
    writing_lens: 'creator_reference',
    source_ids: [],
  });
  const creatorFullName = input.creator === 'Haseeb' ? 'Haseeb Qureshi' : 'Tarun Chitra';
  const creatorContext = await buildStudioContext({
    template_type: input.format === 'tweet' ? 'x_post' : 'linkedin_post',
    focus: `${creatorFullName} views opinions language argument structure`,
    writing_lens: 'creator_reference',
    source_ids: [],
  });
  const creatorNeedle = normalized(creatorFullName);
  const creatorFirstName = normalized(input.creator);
  const creatorRecords = (creatorContext.evidenceRecords as EvidenceRecord[])
    .filter((record) => {
      const serialized = normalized(JSON.stringify(record));
      return serialized.includes(creatorNeedle) || serialized.includes(creatorFirstName);
    })
    .map((record) => ({ ...record, context_role: 'creator_reference' }));
  if (!creatorRecords.length) {
    throw new StudioInputError('creator_reference_unavailable', `${input.creator} source material is not available in Creator Reference memory yet.`, 422);
  }
  const records = [
    ...(context.evidenceRecords as EvidenceRecord[]).map((record) => ({ ...record, context_role: 'topic_evidence' })),
    ...creatorRecords,
  ].filter((record, index, allRecords) => allRecords.findIndex((candidate) => candidate.id === record.id) === index).slice(0, 18);
  const voiceRules = input.creator === 'Haseeb'
    ? 'Use Haseeb Qureshi material from the Creator Reference memory. Be direct, analytical, mechanism-first, and willing to correct a lazy consensus view. Do not imitate private or unsupported personal details.'
    : 'Use Tarun Chitra material from the Creator Reference memory. Be calm, first-principles, and precise about incentives, power, legitimacy, and who captures value. Do not imitate private or unsupported personal details.';
  const toneRules: Record<CreatorTone, string> = {
    contrarian: 'Open by correcting the lazy consensus view.',
    analytical: 'Name the mechanism and explain who captures value.',
    wry: 'Use one understated dry observation, never a joke for its own sake.',
    earnest: 'State the real belief plainly with no posturing.',
    punchy: 'Compress to one clear idea and stop.',
  };
  const prompt = [
    '/creator-reference /humanized-content',
    `Create ${input.count} ${input.format === 'tweet' ? 'tweet' : 'blog post'} output${input.count === 1 ? '' : 's'} about: ${input.prompt}`,
    `Creator: ${input.creator}. Use the records marked creator_reference below and search the unified Creator Reference memory before writing. The supplied creator records are valid reference material, so do not claim the creator is unavailable.`,
    voiceRules,
    `Tone: ${input.tone}. ${toneRules[input.tone]}`,
    input.customTone ? `Additional tone instruction that overrides the preset when they conflict: ${input.customTone}` : '',
    `Length: ${input.length}. ${creatorLengthRule(input.format, input.length)}`,
    input.feedback ? `Revision feedback: ${input.feedback}` : '',
    input.priorOutput.length ? `Revise these prior drafts while keeping everything the feedback did not criticize intact:\n${input.priorOutput.map((text, index) => `PRIOR ${index + 1}\n${text}`).join('\n\n')}` : '',
    'Writing rules: make this feel like content a real person would publish. No emoji, no hashtags, no generic call to action, no LinkedIn filler, and no invented quotations or positions. Keep facts grounded in the supplied Crypto evidence. Creator memory controls voice and supported framing, not factual invention. Never broaden a source claim into a related but unsupported claim.',
    'Evidence rules: each output must cite at least one exact ID from the evidence below. Every citation needs a plain-language inference. A quote is optional, but if included it must be an exact substring from that evidence record. Put evidence IDs only in the citations array. Never place an evidence ID, citation marker, or Works cited line inside publishable text.',
    'Return only valid JSON with this shape: {"outputs":[{"text":"finished content","angle":"short angle name","citations":[{"id":"exact evidence ID","quote":null,"inference":"what this evidence contributed"}]}]}. Blog bodies may use Markdown subheadings beginning with ##, but the title stays in angle. Do not wrap the JSON in Markdown.',
    `CORPUS EVIDENCE\n${evidencePayload(records)}`,
  ].filter(Boolean).join('\n\n');

  const generate = (text: string) => runHermesAgent(text, {
    title: `${input.creator} creator draft`,
    reasoningEffort: 'low',
    timeoutMs: 180_000,
  });
  let rawText = (await generate(prompt.slice(0, 34_000))).text;
  if (rawText.includes('CREATOR_REFERENCE_UNAVAILABLE')) {
    throw new StudioInputError('creator_reference_unavailable', `${input.creator} source material is not available in Creator Reference memory yet.`, 422);
  }
  let raw = parseHermesJson<RawCreator>(rawText);
  let issues = creatorIssues(raw, records, input);
  if (issues.length) {
    rawText = (await generate([
      prompt,
      'Correct the previous JSON once. Keep valid content and everything not criticized, fix every issue below, and return only corrected JSON.',
      issues.map((issue) => `* ${issue}`).join('\n'),
      `PREVIOUS JSON\n${rawText}`,
    ].join('\n\n').slice(0, 40_000))).text;
    raw = parseHermesJson<RawCreator>(rawText);
    issues = creatorIssues(raw, records, input);
  }
  if (issues.length) {
    throw new StudioInputError('format_validation_failed', 'Hermes could not produce publishable, fully sourced content in the requested format, so it was not saved.', 503);
  }

  const outputs: CreatorOutput[] = (raw.outputs as any[]).map((item) => ({
    text: trim(item.text, 20_000),
    angle: trim(item.angle, 120),
    citations: item.citations.map(cleanCitation).map((citation: WorkflowCitation) => ({
      ...citation,
      source: sourceCard(citation.id) as EvidenceCard,
    })),
  }));
  const saved = saveWorkflowDraft({
    template: input.format === 'tweet' ? 'x_post' : 'linkedin_post',
    focus: input.prompt,
    body: creatorBody(outputs),
    lens: 'creator_reference',
    actor,
    evidenceCount: records.length,
    draftId: input.draftId || undefined,
  });
  return { ...saved, creator: input.creator, format: input.format, outputs };
}
