/** The thirteen research categories. Ids match the server's fixed list. */
export const CATEGORIES = [
  { id: 'stablecoins', label: 'Stablecoins', color: 'var(--cat-stablecoins)' },
  { id: 'payments', label: 'Payments', color: 'var(--cat-payments)' },
  { id: 'tokenization_rwas', label: 'Tokenization & RWAs', color: 'var(--cat-rwas)' },
  { id: 'defi', label: 'DeFi', color: 'var(--cat-defi)' },
  { id: 'markets_trading', label: 'Markets & trading', color: 'var(--cat-markets)' },
  { id: 'venture', label: 'Venture', color: 'var(--cat-venture)' },
  { id: 'institutions_tradfi', label: 'Institutions & TradFi', color: 'var(--cat-institutions)' },
  { id: 'chains_infrastructure', label: 'Chains & infrastructure', color: 'var(--cat-chains)' },
  { id: 'security_exploits', label: 'Security & exploits', color: 'var(--cat-security)' },
  { id: 'regulation_policy', label: 'Regulation & policy', color: 'var(--cat-regulation)' },
  { id: 'macro', label: 'Macro', color: 'var(--cat-macro)' },
  { id: 'ai_agents', label: 'AI & agents', color: 'var(--cat-ai)' },
  { id: 'tokens_governance', label: 'Tokens & governance', color: 'var(--cat-tokens)' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const knownCategory = (id: string | null | undefined) => CATEGORIES.find((category) => category.id === id);
