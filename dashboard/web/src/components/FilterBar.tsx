import type { SetURLSearchParams } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { FAMILIES, categoryLabel, hueOf } from '../lib/taxonomy';
import { IconClose, IconSearch } from './icons';
import './filterbar.css';

type Field = 'q' | 'family' | 'category' | 'significance' | 'sourceType' | 'notes' | 'sort';

/**
 * Filters live in one row above everything they scope, never inside a card.
 * Every filter is reflected in the URL, so back restores the exact view.
 */
export function FilterBar({
  value,
  onChange,
  show,
}: {
  value: URLSearchParams;
  onChange: SetURLSearchParams;
  show: Field[];
}) {
  const { data: facets } = useQuery('/facets');

  const set = (key: string, v: string | null) => {
    onChange((prev) => {
      const next = new URLSearchParams(prev);
      if (v == null || v === '') next.delete(key);
      else next.set(key, v);
      return next;
    });
  };

  const toggleList = (key: string, item: string) => {
    const current = value.get(key)?.split(',').filter(Boolean) ?? [];
    const next = current.includes(item) ? current.filter((c) => c !== item) : [...current, item];
    set(key, next.join(','));
  };

  const activeFamilies = value.get('family')?.split(',').filter(Boolean) ?? [];
  const activeCategories = value.get('category')?.split(',').filter(Boolean) ?? [];
  const activeSources = value.get('sourceType')?.split(',').filter(Boolean) ?? [];
  const sigMin = value.get('significanceMin');
  const activeCount =
    activeFamilies.length +
    activeCategories.length +
    activeSources.length +
    (value.get('q') ? 1 : 0) +
    (sigMin ? 1 : 0) +
    (value.get('hasNotes') ? 1 : 0);

  return (
    <div className="filterbar" role="search">
      {show.includes('q') && (
        <label className="filter-search">
          <span className="filter-search-icon">
            <IconSearch />
          </span>
          <span className="sr-only">Search events</span>
          <input
            type="search"
            placeholder="Search events"
            value={value.get('q') ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
        </label>
      )}

      {show.includes('family') && (
        <div className="filter-group" role="group" aria-label="Category family">
          {FAMILIES.map((f) => {
            const active = activeFamilies.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                className={`filter-pill ${active ? 'is-active' : ''}`}
                onClick={() => toggleList('family', f.key)}
                title={`${f.label}: ${f.categories.map(categoryLabel).join(', ')}`}
              >
                <span className="filter-dot" style={{ background: f.hue }} aria-hidden="true" />
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {show.includes('category') && facets && (
        <details className="filter-more">
          <summary className="filter-pill">
            Category
            {activeCategories.length > 0 && <span className="filter-count mono">{activeCategories.length}</span>}
          </summary>
          <div className="filter-panel">
            <p className="label filter-panel-note">
              The stored eleven-label taxonomy, verbatim. Families above group these for colour only.
            </p>
            <div className="filter-panel-grid">
              {facets.categories.map((c: any) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={activeCategories.includes(c.value)}
                  className={`filter-pill filter-pill-sm ${activeCategories.includes(c.value) ? 'is-active' : ''}`}
                  onClick={() => toggleList('category', c.value)}
                >
                  <span className="filter-dot" style={{ background: hueOf(c.value) }} aria-hidden="true" />
                  {categoryLabel(c.value)}
                  <span className="filter-count mono">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
      )}

      {show.includes('significance') && (
        <label className="filter-inline">
          <span className="label">Significance at least</span>
          <select value={sigMin ?? ''} onChange={(e) => set('significanceMin', e.target.value)}>
            <option value="">any</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.includes('sourceType') && facets && (
        <label className="filter-inline">
          <span className="label">Source</span>
          <select
            value={activeSources[0] ?? ''}
            onChange={(e) => set('sourceType', e.target.value)}
          >
            <option value="">any</option>
            {facets.sourceTypes.map((s: any) => (
              <option key={s.value} value={s.value}>
                {s.value} ({s.count})
              </option>
            ))}
          </select>
        </label>
      )}

      {show.includes('notes') && (
        <label className="filter-inline">
          <span className="label">Your notes</span>
          <select value={value.get('hasNotes') ?? ''} onChange={(e) => set('hasNotes', e.target.value)}>
            <option value="">any</option>
            <option value="true">has notes</option>
            <option value="false">no notes</option>
          </select>
        </label>
      )}

      {show.includes('sort') && (
        <label className="filter-inline">
          <span className="label">Sort</span>
          <select value={value.get('sort') ?? 'subject'} onChange={(e) => set('sort', e.target.value)}>
            <option value="subject">subject date</option>
            <option value="capture">capture date</option>
            <option value="significance">significance</option>
          </select>
        </label>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          className="filter-clear"
          onClick={() => onChange(new URLSearchParams())}
        >
          <IconClose />
          Clear {activeCount === 1 ? 'the filter' : `all ${activeCount} filters`}
        </button>
      )}
    </div>
  );
}
