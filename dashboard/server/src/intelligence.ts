import { audit, all, one, run } from './db.js';
import { runHermesAgent } from './hermes-client.js';
import * as tools from './tools.js';

const META_KEY = 'intelligence.latest';
const META_ATTEMPT_KEY = 'intelligence.last_attempt_at';
const DEFAULT_REFRESH_HOURS = 24;

export type IntelligenceUrgency = 'now' | 'today' | 'watch';
export type IntelligenceActionTarget = 'ask' | 'quiz' | 'studio' | 'speaking' | 'library';

export interface IntelligenceBrief {
  id: string;
  generated_at: string;
  headline: string;
  summary: string;
  needs_attention: Array<{
    title: string;
    why: string;
    urgency: IntelligenceUrgency;
  }>;
  changes: Array<{
    title: string;
    detail: string;
    source_label: string;
    source_url: string;
    published_at: string | null;
  }>;
  suggested_actions: Array<{
    title: string;
    reason: string;
    target: IntelligenceActionTarget;
    query: string;
  }>;
  watchlists: Array<{
    label: string;
    status: string;
    detail: string;
  }>;
  sources_reviewed: number;
}

export class IntelligenceError extends Error {
  constructor(public code: string, message: string, public status = 503) {
    super(message);
  }
}

const clean = (value: unknown, limit: number) => {
  const normalized = String(value ?? '')
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, Math.max(1, limit - 1));
  const wordBoundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, wordBoundary > limit * 0.65 ? wordBoundary : clipped.length).trim()}…`;
};

function parseJson(value: string) {
  const cleanValue = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleanValue) as any;
  } catch {
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (start < 0) {
        if (character === '{') {
          start = index;
          depth = 1;
        }
        continue;
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(value.slice(start, index + 1)) as any;
          } catch {
            start = -1;
          }
        }
      }
    }
    throw new IntelligenceError('invalid_generation', 'Hermes returned an invalid briefing. The previous briefing was kept.');
  }
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function arrayOf(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function validateBrief(value: unknown): IntelligenceBrief {
  const raw = value as any;
  const headline = clean(raw?.headline, 180);
  const summary = clean(raw?.summary, 1_400);
  if (headline.length < 8 || summary.length < 30) {
    throw new IntelligenceError('invalid_generation', 'Hermes returned an incomplete briefing. The previous briefing was kept.');
  }

  const needsAttention = arrayOf(raw.needs_attention, 3).map((item: any) => ({
    title: clean(item?.title, 180),
    why: clean(item?.why, 700),
    urgency: ['now', 'today', 'watch'].includes(item?.urgency) ? item.urgency as IntelligenceUrgency : 'watch',
  })).filter((item) => item.title && item.why);

  const changes = arrayOf(raw.changes, 5).map((item: any) => ({
    title: clean(item?.title, 180),
    detail: clean(item?.detail, 800),
    source_label: clean(item?.source_label, 160),
    source_url: safeUrl(item?.source_url),
    published_at: item?.published_at ? clean(item.published_at, 40) : null,
  })).filter((item) => item.title && item.detail && item.source_label && item.source_url);

  const targets: IntelligenceActionTarget[] = ['ask', 'quiz', 'studio', 'speaking', 'library'];
  const suggestedActions = arrayOf(raw.suggested_actions, 4).map((item: any) => ({
    title: clean(item?.title, 160),
    reason: clean(item?.reason, 500),
    target: targets.includes(item?.target) ? item.target as IntelligenceActionTarget : 'ask',
    query: clean(item?.query, 300),
  })).filter((item) => item.title && item.reason);

  const watchlists = arrayOf(raw.watchlists, 6).map((item: any) => ({
    label: clean(item?.label, 120),
    status: clean(item?.status, 80),
    detail: clean(item?.detail, 500),
  })).filter((item) => item.label && item.status && item.detail);

  if (!changes.length) {
    throw new IntelligenceError('sources_missing', 'Hermes returned no verifiable live sources. The previous briefing was kept.');
  }

  return {
    id: `brief_${Date.now().toString(36)}`,
    generated_at: new Date().toISOString(),
    headline,
    summary,
    needs_attention: needsAttention,
    changes,
    suggested_actions: suggestedActions,
    watchlists,
    sources_reviewed: new Set(changes.map((item) => item.source_url)).size,
  };
}

function latestBrief() {
  const row = one<{ value: string }>('SELECT value FROM generation_meta WHERE key = ?', META_KEY);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as IntelligenceBrief;
  } catch {
    return null;
  }
}

function lastAttemptAt() {
  const row = one<{ value: string }>('SELECT value FROM generation_meta WHERE key = ?', META_ATTEMPT_KEY);
  return row?.value && Number.isFinite(Date.parse(row.value)) ? row.value : null;
}

function recordAttempt() {
  const value = new Date().toISOString();
  run(
    `INSERT INTO generation_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    META_ATTEMPT_KEY,
    value,
  );
  return value;
}

export function intelligenceConfigured() {
  return Boolean(process.env.HERMES_BASE_URL);
}

export function refreshHours() {
  const value = Number(process.env.INTELLIGENCE_AUTO_REFRESH_HOURS ?? DEFAULT_REFRESH_HOURS);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 168) : DEFAULT_REFRESH_HOURS;
}

