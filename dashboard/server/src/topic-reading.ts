/**
 * Mark's reading marks for Topics: read (with the claims he read), a 1 to 5
 * interest rating and a bookmark. Marks are stored as one JSON value in
 * app_settings, so no schema change is needed.
 *
 * Marks are keyed by topic key. When a rebuild gives topics new keys, a mark
 * follows the topic that now holds most of the claims it was made on.
 */
import { one, run } from './db.js';
import type { OrganizationV2, TopicV2 } from './topic-organization.js';

export const READING_KEY = 'topics.reading.v1';

export type ReadingMark = {
  /** When the topic was last marked read, and the claims it held then. */
  read_at?: string | null;
  read_claims?: string[];
  /** 1 (meh) to 5 (very interesting). */
  rating?: number | null;
  bookmarked_at?: string | null;
  /** The topic's claims when the mark last changed; used to follow the topic across rebuilds. */
  claims: string[];
  updated_at: string;
};

export type ReadingView = {
  read: boolean;
  read_at: string | null;
  rating: number | null;
  bookmarked: boolean;
  bookmarked_at: string | null;
  /** Claims added since the topic was marked read. */
  new_claims: number;
  new_refs: string[];
};

export class TopicReadingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const now = () => new Date().toISOString();

function loadMarks(): Record<string, ReadingMark> {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', READING_KEY);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' && parsed.marks && typeof parsed.marks === 'object' ? parsed.marks : {};
  } catch {
    return {};
  }
}

function saveMarks(marks: Record<string, ReadingMark>) {
  run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', READING_KEY, JSON.stringify({ version: 1, marks }));
}

const empty = (mark: ReadingMark) => !mark.read_at && !mark.rating && !mark.bookmarked_at;

/**
 * Moves marks whose topic key no longer exists to the topic that now holds
 * most of their claims (at least two, and at least half of them). A topic that
 * already has a mark keeps its own. Unmatched marks are kept, so a topic that
 * comes back (an undone tidy or rebuild) finds its mark again.
 */
export function reconcileMarks(organization: OrganizationV2, marks = loadMarks()) {
  const byKey = new Map(organization.topics.map((topic) => [topic.key, topic]));
  let moved = false;
  for (const [key, mark] of Object.entries(marks)) {
    if (byKey.has(key) || !mark.claims?.length) continue;
    const mine = new Set(mark.claims);
    let best: { topic: TopicV2; shared: number } | null = null;
    for (const topic of organization.topics) {
      if (marks[topic.key]) continue;
      const shared = topic.claims.filter((ref) => mine.has(ref)).length;
      if (shared >= 2 && shared * 2 >= mine.size && (!best || shared > best.shared)) best = { topic, shared };
    }
    if (!best) continue;
    marks[best.topic.key] = { ...mark, claims: [...best.topic.claims] };
    delete marks[key];
    moved = true;
  }
  if (moved) saveMarks(marks);
  return marks;
}

export function readingView(mark: ReadingMark | undefined, liveRefs: string[]): ReadingView | null {
  if (!mark || empty(mark)) return null;
  const seen = new Set(mark.read_claims ?? []);
  const fresh = mark.read_at ? liveRefs.filter((ref) => !seen.has(ref)) : [];
  return {
    read: Boolean(mark.read_at),
    read_at: mark.read_at ?? null,
    rating: mark.rating ?? null,
    bookmarked: Boolean(mark.bookmarked_at),
    bookmarked_at: mark.bookmarked_at ?? null,
    new_claims: fresh.length,
    new_refs: fresh,
  };
}

/** Reading views for every topic that has a mark, keyed by topic key. */
export function readingForTopics(organization: OrganizationV2, liveRefsOf: (topic: TopicV2) => string[]) {
  const marks = reconcileMarks(organization);
  const views = new Map<string, ReadingView>();
  for (const topic of organization.topics) {
    const view = readingView(marks[topic.key], liveRefsOf(topic));
    if (view) views.set(topic.key, view);
  }
  return views;
}

type Change = { read?: unknown; rating?: unknown; bookmarked?: unknown };

/** Applies one change from the Topic page. Clearing every mark removes the record. */
export function updateReading(organization: OrganizationV2, key: string, change: Change, liveRefs: (topic: TopicV2) => string[]) {
  const topic = organization.topics.find((item) => item.key === key);
  if (!topic) throw new TopicReadingError('not_found', 'That topic no longer exists. Refresh Topics and try again.', 404);
  const fields = ['read', 'rating', 'bookmarked'].filter((field) => change && field in change);
  if (!fields.length) throw new TopicReadingError('invalid_change', 'Say what to change: read, rating or bookmarked.');
  if ('read' in change && typeof change.read !== 'boolean') throw new TopicReadingError('invalid_change', 'read must be true or false.');
  if ('bookmarked' in change && typeof change.bookmarked !== 'boolean') throw new TopicReadingError('invalid_change', 'bookmarked must be true or false.');
  if ('rating' in change && change.rating !== null && !(Number.isInteger(change.rating) && (change.rating as number) >= 1 && (change.rating as number) <= 5)) {
    throw new TopicReadingError('invalid_change', 'rating must be a whole number from 1 to 5, or null to clear it.');
  }
  const marks = reconcileMarks(organization);
  const stamp = now();
  const live = liveRefs(topic);
  const mark: ReadingMark = { ...(marks[key] ?? { claims: [] }), claims: [...topic.claims], updated_at: stamp };
  if ('read' in change) {
    mark.read_at = change.read ? stamp : null;
    mark.read_claims = change.read ? live : [];
  }
  if ('rating' in change) mark.rating = change.rating as number | null;
  if ('bookmarked' in change) mark.bookmarked_at = change.bookmarked ? (mark.bookmarked_at ?? stamp) : null;
  if (empty(mark)) delete marks[key]; else marks[key] = mark;
  saveMarks(marks);
  return readingView(marks[key], live) ?? NO_MARK;
}

export const NO_MARK: ReadingView = { read: false, read_at: null, rating: null, bookmarked: false, bookmarked_at: null, new_claims: 0, new_refs: [] };
