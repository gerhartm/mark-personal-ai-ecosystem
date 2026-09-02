import type { ReactNode } from 'react';

export function ViewHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="desk-view-head">
      <div>
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {actions ? <div className="desk-head-actions">{actions}</div> : null}
    </header>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="desk-eyebrow">{children}</p>;
}

export function Chip({
  children,
  active = false,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`desk-chip ${active ? 'is-active' : ''}`} onClick={onClick}>
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
  return (
    <div className="desk-provenance">
      {source ? <span className="is-source">{source}</span> : null}
      {kind ? <span>{kind}</span> : null}
      {when ? <time>{when}</time> : null}
    </div>
  );
}
