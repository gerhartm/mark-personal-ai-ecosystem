/** Subject dates carry mixed precision, so they are never rendered as if exact. */
export type Precision = 'day' | 'month' | 'quarter' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatPin(date: string, precision: string): string {
  const s = String(date);
  if (precision === 'year' || /^\d{4}$/.test(s)) return s.slice(0, 4);
  if (precision === 'quarter') {
    const m = s.match(/^(\d{4})(?:-Q?(\d))?/i);
    if (m) return `Q${m[2] ?? '1'} ${m[1]}`;
    return s;
  }
  if (precision === 'month' || /^\d{4}-\d{2}$/.test(s)) {
    const [y, mo] = s.split('-');
    return `${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
  }
  const [y, mo, d] = s.split('-');
  if (!d) return s;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

export const precisionNote: Record<string, string> = {
  day: 'exact day',
  month: 'month only',
  quarter: 'quarter only',
  year: 'year only',
};

export function formatDate(value?: string | null): string {
  if (!value) return 'no date';
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (!d) return iso;
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return 'no timestamp';
  const date = formatDate(value);
  const t = value.slice(11, 16);
  return t ? `${date}, ${t}` : date;
}

export function relativeTime(value?: string | null): string {
  if (!value) return '';
  const then = new Date(value.replace(' ', 'T')).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 30 * day) return `${Math.round(diff / day)} days ago`;
  if (diff < 365 * day) return `${Math.round(diff / (30 * day))} months ago`;
  return `${Math.round(diff / (365 * day))} years ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}...`;
}

/** Splits stored prose into paragraphs without inventing structure. */
export const paragraphs = (text?: string | null): string[] =>
  (text ?? '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const yearOf = (iso: string) => Number(iso.slice(0, 4));

/**
 * Event summaries are paragraphs, not titles. This takes the leading claim so
 * the page has a headline, while the full summary is still shown as prose.
 */
export function headline(summary?: string | null, max = 104): string {
  const s = (summary ?? '').trim();
  if (!s) return 'Untitled event';
  const stop = s.search(/[.:;]\s|\s[-\u2014]\s/);
  const first = stop > 24 ? s.slice(0, stop) : s;
  return first.length <= max ? first : truncate(first, max);
}
