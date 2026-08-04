import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useQuery } from '../lib/api';
import { Panel, Segmented, Skeleton, StatusChip } from '../components/primitives';
import { IconArrow } from '../components/icons';
import './capture.css';

type CaptureKind = 'url' | 'text';

type CaptureResult = {
  receipt_id: number;
  status: 'ready' | 'duplicate';
  source_id: string;
  title: string;
  source_type: string;
};

type Receipt = {
  id: number;
  created_at: string;
  status: 'processing' | 'ready' | 'duplicate' | 'failed';
  source_id: string;
  kind: CaptureKind;
  title: string;
  source_type: string;
  source_url?: string;
  character_count?: number;
  error_code?: string;
};

const STATUS_LABEL: Record<Receipt['status'], string> = {
  processing: 'Processing',
  ready: 'Ready',
  duplicate: 'Already captured',
  failed: 'Failed',
};

const STATUS_TONE: Record<Receipt['status'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  processing: 'neutral',
  ready: 'good',
  duplicate: 'warning',
  failed: 'critical',
};

export function Capture() {
  const [kind, setKind] = useState<CaptureKind>('url');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useQuery<{ configured: boolean; connected: boolean; receipts: Receipt[] }>('/ingestion');

  const canSubmit = useMemo(() => value.trim().length > 0 && !busy, [value, busy]);

  const switchKind = (next: CaptureKind) => {
    setKind(next);
    setValue('');
    setResult(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const saved = await api<CaptureResult>('/ingestion', {
        method: 'POST',
        body: JSON.stringify({ kind, title: title.trim() || undefined, value }),
      });
      setResult(saved);
      setValue('');
      setTitle('');
      invalidate('/ingestion');
      invalidate('/sources');
      history.refetch();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The source could not be added.');
      invalidate('/ingestion');
      history.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page capture-page">
      <header className="page-head capture-head">
        <div className="page-title">
          <p className="label">Memory intake</p>
          <h1>Capture a source</h1>
          <p className="page-sub">
            Add one trusted source to the Crypto Intelligence branch. The system creates a stable identity, prevents
            duplicates, and sends the source to Mark&apos;s private memory.
          </p>
        </div>
        {history.data && (
          <StatusChip tone={history.data.connected ? 'good' : 'warning'}>
            {history.data.connected
              ? 'Private memory connected'
              : history.data.configured
                ? 'Memory connection unavailable'
                : 'Memory connection pending'}
          </StatusChip>
        )}
      </header>

      <div className="capture-layout">
        <Panel
          className="capture-form-panel"
          title="New source"
          action={
            <Segmented<CaptureKind>
              label="Source format"
              value={kind}
              onChange={switchKind}
              options={[
                { value: 'url', label: 'URL' },
                { value: 'text', label: 'Text' },
              ]}
            />
          }
        >
          <form className="capture-form" onSubmit={submit}>
            <label className="field">
              <span className="field-label">Title <span className="field-optional">optional</span></span>
              <input
                className="field-control"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder={kind === 'url' ? 'Generated from the URL if left blank' : 'Generated from the first line'}
                autoComplete="off"
              />
            </label>

            {kind === 'url' ? (
              <label className="field">
                <span className="field-label">Public source URL</span>
                <input
                  className="field-control mono"
                  type="url"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="https://example.com/research"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <span className="field-help">Tracking parameters and fragments are removed before identity is calculated.</span>
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Source text</span>
                <textarea
                  className="field-control capture-textarea read"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Paste a research note, transcript, briefing, or source excerpt."
                  maxLength={250000}
                  required
                />
                <span className="field-help tabular">{value.length.toLocaleString()} of 250,000 characters</span>
              </label>
            )}

            <div className="capture-actions">
              <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
                {busy ? 'Adding to memory' : 'Add to memory'}
                {!busy && <IconArrow />}
              </button>
              <p className="capture-contract">
                A source is marked ready only after private memory accepts it. Failed attempts never appear as ready.
              </p>
            </div>
          </form>

          <div className="capture-feedback" aria-live="polite">
            {busy && (
              <div className="capture-result capture-result-processing">
                <StatusChip tone="neutral">Processing</StatusChip>
                <p>OpenViking is acquiring and indexing this source. Keep this page open.</p>
              </div>
            )}
            {result && (
              <div className="capture-result capture-result-success">
                <StatusChip tone={result.status === 'ready' ? 'good' : 'warning'}>
                  {result.status === 'ready' ? 'Ready' : 'Already captured'}
                </StatusChip>
                <div>
                  <p className="capture-result-title">{result.title}</p>
                  <p className="muted">
                    {result.status === 'ready'
                      ? 'The source is now registered and available to the intelligence system.'
                      : 'The canonical copy already exists, so no duplicate was created.'}
                  </p>
                </div>
                <Link className="btn" to={`/source/${result.source_id}`}>
                  Open source
                </Link>
              </div>
            )}
            {error && (
              <div className="capture-result capture-result-error" role="alert">
                <StatusChip tone="critical">Not added</StatusChip>
                <p>{error}</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="capture-history-panel" title="Recent receipts">
          <ReceiptHistory state={history} />
        </Panel>
      </div>
    </div>
  );
}

function ReceiptHistory({ state }: { state: ReturnType<typeof useQuery<{
  configured: boolean;
  connected: boolean;
  receipts: Receipt[];
}>> }) {
  if (state.error) {
    return (
      <div className="capture-history-state">
        <StatusChip tone="critical">Could not load receipts</StatusChip>
        <button type="button" className="btn" onClick={state.refetch}>Try again</button>
      </div>
    );
  }
  if (!state.data) return <div className="capture-history-loading"><Skeleton rows={5} height={54} /></div>;
  if (!state.data.receipts.length) {
    return (
      <div className="capture-history-state">
        <p className="capture-empty-title">No captures yet</p>
        <p className="muted">The first source receipt will appear here with its exact status and identity.</p>
      </div>
    );
  }

  return (
    <ol className="receipt-list">
      {state.data.receipts.map((receipt) => (
        <li className="receipt" key={receipt.id}>
          <div className="receipt-main">
            <StatusChip tone={STATUS_TONE[receipt.status] ?? 'neutral'}>
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </StatusChip>
            <p className="receipt-title">{receipt.title}</p>
            <p className="receipt-meta">
              <span>{receipt.source_type}</span>
              <time dateTime={receipt.created_at}>{formatReceiptTime(receipt.created_at)}</time>
            </p>
          </div>
          {receipt.source_id && receipt.status !== 'failed' ? (
            <Link className="receipt-id mono" to={`/source/${receipt.source_id}`} title={receipt.source_id}>
              {receipt.source_id.slice(7, 19)}
            </Link>
          ) : (
            <span className="receipt-id mono">{receipt.error_code ?? 'not stored'}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function formatReceiptTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
