export const titleCase = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const sourceKind = (value?: string | null) => {
  const kind = String(value ?? '').toLowerCase();
  if (kind.includes('podcast') || kind.includes('audio') || kind.includes('transcript') || kind.includes('youtube') || kind.includes('video')) return 'Transcript';
  if (kind.includes('telegram') || kind.includes('tweet') || kind.includes('twitter') || kind.includes('instagram')) return 'Tweet';
  if (kind.includes('blog') || kind.includes('article') || kind.includes('web')) return 'Blog post';
  if (kind.includes('note')) return 'Your notes';
  return 'Source';
};

export const compact = (value: unknown, length = 220) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};

export const readableText = (value: unknown, length = 900) => {
  const text = String(value ?? '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'Date unknown';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: value.length === 4 ? undefined : 'numeric', timeZone: 'UTC' }).format(date);
};

export const categoryColor = (category: string) => {
  const colors = ['var(--cat-red)', 'var(--cat-orange)', 'var(--cat-gold)', 'var(--cat-yellow)', 'var(--cat-green)', 'var(--cat-teal)', 'var(--cat-blue)', 'var(--cat-deep-blue)'];
  let hash = 0;
  for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
};
