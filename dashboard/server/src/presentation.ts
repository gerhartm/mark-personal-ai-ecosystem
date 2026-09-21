type SourceEvent = {
  id?: string;
  summary?: unknown;
  detailed_content?: unknown;
  insight_text?: unknown;
  significance?: unknown;
  subject_date?: unknown;
  primary_category?: unknown;
};

const clean = (value: unknown) => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^\s*[-*]\s+/gm, '')
  .replace(/\*\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const bounded = (value: unknown, limit: number) => {
  const text = clean(value);
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const sentence = clipped.lastIndexOf('. ');
  const space = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, sentence > limit * .55 ? sentence + 1 : space > 0 ? space : limit).trim()}…`;
};

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function insightLines(event: SourceEvent) {
  return String(event.insight_text ?? '')
    .split('\n')
    .map((line) => bounded(line, 360))
    .filter((line) => line.length >= 24);
}

export function buildSourceBrief(source: Record<string, any>, events: SourceEvent[]) {
  const ranked = [...events].sort((a, b) =>
    Number(b.significance ?? 0) - Number(a.significance ?? 0)
    || String(b.subject_date ?? '').localeCompare(String(a.subject_date ?? '')),
  );
  const sourceTitle = bounded(source.title ?? source.source_label, 520);
  const topSummary = bounded(ranked[0]?.summary, 520);
  const overview = sourceTitle.length >= 80
    ? sourceTitle
    : unique([sourceTitle, topSummary]).filter((item) => item.length >= 28).join(' ');
  const keyPoints = unique([
    ...ranked.flatMap(insightLines),
    ...ranked.map((event) => bounded(event.summary, 360)),
  ]).slice(0, 6);
  const dates = events.map((event) => String(event.subject_date ?? '').slice(0, 10)).filter(Boolean).sort();
  const categories = unique(events.map((event) => clean(event.primary_category)).filter(Boolean)).slice(0, 8);

  return {
    overview,
    key_points: keyPoints,
    event_count: events.length,
    date_from: dates[0] ?? null,
    date_to: dates.at(-1) ?? null,
    categories,
  };
}

export function eventPresentation(event: Record<string, any>) {
  const takeaways = unique((Array.isArray(event.insights) ? event.insights : [])
    .map((item: any) => bounded(item?.text, 520))
    .filter(Boolean));
  return {
    what_happened: bounded(event.editorial?.explanation || event.summary, 1_200),
    source_context: bounded(event.editorial?.explanation || event.detailed_content || event.raw_text, 2_400),
    why_it_matters: event.editorial?.why_it_matters ?? null,
    key_takeaways: takeaways.slice(0, 6),
  };
}
