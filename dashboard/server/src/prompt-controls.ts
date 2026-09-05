import { createHash } from 'node:crypto';
import { all, audit, db, one } from './db.js';
import { runHermesAgent } from './hermes-client.js';

export const PROMPT_PAGE_IDS = ['topics', 'prep', 'haseeb', 'tarun'] as const;
export type PromptPageId = (typeof PROMPT_PAGE_IDS)[number];

type PromptDefinition = {
  id: string;
  label: string;
  purpose: string;
  mode: 'generated' | 'evidence';
  instructions: string;
  application: string;
};

const DEFINITIONS: PromptDefinition[] = [
  {
    id: 'topics',
    label: 'Topics',
    purpose: 'Controls how stored evidence is organized into browsable research topics.',
    mode: 'generated',
    application: 'Save the instruction, then rebuild Topics when you want the new organization to appear.',
    instructions: 'Organize the corpus into specific themes, claims, mechanisms, disagreements, and arguments. Prefer titles that state a position or causal mechanism. Do not use a person, company, protocol, asset, or broad category as a topic unless the retained evidence supports a distinct recurring argument around it. Each topic must unite at least two source-backed claims.',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    purpose: 'Shows dated evidence and source-backed event dossiers without model generation.',
    mode: 'evidence',
    application: 'This view is evidence-only, so there is no prompt to edit.',
    instructions: 'Preserve the stored date, what happened, why it matters, the context in which a source mentioned it, and the original supporting source. Keep uncertainty and date precision visible. Never invent reactions, chronology, or significance.',
  },
  {
    id: 'prep',
    label: 'Prep',
    purpose: 'Controls how Hermes turns selected evidence into a speaking preparation brief.',
    mode: 'generated',
    application: 'Saved changes apply to the next brief Mark generates.',
    instructions: 'Lead with a concise answer to the exact question. Build a speakable thesis, explain the mechanism, and support it with distinct points rather than disconnected statistics. Include useful counterarguments and uncertainty. Keep every claim narrow enough to trace to the cited evidence.',
  },
  {
    id: 'haseeb',
    label: 'Haseeb bot',
    purpose: 'Controls the editorial lens used with Haseeb creator reference material.',
    mode: 'generated',
    application: 'Saved changes apply to the next Haseeb draft or revision.',
    instructions: 'Write with a direct, analytical, mechanism-first lens. Correct lazy consensus when the evidence supports it. Make each output feel native to its selected format and stop when the argument is complete. Use creator reference material for supported expression and framing, never for invented opinions or personal details.',
  },
  {
    id: 'tarun',
    label: 'Tarun bot',
    purpose: 'Controls the editorial lens used with Tarun creator reference material.',
    mode: 'generated',
    application: 'Saved changes apply to the next Tarun draft or revision.',
    instructions: 'Write with a calm, first-principles lens. Make incentives, power, legitimacy, constraints, and value capture explicit. Make each output feel native to its selected format and stop when the argument is complete. Use creator reference material for supported expression and framing, never for invented opinions or personal details.',
  },
];

const EDITABLE = new Set<string>(PROMPT_PAGE_IDS);
const MIN_LENGTH = 80;
const MAX_LENGTH = 4_000;

type SettingRow = {
  page_id: string;
  instructions: string;
  revision: number;
  updated_at: string;
  updated_by: string;
};

export class PromptControlError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function definition(pageId: string) {
  const item = DEFINITIONS.find((candidate) => candidate.id === pageId);
  if (!item) throw new PromptControlError('unknown_page', 'That page does not have a prompt control.', 404);
  return item;
}

function setting(pageId: string) {
  return one<SettingRow>('SELECT * FROM prompt_settings WHERE page_id = ?', pageId);
}

function publicControl(item: PromptDefinition) {
  const saved = item.mode === 'generated' ? setting(item.id) : undefined;
  return {
    id: item.id,
    label: item.label,
    purpose: item.purpose,
    mode: item.mode,
    application: item.application,
    instructions: saved?.instructions ?? item.instructions,
    default_instructions: item.instructions,
    customized: Boolean(saved && saved.instructions !== item.instructions),
    revision: saved?.revision ?? 0,
    updated_at: saved?.updated_at ?? null,
    updated_by: saved?.updated_by ?? null,
  };
}

export function listPromptControls() {
  return DEFINITIONS.map(publicControl);
}

export function getPromptControl(pageId: string) {
  return publicControl(definition(pageId));
}

export function getPageInstructions(pageId: PromptPageId) {
  return getPromptControl(pageId).instructions;
}

export function promptHistory(pageId: string, limit = 30) {
  const item = definition(pageId);
  if (item.mode !== 'generated') return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  return all(
    `SELECT page_id, revision, instructions, actor, action, created_at
       FROM prompt_revisions WHERE page_id = ? ORDER BY revision DESC LIMIT ?`,
    pageId,
    safeLimit,
  );
}