function isStale(brief: IntelligenceBrief | null) {
  if (!brief) return true;
  return Date.now() - Date.parse(brief.generated_at) >= refreshHours() * 60 * 60 * 1000;
}

export function intelligenceStatus() {
  const brief = latestBrief();
  const nextRefreshAt = brief
    ? new Date(Date.parse(brief.generated_at) + refreshHours() * 60 * 60 * 1000).toISOString()
    : null;
  return {
    connected: intelligenceConfigured(),
    enabled: scheduledEnabled(),
    refresh_hours: refreshHours(),
    stale: isStale(brief),
    next_refresh_at: nextRefreshAt,
    last_attempt_at: lastAttemptAt(),
    brief,
  };
}

function buildPrompt() {
  const stored = tools.brief() as any;
  const entities = all<{ value: string; entity_type: string; count: number }>(
    `SELECT value, entity_type, count(*) AS count
       FROM event_entities
      WHERE length(trim(value)) > 1
      GROUP BY value, entity_type
      HAVING count(*) >= 2
      ORDER BY count(*) DESC, value
      LIMIT 8`,
  );
  const strongest = (stored.highSignal ?? []).slice(0, 8).map((event: any) => ({
    id: event.id,
    date: event.subject_date,
    significance: event.significance,
    category: event.primary_category,
    summary: clean(event.summary, 500),
  }));

  return [
    'ROLE',
    "You are Hermes, the central brain inside Mark Gerhart's private Crypto Intelligence system.",
    '',
    'TASK',
    'Create a concise daily intelligence briefing. Use your native web_search tool to research material changes related to the watch topics below. Use no more than five focused searches and no more than eight external sources. Prefer protocol documentation, governance forums, regulatory sources, company publications, and other primary sources. Use browser tools only when a search result needs verification. Compare live findings with the stored baseline. Ignore price-only noise, generic market commentary, duplicate stories, and unsupported claims. The final changes array must contain at least one verified HTTP or HTTPS source URL. Keep the headline under 110 characters.',
    '',
    'SAFETY AND SCOPE',
    'Research and recommend only. Do not publish, send messages, alter accounts, write files, change memory, run shell commands, or perform any external action. Never expose secrets or internal paths. If a claim cannot be verified, omit it.',
    '',
    'CURRENT DATE',
    new Date().toISOString(),
    '',
    'WATCH TOPICS',
    JSON.stringify(entities),
    '',
    'STORED BASELINE',
    JSON.stringify({
      theme: stored.theme,
      range: stored.range,
      counts: { events: stored.counts?.events, sources: stored.counts?.sources },
      strongest,
    }),
    '',
    'OUTPUT CONTRACT',
    'Return only valid JSON. No markdown and no surrounding commentary. Use this exact shape:',
    JSON.stringify({
      headline: 'One precise sentence describing the most important current signal.',
      summary: 'A concise decision-useful synthesis of what matters and why.',
      needs_attention: [{ title: 'Item', why: 'Why it matters now', urgency: 'now|today|watch' }],
      changes: [{ title: 'Verified change', detail: 'What changed and why it matters', source_label: 'Source name', source_url: 'https://...', published_at: 'ISO date or null' }],
      suggested_actions: [{ title: 'Useful next step', reason: 'Why this is useful', target: 'ask|quiz|studio|speaking|library', query: 'Prefilled topic or question' }],
      watchlists: [{ label: 'Topic', status: 'quiet|moving|attention', detail: 'One sentence status' }],
    }),
    'Return at most 3 needs_attention items, 5 changes, 4 suggested_actions, and 6 watchlists.',
  ].join('\n').slice(0, 32_000);
}

let inFlight: Promise<IntelligenceBrief> | null = null;

export async function refreshIntelligence(actor: string, trigger: 'manual' | 'scheduled') {
  if (!intelligenceConfigured()) {
    throw new IntelligenceError('intelligence_plane_not_connected', 'Hermes is not connected in this environment.');
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    recordAttempt();
    const result = await runHermesAgent(buildPrompt(), {
      title: 'Crypto daily intelligence',
      reasoningEffort: 'low',
      timeoutMs: 210_000,
    });
    const brief = validateBrief(parseJson(result.text));
    run(
      `INSERT INTO generation_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      META_KEY,
      JSON.stringify(brief),
    );
    audit(actor, 'intelligence.refresh', brief.id, {
      trigger,
      sources_reviewed: brief.sources_reviewed,
      changes: brief.changes.length,
    });
    return brief;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

function scheduledEnabled() {
  return one<{ value: string }>("SELECT value FROM app_settings WHERE key='intelligence.enabled'")?.value !== 'false';
}

export function startIntelligenceScheduler() {
  if (!intelligenceConfigured()) return () => {};
  const check = () => {
    if (!scheduledEnabled()) return;
    const latest = latestBrief();
    if (!isStale(latest) || inFlight) return;
    const lastAttempt = lastAttemptAt();
    if (lastAttempt && Date.now() - Date.parse(lastAttempt) < refreshHours() * 60 * 60 * 1000) return;
    void refreshIntelligence('Hermes scheduler', 'scheduled').catch((error) => {
      console.error(`Scheduled intelligence refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  };
  const first = setTimeout(check, 2 * 60 * 1000);
  const interval = setInterval(check, 15 * 60 * 1000);
  first.unref();
  interval.unref();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
