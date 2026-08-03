import Database from "better-sqlite3";

export type MemoryGroup = "core" | "source" | "event" | "artifact";
export type MemoryNodeKind = "core" | "cluster" | "memory";

export type MemoryNode = {
  id: string;
  label: string;
  group: MemoryGroup;
  kind: MemoryNodeKind;
  x: number;
  y: number;
  radius: number;
  description: string;
  count?: number;
  phase: number;
};

export type MemoryEdge = {
  source: string;
  target: string;
  relation: "primary" | "related";
  restLength: number;
};

export type GraphData = {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  meta: {
    totalMemories: number;
    visibleMemories: number;
    generatedAt: string;
  };
};

export type MemoryDetail = {
  id: string;
  label: string;
  group: MemoryGroup;
  kind: MemoryNodeKind;
  summary: string;
  body: string;
  count?: number;
  sourceUrl?: string;
  metadata: Array<{ label: string; value: string }>;
  insights: string[];
};

type Candidate = {
  id: string;
  label: string;
  group: Exclude<MemoryGroup, "core">;
  description: string;
  score: number;
  parent: "sources" | "events" | "artifacts";
  sourceId?: string;
  phase: number;
};

type CountRow = { kind: string; count: number };
type EventRow = {
  id: string;
  label: string | null;
  summary: string | null;
  primary_category: string | null;
  significance: number | null;
  subject_date: string | null;
  source_id: string;
  relation_count: number;
  pinned: number;
  has_notes: number;
};
type SourceRow = {
  source_id: string;
  title: string;
  source_type: string;
  source_channel: string | null;
  captured_at: string;
  event_count: number;
  max_significance: number;
};
type DraftRow = {
  id: string;
  template_type: string | null;
  focus: string | null;
  body: string | null;
  subject_date: string | null;
};
type ThemeRow = {
  id: string;
  title: string | null;
  through_line: string | null;
  event_count: number;
};
type ConversationRow = {
  id: string;
  first_timestamp: string | null;
  kept_messages: number;
  excerpt: string | null;
};

const GRAPH_LIMIT = 20;
const BASE_NODE_COUNT = 4;
const DEFAULT_RECORD_LIMIT = GRAPH_LIMIT - BASE_NODE_COUNT;

let database: Database.Database | null = null;

function dbPath() {
  return process.env.CRYPTO_DB_PATH || "/data/crypto-intelligence.db";
}

