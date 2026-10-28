/**
 * Mark's reading marks for Topics: read (with the claims he read), a 1 to 5
 * interest rating and a bookmark. Marks are stored as one JSON value in
 * app_settings, so no schema change is needed.
 *
 * Marks are keyed by topic key. A rebuild gives every topic a new key, so a
 * topic with no record of its own may show a leftover mark (one whose topic no
 * longer exists) when it is clearly that topic's successor; see resolveMarks.
 * That is worked out whenever Topics are read and never saved, so a topic that
 * comes back (an undone rebuild or tidy) shows its own mark again.
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
  /** The topic's claims when the record last changed; used to find its successor after a rebuild. */
  claims: string[];
  updated_at: string;
  /** The leftover mark this record continued; it is then shown nowhere else. */
  from?: string;
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

const hasMarks = (mark: ReadingMark) => Boolean(mark.read_at || mark.rating || mark.bookmarked_at);

type Shown = { key: string; mark: ReadingMark };

/**
 * The mark each live topic shows, by topic key. A topic's own record always
 * wins, even a cleared one, so clearing marks never lets an older mark appear
 * in their place. A topic with no record shows a leftover mark only when it is
 * that mark's successor:
 * - it was created after the mark last changed, so it did not exist alongside
 *   the old topic (a topic that merely took in the old topic's claims later
 *   is a different story);
 * - it holds at least two of the mark's claims, and at least half of them;
 * - those claims make up at least a third of the topic.
 * Each leftover mark shows on one topic at most, closest match first.
 */
export function resolveMarks(topics: TopicV2[], marks: Record<string, ReadingMark>) {
  const shown = new Map<string, Shown>();
  const continued = new Set<string>();
  for (const topic of topics) {
    const own = marks[topic.key];
    if (!own) continue;
    shown.set(topic.key, { key: topic.key, mark: own });
    if (own.from) continued.add(own.from);
  }
  const byKey = new Map(topics.map((topic) => [topic.key, topic]));
  const holder = new Map<string, string>();
  for (const topic of topics) for (const ref of topic.claims) holder.set(ref, topic.key);
  const pairs: Array<Shown & { topic: string; shared: number; overlap: number }> = [];
  for (const [key, mark] of Object.entries(marks)) {
    if (byKey.has(key) || continued.has(key) || !hasMarks(mark)) continue;
    const claims = new Set(mark.claims ?? []);
    const changed = Date.parse(mark.updated_at);
    const shared = new Map<string, number>();
    for (const ref of claims) {
      const at = holder.get(ref);
      if (at && !shown.has(at)) shared.set(at, (shared.get(at) ?? 0) + 1);
    }
    for (const [at, count] of shared) {
      const topic = byKey.get(at)!;
      const size = new Set(topic.claims).size;
      if (!(Date.parse(topic.created_at) > changed)) continue;
      if (count < 2 || count * 2 < claims.size || count * 3 < size) continue;
      pairs.push({ key, mark, topic: at, shared: count, overlap: count / (claims.size + size - count) });
    }
  }
  pairs.sort((a, b) => b.overlap - a.overlap || b.shared - a.shared
    || String(b.mark.updated_at).localeCompare(String(a.mark.updated_at)) || a.topic.localeCompare(b.topic) || a.key.localeCompare(b.key));
  const used = new Set<string>();
  for (const pair of pairs) {
    if (used.has(pair.key) || shown.has(pair.topic)) continue;
    used.add(pair.key);
    shown.set(pair.topic, { key: pair.key, mark: pair.mark });
  }
  return shown;
}

export function readingView(mark: ReadingMark | undefined, liveRefs: string[]): ReadingView | null {
  if (!mark || !hasMarks(mark)) return null;
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

/** Reading views for every topic that shows a mark, keyed by topic key. Saves nothing. */
export function readingForTopics(organization: OrganizationV2, liveRefsOf: (topic: TopicV2) => string[]) {
  const shown = resolveMarks(organization.topics, loadMarks());
  const views = new Map<string, ReadingView>();
  for (const topic of organization.topics) {
    const view = readingView(shown.get(topic.key)?.mark, liveRefsOf(topic));
    if (view) views.set(topic.key, view);
  }
  return views;
}

const FIELDS = ['read', 'rating', 'bookmarked'] as const;

/**
 * Applies one change from the Topic page to the mark the topic shows. The
 * topic keeps its own record even when every mark is cleared, so a leftover
 * mark cannot appear in their place.
 */
export function updateReading(organization: OrganizationV2, key: string, change: unknown, liveRefs: (topic: TopicV2) => string[]) {
  const topic = organization.topics.find((item) => item.key === key);
  if (!topic) throw new TopicReadingError('not_found', 'That topic no longer exists. Refresh Topics and try again.', 404);
  const asked = change && typeof change === 'object' && !Array.isArray(change) ? change as Record<string, unknown> : {};
  const fields = FIELDS.filter((field) => Object.hasOwn(asked, field));
  if (!fields.length) throw new TopicReadingError('invalid_change', 'Say what to change: read, rating or bookmarked.');
  if (fields.includes('read') && typeof asked.read !== 'boolean') throw new TopicReadingError('invalid_change', 'read must be true or false.');
  if (fields.includes('bookmarked') && typeof asked.bookmarked !== 'boolean') throw new TopicReadingError('invalid_change', 'bookmarked must be true or false.');
  if (fields.includes('rating') && asked.rating !== null && !(Number.isInteger(asked.rating) && (asked.rating as number) >= 1 && (asked.rating as number) <= 5)) {
    throw new TopicReadingError('invalid_change', 'rating must be a whole number from 1 to 5, or null to clear it.');
  }
  const marks = loadMarks();
  const shown = resolveMarks(organization.topics, marks).get(key);
  const stamp = now();
  const live = liveRefs(topic);
  const base = shown?.mark;
  const mark: ReadingMark = {
    read_at: base?.read_at ?? null,
    read_claims: base?.read_claims ?? [],
    rating: base?.rating ?? null,
    bookmarked_at: base?.bookmarked_at ?? null,
    claims: [...new Set(topic.claims)],
    updated_at: stamp,
  };
  const from = shown && shown.key !== key ? shown.key : base?.from;
  if (from) mark.from = from;
  if (fields.includes('read')) {
    mark.read_at = asked.read ? stamp : null;
    mark.read_claims = asked.read ? live : [];
  }
  if (fields.includes('rating')) mark.rating = asked.rating as number | null;
  if (fields.includes('bookmarked')) mark.bookmarked_at = asked.bookmarked ? (mark.bookmarked_at ?? stamp) : null;
  marks[key] = mark;
  // A cleared record whose topic no longer exists does nothing.
  const liveKeys = new Set(organization.topics.map((item) => item.key));
  for (const [other, entry] of Object.entries(marks)) if (!liveKeys.has(other) && !hasMarks(entry)) delete marks[other];
  saveMarks(marks);
  return readingView(mark, live) ?? NO_MARK;
}

export const NO_MARK: ReadingView = { read: false, read_at: null, rating: null, bookmarked: false, bookmarked_at: null, new_claims: 0, new_refs: [] };
