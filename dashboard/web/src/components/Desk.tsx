import type { ReactNode } from 'react';

export function ViewHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
      <div>
        <h1 className="mb-1.5 text-[23px] font-medium tracking-tight text-foreground">{title}</h1>
        {children ? <p className="max-w-[62ch] font-serif text-[15px] leading-relaxed text-pretty text-muted-foreground">{children}</p> : null}
      </div>
      {actions ? <div className="desk-head-actions w-full sm:w-auto">{actions}</div> : null}
    </header>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="desk-eyebrow mb-3">{children}</p>;
}

export function Chip({
  children,
  active = false,
  onClick,
  label,
  type = 'button',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  label?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-2.5 py-1 font-mono text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brass)] ${active ? 'border-[var(--brass)] bg-[color-mix(in_srgb,var(--brass)_14%,transparent)] text-foreground' : 'border-[var(--line-strong)] text-muted-foreground hover:border-[var(--brass)] hover:text-foreground'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="desk-empty" role="status">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="desk-loading" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="desk-error" role="alert">
      <strong>This view could not load.</strong>
      <p>{error.message}</p>
      {retry ? <button type="button" className="desk-button" onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function Provenance({ source, when, kind }: { source?: string; when?: string; kind?: string }) {
  const parts = [
    source ? <span className="text-[var(--accent-text)]">{source}</span> : null,
    kind ? <span>{kind}</span> : null,
    when ? <time className="text-[var(--date-text)]">{when}</time> : null,
  ].filter(Boolean);
  // Each separator ends the item before it, so a wrapped line never starts with one.
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-[7px] gap-y-1 font-mono text-[11px] text-dim [overflow-wrap:anywhere]">
      {parts.map((part, index) => (
        <span key={index} className="min-w-0">
          {part}
          {index < parts.length - 1 ? <span aria-hidden="true" className="ml-[7px] text-[var(--line-strong)]">/</span> : null}
        </span>
      ))}
    </div>
  );
}