function cleanInstructions(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function validateInstructions(pageId: string, value: unknown) {
  const item = definition(pageId);
  if (item.mode !== 'generated' || !EDITABLE.has(pageId)) {
    throw new PromptControlError('evidence_only', 'This page is evidence-only and has no generation prompt to edit.', 409);
  }
  const instructions = cleanInstructions(value);
  if (instructions.length < MIN_LENGTH) {
    throw new PromptControlError('instructions_too_short', `Use at least ${MIN_LENGTH} characters so the instruction is specific enough.`);
  }
  if (instructions.length > MAX_LENGTH) {
    throw new PromptControlError('instructions_too_long', `Keep the instruction under ${MAX_LENGTH} characters.`);
  }
  return instructions;
}

function writePrompt(pageId: string, instructions: string, actor: string, action: 'save' | 'restore') {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const current = setting(pageId);
    const revision = (current?.revision ?? 0) + 1;
    db.prepare(
      `INSERT INTO prompt_settings (page_id, instructions, revision, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(page_id) DO UPDATE SET
         instructions=excluded.instructions,
         revision=excluded.revision,
         updated_at=excluded.updated_at,
         updated_by=excluded.updated_by`,
    ).run(pageId, instructions, revision, now, actor);
    db.prepare(
      `INSERT INTO prompt_revisions (page_id, revision, instructions, actor, action, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(pageId, revision, instructions, actor, action, now);
    audit(actor, `prompt.${action}`, pageId, { revision });
    return getPromptControl(pageId);
  })();
}

export function savePromptControl(pageId: string, value: unknown, actor: string) {
  return writePrompt(pageId, validateInstructions(pageId, value), actor, 'save');
}

export function restorePromptControl(pageId: string, actor: string) {
  const item = definition(pageId);
  if (item.mode !== 'generated' || !EDITABLE.has(pageId)) {
    throw new PromptControlError('evidence_only', 'This page is evidence-only and has no generation prompt to restore.', 409);
  }
  return writePrompt(pageId, item.instructions, actor, 'restore');
}

export type TopicOrganizationItem = {
  key: string;
  title: string;
  description: string;
  event_ids: string[];
  tags: string[];
};

export type TopicOrganization = {
  version: 1;
  generated_at: string;
  generated_by: string;
  prompt_revision: number;
  topics: TopicOrganizationItem[];
};

export function activeTopicOrganization(): TopicOrganization | null {
  const row = one<{ value: string }>("SELECT value FROM generation_meta WHERE key='topics.organization.v1'");
  if (!row?.value) return null;
  try {
    const value = JSON.parse(row.value) as TopicOrganization;
    return value?.version === 1 && Array.isArray(value.topics) ? value : null;
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new PromptControlError('invalid_topics', 'Hermes returned an unreadable topic organization.', 503);
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new PromptControlError('invalid_topics', 'Hermes returned malformed topic organization data.', 503);
  }
}

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const incompleteTitleEnding = /\b(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i;

function topicKey(title: string, index: number) {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 58);
  const suffix = createHash('sha256').update(`${index}:${title}`).digest('hex').slice(0, 6);
  return `${slug || 'topic'}-${suffix}`;
}

export function validateTopicOrganization(raw: any, validEventIds: Set<string>) {
  const rows = Array.isArray(raw?.topics) ? raw.topics : [];
  const issues: string[] = [];
  if (rows.length < 6 || rows.length > 24) issues.push('Return 6 to 24 focused topics.');
  const titles = new Set<string>();
  const topics = rows.map((row: any, index: number) => {
    const title = cleanText(row?.title);
    const description = cleanText(row?.description);
    const eventIds = Array.isArray(row?.event_ids)
      ? [...new Set<string>(row.event_ids.map((id: unknown) => cleanText(id).slice(0, 120)).filter(Boolean))]
      : [];
    if (title.length < 12) issues.push(`Topic ${index + 1} needs a specific title.`);
    if (title.length > 96) issues.push(`Topic ${index + 1} title must be 96 characters or fewer.`);
    if (title.split(/\s+/).filter(Boolean).length > 16) issues.push(`Topic ${index + 1} title must use 16 words or fewer.`);
    if (incompleteTitleEnding.test(title)) issues.push(`Topic ${index + 1} title ends with an incomplete phrase.`);
    if (/(?:\*\*|__|```|^#{1,6}\s)/.test(title)) issues.push(`Topic ${index + 1} title must be plain text.`);
    if (titles.has(title.toLowerCase())) issues.push(`Topic ${index + 1} duplicates another title.`);
    titles.add(title.toLowerCase());
    if (description.length < 40) issues.push(`Topic ${index + 1} needs a useful description.`);
    if (description.length > 420) issues.push(`Topic ${index + 1} description must be 420 characters or fewer.`);
    if (eventIds.length < 2 || eventIds.length > 12) issues.push(`Topic ${index + 1} must connect 2 to 12 evidence records.`);
    if (eventIds.some((id) => !validEventIds.has(id))) issues.push(`Topic ${index + 1} references unknown evidence.`);
    return { title, description, event_ids: eventIds };
  });
  if (issues.length) throw new PromptControlError('invalid_topics', `The new organization was not saved. ${issues.slice(0, 4).join(' ')}`, 503);
  return topics;
}

