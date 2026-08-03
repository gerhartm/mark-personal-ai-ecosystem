/**
 * The eleven-label taxonomy is stored and displayed verbatim, everywhere.
 * Families below are a VISUAL LENS ONLY: they decide which of four validated
 * hues a mark wears, and nothing else. No category is ever rewritten, merged,
 * or discarded, and the leaf label is always present as text so colour never
 * carries the distinction alone.
 */

export type FamilyKey = 'narrative' | 'protocol' | 'risk' | 'rules';

export interface Family {
  key: FamilyKey;
  label: string;
  hue: string;
  categories: string[];
}

export const FAMILIES: Family[] = [
  {
    key: 'narrative',
    label: 'Markets and narrative',
    hue: 'var(--family-narrative)',
    categories: ['narrative', 'macro'],
  },
  {
    key: 'protocol',
    label: 'Protocol mechanics',
    hue: 'var(--family-protocol)',
    categories: ['defi_mechanics', 'protocol_launch', 'tokenomics'],
  },
  {
    key: 'risk',
    label: 'Risk and incidents',
    hue: 'var(--family-risk)',
    categories: ['exploit_incident', 'infrastructure'],
  },
  {
    key: 'rules',
    label: 'Rules and capital',
    hue: 'var(--family-rules)',
    categories: ['regulatory', 'governance', 'funding', 'partnerships'],
  },
];

const BY_CATEGORY = new Map<string, Family>();
for (const f of FAMILIES) for (const c of f.categories) BY_CATEGORY.set(c, f);

export const familyOf = (category?: string | null): Family | undefined =>
  category ? BY_CATEGORY.get(category) : undefined;

export const hueOf = (category?: string | null): string =>
  familyOf(category)?.hue ?? 'var(--ink-faint)';

/** Display form of a stored label. The stored value itself never changes. */
export const categoryLabel = (category?: string | null): string =>
  category ? category.replace(/_/g, ' ') : 'uncategorised';

export const SIGNIFICANCE_STEPS = [
  'var(--sig-1)',
  'var(--sig-2)',
  'var(--sig-3)',
  'var(--sig-4)',
  'var(--sig-5)',
];

export const ENTITY_TYPES = ['protocols', 'people', 'tokens', 'chains', 'figures'] as const;

export const ENTITY_LABEL: Record<string, string> = {
  protocols: 'Protocols',
  people: 'People',
  tokens: 'Tokens',
  chains: 'Chains',
  figures: 'Figures',
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  note: 'Note',
  audio: 'Audio',
  youtube: 'YouTube',
  article: 'Article',
  instagram: 'Instagram',
  video: 'Video',
};

export const TEMPLATE_LABEL: Record<string, string> = {
  twitter_thread: 'Thread',
  month_in_review: 'Month in review',
  speaking_prep: 'Speaking prep',
  linkedin_post: 'LinkedIn post',
  year_in_review: 'Year in review',
};

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  factual: 'Factual',
  connection: 'Connection',
  principle: 'Principle',
  cite_source: 'Cite source',
};
