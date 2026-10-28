import { all, audit, db, one } from './db.js';
import { DEFAULT_TOPICS_INSTRUCTION, groupWaitingClaims, previewTopicsV2, rebuildTopicsV2, type Progress } from './topic-organization.js';

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
    purpose: 'Controls how claims are grouped into topics and how topic titles and context lines are written.',
    mode: 'generated',
    application: 'New claims are filed with this instruction as sources finish processing. Preview it on a sample, then rebuild Topics to apply it to everything.',
    instructions: DEFAULT_TOPICS_INSTRUCTION,
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

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const incompleteTitleEnding = /\b(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i;

/** Validates the earlier event-level organization, which remains readable until the first new rebuild. */
export function validateTopicOrganization(raw: any, validEventIds: Set<string>) {
  const rows = Array.isArray(raw?.topics) ? raw.topics : [];
  const issues: string[] = [];
  const minimum = Math.min(6, Math.max(1, Math.floor(validEventIds.size / 2)));
  if (rows.length < minimum || rows.length > 24) issues.push(`Return ${minimum} to 24 focused topics.`);
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

/**
 * Rebuilds Topics with thirteen categories and claim-level grouping. Kept here
 * so the background job and its tests have one stable entry point.
 */
export async function rebuildTopics(actor: string, onProgress?: (progress: Progress) => void) {
  const control = getPromptControl('topics');
  return rebuildTopicsV2(actor, control.instructions, control.revision, onProgress);
}

export async function previewTopics(actor: string, onProgress?: (progress: Progress) => void) {
  return previewTopicsV2(actor, getPromptControl('topics').instructions, onProgress);
}

export async function groupWaitingTopics(actor: string, onProgress?: (progress: Progress) => void) {
  return groupWaitingClaims(actor, getPromptControl('topics').instructions, onProgress);
}