export async function rebuildTopics(actor: string) {
  const evidence = all<any>(
    `SELECT e.id, substr(COALESCE(e.summary,''),1,320) AS summary,
            e.primary_category, e.significance,
            COALESCE(NULLIF(s.source_label,''), NULLIF(s.source_channel,''), NULLIF(s.title,''), 'Stored source') AS source,
            COALESCE((SELECT min(d.sort_key) FROM event_dates d WHERE d.event_id=e.id), substr(e.timestamp,1,10), '') AS subject_date,
            substr(COALESCE((SELECT group_concat(i.text, ' | ') FROM event_insights i WHERE i.event_id=e.id),''),1,520) AS claims
       FROM events e JOIN sources s ON s.source_id=e.source_id
      ORDER BY e.significance DESC, subject_date DESC, e.id`,
  );
  if (evidence.length < 2) throw new PromptControlError('insufficient_evidence', 'At least two stored evidence records are required.', 409);
  const control = getPromptControl('topics');
  const evidenceText = evidence.map((row) => JSON.stringify(row)).join('\n').slice(0, 30_000);
  const prompt = [
    '/crypto-intelligence',
    'Reorganize Mark\'s stored corpus into precise research topics. Use only the evidence records below.',
    `MARK\'S TOPICS INSTRUCTION\n${control.instructions}`,
    'Each topic must express a concrete theme, claim, mechanism, disagreement, or argument. Avoid broad subject labels. Write each title as a complete grammatical phrase of 5 to 16 words and no more than 96 characters. Never cut a word or end a title with an incomplete phrase. Connect 2 to 12 exact event IDs to each topic. An event may support more than one topic when the evidence genuinely overlaps. Do not invent events, claims, consensus, dates, or sources.',
    'Return only valid JSON with this shape: {"topics":[{"title":"specific claim or theme","description":"one clear sentence describing the shared argument","event_ids":["exact event ID"]}]}. Return 6 to 24 topics. Do not wrap JSON in Markdown.',
    `STORED EVIDENCE\n${evidenceText}`,
  ].join('\n\n');
  const generate = (text: string) => runHermesAgent(text, {
    title: 'Topics organization',
    reasoningEffort: 'low',
    timeoutMs: 180_000,
  });
  let rawText = (await generate(prompt.slice(0, 36_000))).text;
  const validIds = new Set<string>(evidence.map((row) => row.id));
  let normalized;
  try {
    normalized = validateTopicOrganization(parseJsonObject(rawText), validIds);
  } catch (error) {
    if (!(error instanceof PromptControlError) || error.code !== 'invalid_topics') throw error;
    rawText = (await generate([
      '/crypto-intelligence',
      'Correct the previous topic organization once. Keep every valid grouping, fix every issue below, and return only corrected JSON.',
      error.message,
      `MARK'S TOPICS INSTRUCTION\n${control.instructions}`,
      'Use 6 to 24 topics. Each title must be a complete grammatical phrase of 5 to 16 words and no more than 96 characters. Each description must be 40 to 420 characters. Each topic must connect 2 to 12 exact event IDs from the stored evidence. Do not invent evidence.',
      `PREVIOUS JSON\n${rawText}`,
      `STORED EVIDENCE\n${evidenceText}`,
    ].join('\n\n').slice(0, 40_000))).text;
    normalized = validateTopicOrganization(parseJsonObject(rawText), validIds);
  }
  const categoriesByEvent = new Map<string, string>(evidence.map((row) => [row.id, row.primary_category]));
  const generatedAt = new Date().toISOString();
  const organization: TopicOrganization = {
    version: 1,
    generated_at: generatedAt,
    generated_by: actor,
    prompt_revision: control.revision,
    topics: normalized.map((item, index) => ({
      key: topicKey(item.title, index),
      title: item.title,
      description: item.description,
      event_ids: item.event_ids,
      tags: [...new Set(item.event_ids.map((id) => categoriesByEvent.get(id)).filter((value): value is string => Boolean(value)))].slice(0, 3),
    })),
  };
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO generation_meta (key, value) VALUES (?, ?)')
      .run('topics.organization.v1', JSON.stringify(organization));
    audit(actor, 'topics.rebuild', 'topics.organization.v1', {
      prompt_revision: control.revision,
      topic_count: organization.topics.length,
      evidence_count: evidence.length,
    });
  })();
  return organization;
}