function getDatabase() {
  if (!database) {
    database = new Database(dbPath(), { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    database.pragma("foreign_keys = ON");
  }
  return database;
}

function compact(value: unknown, fallback = "Untitled memory", limit = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
}

function searchable(...values: unknown[]) {
  return values.map((value) => String(value ?? "")).join(" ").toLowerCase();
}

function matchesQuery(query: string, ...values: unknown[]) {
  if (!query) return true;
  const haystack = searchable(...values);
  return query.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

function hashUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

const clusterConfig = {
  sources: {
    id: "sources",
    label: "Source Library",
    group: "source" as const,
    description: "Original articles, reports, transcripts, and captured research.",
    x: -230,
    y: -38,
  },
  events: {
    id: "events",
    label: "Intelligence Events",
    group: "event" as const,
    description: "Dated developments ranked by significance and connected to evidence.",
    x: 230,
    y: -38,
  },
  artifacts: {
    id: "artifacts",
    label: "Knowledge Artifacts",
    group: "artifact" as const,
    description: "Themes, briefs, drafts, and reusable outputs created from the research.",
    x: 0,
    y: 215,
  },
};

function memoryCounts() {
  const rows = getDatabase().prepare(`
    SELECT kind, COUNT(DISTINCT canonical_id) AS count
    FROM search_index
    WHERE kind IN ('source', 'event', 'draft', 'theme', 'conversation')
    GROUP BY kind
  `).all() as CountRow[];
  const counts = Object.fromEntries(rows.map((row) => [row.kind, Number(row.count)]));
  return {
    source: counts.source ?? 0,
    event: counts.event ?? 0,
    artifact: (counts.draft ?? 0) + (counts.theme ?? 0) + (counts.conversation ?? 0),
    total: rows.reduce((sum, row) => sum + Number(row.count), 0),
  };
}

function eventCandidates(query: string): Candidate[] {
  const rows = getDatabase().prepare(`
    SELECT
      e.id,
      COALESCE(NULLIF(e.summary, ''), NULLIF(s.title, ''), e.id) AS label,
      e.summary,
      e.primary_category,
      e.significance,
      COALESCE(e.posted_date, e.timestamp, e.ingested_at) AS subject_date,
      e.source_id,
      (
        SELECT COUNT(*) FROM event_connections c
        WHERE c.from_event_id = e.id OR c.to_event_id = e.id
      ) AS relation_count,
      EXISTS(SELECT 1 FROM pin_summaries p WHERE p.event_id = e.id) AS pinned,
      EXISTS(SELECT 1 FROM note_revisions n WHERE n.event_id = e.id) AS has_notes
    FROM events e
    LEFT JOIN sources s ON s.source_id = e.source_id
    ORDER BY
      pinned DESC,
      COALESCE(e.significance, 0) DESC,
      relation_count DESC,
      subject_date DESC,
      e.id ASC
  `).all() as EventRow[];

  return rows
    .filter((row) => matchesQuery(query, row.label, row.summary, row.primary_category, row.subject_date))
    .map((row, index) => ({
      id: `event:${row.id}`,
      label: compact(row.label),
      group: "event",
      description: compact(row.summary, "Intelligence event", 220),
      score: 100 + Number(row.significance ?? 0) * 20 + Number(row.relation_count) * 4 + Number(row.pinned) * 30 + Number(row.has_notes) * 8,
      parent: "events",
      sourceId: row.source_id,
      phase: index * 0.79 + hashUnit(row.id, 7),
    }));
}

function sourceCandidates(query: string): Candidate[] {
  const rows = getDatabase().prepare(`
    SELECT
      s.source_id,
      s.title,
      s.source_type,
      s.source_channel,
      s.captured_at,
      COUNT(e.id) AS event_count,
      COALESCE(MAX(e.significance), 0) AS max_significance
    FROM sources s
    LEFT JOIN events e ON e.source_id = s.source_id
    GROUP BY s.source_id
    ORDER BY max_significance DESC, event_count DESC, s.captured_at DESC, s.source_id ASC
  `).all() as SourceRow[];

  return rows
    .filter((row) => matchesQuery(query, row.title, row.source_type, row.source_channel, row.captured_at))
    .map((row, index) => ({
      id: `source:${row.source_id}`,
      label: compact(row.title),
      group: "source",
      description: `${row.event_count} connected intelligence event${row.event_count === 1 ? "" : "s"}.`,
      score: 80 + Number(row.max_significance) * 15 + Number(row.event_count) * 5,
      parent: "sources",
      phase: index * 0.83 + hashUnit(row.source_id, 11),
    }));
}

function artifactCandidates(query: string): Candidate[] {
  const drafts = getDatabase().prepare(`
    SELECT
      id,
      template_type,
      focus,
      COALESCE(NULLIF(edited_output, ''), raw_output) AS body,
      COALESCE(updated_at, created_at) AS subject_date
    FROM content_drafts
    ORDER BY subject_date DESC, id ASC
  `).all() as DraftRow[];
  const themes = getDatabase().prepare(`
    SELECT t.id, t.title, t.through_line, COUNT(te.event_id) AS event_count
    FROM themes t
    LEFT JOIN theme_events te ON te.theme_id = t.id
    GROUP BY t.id
    ORDER BY event_count DESC, t.id ASC
  `).all() as ThemeRow[];
  const conversations = getDatabase().prepare(`
    SELECT
      s.id,
      s.first_timestamp,
      s.kept_messages,
      (
        SELECT m.content
        FROM conversation_messages m
        WHERE m.session_id = s.id AND NULLIF(TRIM(m.content), '') IS NOT NULL
        ORDER BY m.sequence
        LIMIT 1
      ) AS excerpt
    FROM conversation_sessions s
    WHERE s.kept_messages > 0
    ORDER BY s.kept_messages DESC, s.first_timestamp DESC, s.id ASC
  `).all() as ConversationRow[];

  return [
    ...themes
      .filter((row) => matchesQuery(query, row.title, row.through_line))
      .map((row, index) => ({
        id: `theme:${row.id}`,
        label: compact(row.title, "Research theme"),
        group: "artifact" as const,
        description: compact(row.through_line, `${row.event_count} connected events.`, 220),
        score: 96 + Number(row.event_count) * 5,
        parent: "artifacts" as const,
        phase: index * 0.91 + hashUnit(row.id, 13),
      })),
    ...conversations
      .filter((row) => matchesQuery(query, row.id, row.first_timestamp, row.excerpt))
      .map((row, index) => ({
        id: `conversation:${row.id}`,
        label: `Research conversation · ${String(row.first_timestamp || row.id).slice(0, 10)}`,
        group: "artifact" as const,
        description: compact(row.excerpt, `${row.kept_messages} retained messages.`, 220),
        score: 86 + Math.min(8.5, Math.log2(Number(row.kept_messages) + 1)),
        parent: "artifacts" as const,
        phase: index * 0.89 + hashUnit(row.id, 31),
      })),
    ...drafts
      .filter((row) => matchesQuery(query, row.focus, row.template_type, row.body, row.subject_date))
      .map((row, index) => ({
        id: `draft:${row.id}`,
        label: compact(row.focus || row.template_type, "Prepared output"),
        group: "artifact" as const,
        description: compact(row.body, "Prepared knowledge artifact", 220),
        score: 72 + Math.max(0, 20 - index),
        parent: "artifacts" as const,
        phase: index * 0.87 + hashUnit(row.id, 17),
      })),
  ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function selectCandidates(group: string, query: string) {
  const uniqueByLabel = (items: Candidate[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const events = uniqueByLabel(eventCandidates(query));
  const sources = uniqueByLabel(sourceCandidates(query));
  const artifacts = uniqueByLabel(artifactCandidates(query));

  if (group === "source") return sources.slice(0, 18);
  if (group === "event") return events.slice(0, 18);
  if (group === "artifact") return artifacts.slice(0, 18);

  const selected = [
    ...events.slice(0, 8),
    ...sources.slice(0, 4),
    ...artifacts.slice(0, 4),
  ];
  if (selected.length >= DEFAULT_RECORD_LIMIT) return selected.slice(0, DEFAULT_RECORD_LIMIT);

  const chosen = new Set(selected.map((candidate) => candidate.id));
  const remainder = [...events, ...sources, ...artifacts]
    .filter((candidate) => !chosen.has(candidate.id))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return [...selected, ...remainder].slice(0, DEFAULT_RECORD_LIMIT);
}

function candidatePosition(candidate: Candidate, indexWithinParent: number, countWithinParent: number) {
  const parent = clusterConfig[candidate.parent];
  const baseAngle = candidate.parent === "sources" ? Math.PI : candidate.parent === "events" ? 0 : Math.PI / 2;
  const spread = countWithinParent <= 1 ? 0 : 1.7;
  const normalized = countWithinParent <= 1 ? 0 : indexWithinParent / (countWithinParent - 1) - 0.5;
  const angle = baseAngle + normalized * spread + (hashUnit(candidate.id, 19) - 0.5) * 0.2;
  const ring = 132 + (indexWithinParent % 3) * 28 + hashUnit(candidate.id, 23) * 18;
  return {
    x: parent.x + Math.cos(angle) * ring,
    y: parent.y + Math.sin(angle) * ring,
  };
}

export function getGraph(group = "all", rawQuery = ""): GraphData {
  const query = rawQuery.trim().toLowerCase().slice(0, 120);
  const counts = memoryCounts();
  const candidates = selectCandidates(group, query);
  const activeParents = group === "all"
    ? (["sources", "events", "artifacts"] as const)
    : ([group === "source" ? "sources" : group === "event" ? "events" : "artifacts"] as const);

  const nodes: MemoryNode[] = [{
    id: "mark",
    label: "Mark",
    group: "core",
    kind: "core",
    x: 0,
    y: 0,
    radius: 20,
    description: "Mark at the center of his private intelligence system.",
    count: counts.total,
    phase: 0,
  }];
  const edges: MemoryEdge[] = [];

  for (const [index, parentId] of activeParents.entries()) {
    const parent = clusterConfig[parentId];
    const count = parentId === "sources" ? counts.source : parentId === "events" ? counts.event : counts.artifact;
    nodes.push({ ...parent, kind: "cluster", radius: 11, count, phase: index * 1.7 });
    edges.push({ source: "mark", target: parent.id, relation: "primary", restLength: activeParents.length === 1 ? 150 : 172 });
  }

  const parentCounts = new Map<string, number>();
  for (const candidate of candidates) parentCounts.set(candidate.parent, (parentCounts.get(candidate.parent) ?? 0) + 1);
  const parentIndexes = new Map<string, number>();

  for (const candidate of candidates) {
    const index = parentIndexes.get(candidate.parent) ?? 0;
    parentIndexes.set(candidate.parent, index + 1);
    const position = candidatePosition(candidate, index, parentCounts.get(candidate.parent) ?? 1);
    nodes.push({
      id: candidate.id,
      label: candidate.label,
      group: candidate.group,
      kind: "memory",
      x: position.x,
      y: position.y,
      radius: 5.5 + Math.min(3, Math.max(0, (candidate.score - 70) / 55)),
      description: candidate.description,
      phase: candidate.phase,
    });
    edges.push({ source: candidate.parent, target: candidate.id, relation: "primary", restLength: 108 + hashUnit(candidate.id, 29) * 24 });
  }

  const selectedIds = new Set(nodes.map((node) => node.id));
  const sourceToNode = new Map(candidates.filter((candidate) => candidate.group === "source").map((candidate) => [candidate.id.slice(7), candidate.id]));
  for (const candidate of candidates) {
    if (candidate.group !== "event" || !candidate.sourceId) continue;
    const sourceNode = sourceToNode.get(candidate.sourceId);
    if (sourceNode && selectedIds.has(sourceNode)) {
      edges.push({ source: sourceNode, target: candidate.id, relation: "related", restLength: 170 });
    }
  }

  const eventIds = candidates.filter((candidate) => candidate.group === "event").map((candidate) => candidate.id.slice(6));
  if (eventIds.length) {
    const placeholders = eventIds.map(() => "?").join(",");
    const connections = getDatabase().prepare(`
      SELECT from_event_id, to_event_id
      FROM event_connections
      WHERE resolved = 1 AND from_event_id IN (${placeholders}) AND to_event_id IN (${placeholders})
      LIMIT 24
    `).all(...eventIds, ...eventIds) as Array<{ from_event_id: string; to_event_id: string }>;
    for (const connection of connections) {
      edges.push({
        source: `event:${connection.from_event_id}`,
        target: `event:${connection.to_event_id}`,
        relation: "related",
        restLength: 190,
      });
    }
  }

  return {
    nodes: nodes.slice(0, GRAPH_LIMIT),
    edges: edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)),
    meta: {
      totalMemories: counts.total,
      visibleMemories: candidates.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

function getEventDetail(id: string): MemoryDetail | null {
  const row = getDatabase().prepare(`
    SELECT
      e.*,
      s.title AS source_title,
      s.source_label,
      s.source_url AS canonical_source_url
    FROM events e
    LEFT JOIN sources s ON s.source_id = e.source_id
    WHERE e.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const insights = getDatabase().prepare(`
    SELECT text FROM event_insights WHERE event_id = ? ORDER BY position LIMIT 4
  `).all(id) as Array<{ text: string }>;
  const note = getDatabase().prepare(`
    SELECT text FROM note_revisions WHERE event_id = ? ORDER BY revision DESC LIMIT 1
  `).get(id) as { text: string } | undefined;
  const subjectDate = row.posted_date || row.timestamp || row.ingested_at;
  return {
    id: `event:${id}`,
    label: compact(row.summary || row.source_title || id),
    group: "event",
    kind: "memory",
    summary: compact(row.summary, "Intelligence event", 560),
    body: compact(row.detailed_content || row.detailed_notes || row.raw_text || note?.text || row.summary, "No additional detail stored.", 2400),
    sourceUrl: String(row.canonical_source_url || row.source_url || "").trim() || undefined,
    metadata: [
      { label: "Category", value: compact(row.primary_category, "Uncategorized", 80) },
      { label: "Significance", value: `${Number(row.significance ?? 0)}/5` },
      { label: "Subject date", value: compact(subjectDate, "Unknown", 80) },
      { label: "Origin", value: compact(row.origin, "migrated", 40) },
    ],
    insights: insights.map((item) => compact(item.text, "", 360)).filter(Boolean),
  };
}

function getSourceDetail(id: string): MemoryDetail | null {
  const row = getDatabase().prepare(`
    SELECT s.*, COUNT(e.id) AS event_count, COALESCE(MAX(e.significance), 0) AS max_significance
    FROM sources s
    LEFT JOIN events e ON e.source_id = s.source_id
    WHERE s.source_id = ?
    GROUP BY s.source_id
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const events = getDatabase().prepare(`
    SELECT summary FROM events WHERE source_id = ?
    ORDER BY COALESCE(significance, 0) DESC, COALESCE(posted_date, timestamp, ingested_at) DESC
    LIMIT 4
  `).all(id) as Array<{ summary: string | null }>;
  return {
    id: `source:${id}`,
    label: compact(row.title),
    group: "source",
    kind: "memory",
    summary: `${Number(row.event_count)} intelligence event${Number(row.event_count) === 1 ? "" : "s"} were extracted from this source.`,
    body: compact(events.map((event) => event.summary).filter(Boolean).join(" "), "The original evidence is retained for reference.", 2400),
    count: Number(row.event_count),
    sourceUrl: String(row.source_url || "").trim() || undefined,
    metadata: [
      { label: "Source type", value: compact(row.source_type, "Unknown", 80) },
      { label: "Channel", value: compact(row.source_channel, "Unknown", 80) },
      { label: "Captured", value: compact(row.captured_at, "Unknown", 80) },
      { label: "Origin", value: compact(row.origin, "migrated", 40) },
    ],
    insights: [],
  };
}

function getDraftDetail(id: string): MemoryDetail | null {
  const row = getDatabase().prepare(`SELECT * FROM content_drafts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const body = row.edited_output || row.raw_output;
  return {
    id: `draft:${id}`,
    label: compact(row.focus || row.template_type, "Prepared output"),
    group: "artifact",
    kind: "memory",
    summary: compact(body, "Prepared knowledge artifact", 560),
    body: compact(body, "No output text stored.", 2400),
    metadata: [
      { label: "Format", value: compact(row.template_type, "Draft", 80) },
      { label: "Created", value: compact(row.created_at, "Unknown", 80) },
      { label: "Updated", value: compact(row.updated_at, "Unknown", 80) },
      { label: "Origin", value: compact(row.origin, "migrated", 40) },
    ],
    insights: [],
  };
}

function getThemeDetail(id: string): MemoryDetail | null {
  const row = getDatabase().prepare(`
    SELECT t.*, COUNT(te.event_id) AS event_count
    FROM themes t LEFT JOIN theme_events te ON te.theme_id = t.id
    WHERE t.id = ? GROUP BY t.id
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: `theme:${id}`,
    label: compact(row.title, "Research theme"),
    group: "artifact",
    kind: "memory",
    summary: compact(row.through_line, "Research theme", 560),
    body: compact(row.through_line, "No additional detail stored.", 2400),
    count: Number(row.event_count),
    metadata: [
      { label: "Connected events", value: String(Number(row.event_count)) },
      { label: "Generated", value: compact(row.generated_at, "Unknown", 80) },
    ],
    insights: [],
  };
}

function getConversationDetail(id: string): MemoryDetail | null {
  const row = getDatabase().prepare(`
    SELECT id, first_timestamp, kept_messages
    FROM conversation_sessions
    WHERE id = ?
  `).get(id) as ConversationRow | undefined;
  if (!row) return null;
  const messages = getDatabase().prepare(`
    SELECT role, content, timestamp
    FROM conversation_messages
    WHERE session_id = ? AND NULLIF(TRIM(content), '') IS NOT NULL
    ORDER BY sequence
    LIMIT 24
  `).all(id) as Array<{ role: string; content: string; timestamp: string | null }>;
  const body = messages
    .map((message) => {
      const speaker = message.role === "user" ? "Mark" : message.role === "assistant" ? "Assistant" : message.role;
      return `${speaker}: ${message.content}`;
    })
    .join("\n\n");
  const firstQuestion = messages.find((message) => message.role === "user")?.content;
  return {
    id: `conversation:${id}`,
    label: `Research conversation · ${String(row.first_timestamp || id).slice(0, 10)}`,
    group: "artifact",
    kind: "memory",
    summary: compact(firstQuestion, `${Number(row.kept_messages)} retained conversation messages.`, 560),
    body: compact(body, "No retained conversation text.", 2400),
    count: Number(row.kept_messages),
    metadata: [
      { label: "Messages", value: String(Number(row.kept_messages)) },
      { label: "First captured", value: compact(row.first_timestamp, "Unknown", 80) },
      { label: "Origin", value: "migrated" },
    ],
    insights: [],
  };
}

export function getMemoryDetail(rawId: string): MemoryDetail | null {
  const id = decodeURIComponent(rawId).slice(0, 240);
  const counts = memoryCounts();
  if (id === "mark") {
    return {
      id,
      label: "Mark",
      group: "core",
      kind: "core",
      summary: "The center of Mark's private intelligence system.",
      body: "Hermes connects Mark's working context to the active Crypto Intelligence branch and to future branches as they are built.",
      count: counts.total,
      metadata: [
        { label: "Indexed memories", value: String(counts.total) },
        { label: "Active branch", value: "Crypto Intelligence" },
        { label: "Access", value: "Private" },
      ],
      insights: [],
    };
  }
  if (id in clusterConfig) {
    const cluster = clusterConfig[id as keyof typeof clusterConfig];
    const count = id === "sources" ? counts.source : id === "events" ? counts.event : counts.artifact;
    return {
      id,
      label: cluster.label,
      group: cluster.group,
      kind: "cluster",
      summary: cluster.description,
      body: "The graph shows only the highest-value records at one time. Search or filter to bring different memories into view without making the map unreadable.",
      count,
      metadata: [
        { label: "Indexed records", value: String(count) },
        { label: "Branch", value: "Crypto Intelligence" },
        { label: "Access", value: "Private" },
      ],
      insights: [],
    };
  }
  const separator = id.indexOf(":");
  if (separator < 1) return null;
  const type = id.slice(0, separator);
  const canonicalId = id.slice(separator + 1);
  if (!canonicalId) return null;
  if (type === "event") return getEventDetail(canonicalId);
  if (type === "source") return getSourceDetail(canonicalId);
  if (type === "draft") return getDraftDetail(canonicalId);
  if (type === "theme") return getThemeDetail(canonicalId);
  if (type === "conversation") return getConversationDetail(canonicalId);
  return null;
}

export function checkDatabase() {
  const result = getDatabase().prepare("PRAGMA quick_check").pluck().get();
  return { ok: result === "ok", path: dbPath(), result: String(result) };
}
