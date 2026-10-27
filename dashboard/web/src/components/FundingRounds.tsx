import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { formatDate, plural } from '../lib/desk';

type Round = {
  id: string;
  company: string;
  amount_text: string;
  amount_usd: number | null;
  stage: string | null;
  investors: string[];
  valuation_text: string | null;
  valuation_usd: number | null;
  added_at: string;
  source_id: string;
  source_title: string | null;
  topic_key: string | null;
};

const STAGE_LABELS: Record<string, string> = { 'pre-seed': 'Pre-seed', 'series a': 'Series A', 'series b': 'Series B', 'series c': 'Series C', 'series d': 'Series D', 'series e': 'Series E' };
const stageLabel = (stage: string | null) => (stage ? STAGE_LABELS[stage] ?? stage.charAt(0).toUpperCase() + stage.slice(1) : '—');

/** Compact dollars: $25M, $1.2B, $900K. Amounts not written in dollars keep their original text. */
export function formatUsd(value: number | null, fallback: string | null) {
  if (value == null) return fallback ?? '—';
  const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [size, suffix] = units.find(([unit]) => value >= unit) ?? [1, ''];
  const scaled = value / size;
  return `$${scaled >= 100 || Number.isInteger(scaled) ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}

/** Funding rounds read from Venture claims. Every name and amount appears word for word in a source. */
export function FundingRounds({ search }: { search: string }) {
  const result = useQuery<{ rounds: Round[] }>('/venture/rounds', [], 60_000);
  const [order, setOrder] = useState<'newest' | 'largest'>('newest');
  const rounds = useMemo(() => (result.data?.rounds ?? [])
    .filter((round) => !search || `${round.company} ${round.investors.join(' ')} ${round.stage ?? ''}`.toLowerCase().includes(search))
    .sort(order === 'largest'
      ? (a, b) => (b.amount_usd ?? -1) - (a.amount_usd ?? -1)
      : (a, b) => String(b.added_at).localeCompare(String(a.added_at))), [result.data, search, order]);
  const linkFor = (round: Round) => round.topic_key ? `/topics/${encodeURIComponent(round.topic_key)}` : `/sources/${encodeURIComponent(round.source_id)}`;

  return (
    <section aria-labelledby="rounds-heading" className="mb-7 rounded-lg border-2 border-[var(--line-strong)] bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 id="rounds-heading" className="text-[15px] font-medium text-foreground">Funding rounds</h2>
          <p className="mt-0.5 font-mono text-[11px] text-dim">{result.data ? plural(rounds.length, 'round') : 'Loading'} · names and amounts exactly as written in your stored evidence</p>
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-dim">
          <span>Order</span>
          <select value={order} onChange={(event) => setOrder(event.target.value as 'newest' | 'largest')} className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px] text-foreground">
            <option value="newest">Newest first</option>
            <option value="largest">Largest first</option>
          </select>
        </label>
      </div>
      {result.error ? <p role="alert" className="px-4 py-4 text-[13px] text-[var(--danger-text)]">Funding rounds could not load. Refresh to try again.</p> : null}
      {result.data && !rounds.length ? (
        <p className="px-4 py-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {search ? 'No rounds match your search.' : 'No funding rounds yet. Forward funding announcements and they appear here once processed.'}
        </p>
      ) : null}
      {rounds.length ? (
        <>
          <table className="hidden w-full text-left text-[13px] md:table">
            <thead className="font-mono text-[11px] tracking-[0.06em] text-dim uppercase">
              <tr className="border-b border-[var(--line)]">
                <th scope="col" className="px-4 py-2 font-normal">Company</th>
                <th scope="col" className="px-3 py-2 font-normal">Raised</th>
                <th scope="col" className="px-3 py-2 font-normal">Round</th>
                <th scope="col" className="px-3 py-2 font-normal">Investors</th>
                <th scope="col" className="px-3 py-2 font-normal">Valuation</th>
                <th scope="col" className="px-4 py-2 font-normal">Added</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr key={round.id} className="border-b border-[var(--line)] last:border-b-0 align-top">
                  <td className="px-4 py-2.5"><Link className="font-medium text-foreground hover:text-[var(--accent-text)]" to={linkFor(round)}>{round.company}</Link></td>
                  <td className="px-3 py-2.5 font-mono tabular-nums" title={round.amount_text}>{formatUsd(round.amount_usd, round.amount_text)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{stageLabel(round.stage)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{round.investors.join(', ') || '—'}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-muted-foreground" title={round.valuation_text ?? undefined}>{round.valuation_text ? formatUsd(round.valuation_usd, round.valuation_text) : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] whitespace-nowrap text-dim">{formatDate(round.added_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-[var(--line)] md:hidden">
            {rounds.map((round) => (
              <li key={round.id} className="px-4 py-3">
                <Link to={linkFor(round)} className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground">{round.company}</span>
                  <span className="font-mono text-[13px] tabular-nums text-foreground">{formatUsd(round.amount_usd, round.amount_text)}</span>
                </Link>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-dim">
                  {[stageLabel(round.stage), round.investors.join(', '), round.valuation_text ? `${formatUsd(round.valuation_usd, round.valuation_text)} valuation` : '', `added ${formatDate(round.added_at)}`].filter((part) => part && part !== '—').join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
