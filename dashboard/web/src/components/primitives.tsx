import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { categoryLabel, familyOf, hueOf, SIGNIFICANCE_STEPS } from '../lib/taxonomy';
import { formatPin, precisionNote } from '../lib/format';
import './primitives.css';

/* ---------------------------------------------------------------- */
/* identity marks                                                    */
/* ---------------------------------------------------------------- */

/**
 * Category chip. The stored leaf label is always the text; the family only
 * chooses the hue, so colour never carries the distinction alone.
 */
export function CategoryChip({ category, size = 'md' }: { category?: string | null; size?: 'sm' | 'md' }) {
  const family = familyOf(category);
  return (
    <span className={`chip chip-${size}`} title={family ? `${family.label} family` : 'no family'}>
      <span className="chip-dot" style={{ background: hueOf(category) }} aria-hidden="true" />
      {categoryLabel(category)}
    </span>
  );
}

/**
 * Significance is a form first: five ticks, filled to the value, with the
 * numeral always present. The ordinal ramp is the accent hue.
 */
export function SignificanceMeter({ value, showValue = true }: { value?: number | null; showValue?: boolean }) {
  const v = Math.max(0, Math.min(5, value ?? 0));
  return (
    <span className="sig" title={`Significance ${v} of 5`}>
      <span className="sig-ticks" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="sig-tick"
            style={{ background: i <= v ? SIGNIFICANCE_STEPS[v - 1] : 'var(--hairline)' }}
          />
        ))}
      </span>
      {showValue && <span className="sig-value mono">{v}</span>}
      <span className="sr-only">Significance {v} of 5</span>
    </span>
  );
}

/** Subject-time pin. Precision is stated, never implied. */
export function PinDate({ date, precision }: { date: string; precision: string }) {
  return (
    <span className="pin-date" title={`${formatPin(date, precision)}, ${precisionNote[precision] ?? precision}`}>
      <span className="mono">{formatPin(date, precision)}</span>
      {precision !== 'day' && <span className="pin-precision label">{precision}</span>}
    </span>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: 'good' | 'warning' | 'serious' | 'critical' | 'neutral';
  children: ReactNode;
}) {
  return (
    <span className={`status status-${tone}`}>
      <span className="status-glyph" aria-hidden="true">
        <StatusGlyph tone={tone} />
      </span>
      {children}
    </span>
  );
}

/** Status always ships an icon beside its word, so hue never carries meaning alone. */
function StatusGlyph({ tone }: { tone: string }) {
  const p = {
    good: 'M3.5 7.2 6 9.6l4.6-5',
    warning: 'M7 3.4v4.2M7 10.2v.6',
    serious: 'M4.6 3.4v4.2M9.4 3.4v4.2M4.6 10.2v.6M9.4 10.2v.6',
    critical: 'M4 4l6 6M10 4l-6 6',
    neutral: 'M4.4 7h5.2',
  }[tone] ?? 'M4.4 7h5.2';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

export function Tag({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" className="tag tag-button" onClick={onClick}>
        {children}
      </button>
    );
  }
  return <span className="tag">{children}</span>;
}

/* ---------------------------------------------------------------- */
/* surfaces                                                          */
/* ---------------------------------------------------------------- */

export function Panel({
  title,
  action,
  children,
  className = '',
  as: As = 'section',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: any;
}) {
  return (
    <As className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          {typeof title === 'string' ? <h2 className="panel-title">{title}</h2> : title}
          {action}
        </header>
      )}
      {children}
    </As>
  );
}

/** Generated interpretation never wears the reading serif and always says so. */
export function GeneratedBlock({
  model,
  at,
  children,
}: {
  model?: string | null;
  at?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="generated">
      <div className="generated-head label">
        Generated interpretation
        {model && <span className="mono generated-model">{model}</span>}
        {at && <span className="faint">{at.slice(0, 10)}</span>}
      </div>
      <div className="generated-body">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* states                                                            */
/* ---------------------------------------------------------------- */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {children && <p className="state-body muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">
        <StatusChip tone="critical">Could not load</StatusChip>
      </p>
      <p className="state-body muted">{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ height }} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* controls                                                          */
/* ---------------------------------------------------------------- */

export function Button({
  children,
  variant = 'quiet',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  return (
    <button type="button" className={`btn btn-${variant}`} {...rest}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          className={`segmented-item ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="segmented-count mono">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatLine({ items }: { items: { label: string; value: ReactNode; to?: string }[] }) {
  return (
    <dl className="statline">
      {items.map((it) => {
        const body = (
          <>
            <dt className="label">{it.label}</dt>
            <dd className="statline-value">{it.value}</dd>
          </>
        );
        return it.to ? (
          <Link key={it.label} to={it.to} className="statline-item statline-link">
            {body}
          </Link>
        ) : (
          <div key={it.label} className="statline-item">
            {body}
          </div>
        );
      })}
    </dl>
  );
}
