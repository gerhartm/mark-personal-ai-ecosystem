import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

const evidenceId = /\[(sha256:[a-f0-9]{64}|\d{4}-\d{2}-\d{2}-\d{4})\](?!\()/gi;

export function stripEvidenceIds(value: string) {
  return String(value ?? '')
    .replace(evidenceId, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function linkEvidence(value: string) {
  return String(value ?? '').replace(evidenceId, (_match, id: string) => {
    const source = id.toLowerCase().startsWith('sha256:');
    const href = source ? `/source/${encodeURIComponent(id.toLowerCase())}` : `/event/${id}`;
    return `[${source ? 'source' : 'evidence'}](${href} "${id}")`;
  });
}

export function EvidenceMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children: label }) => href?.startsWith('/')
          ? <Link to={href}>{label}</Link>
          : <a href={href} target="_blank" rel="noreferrer">{label}</a>,
      }}
    >
      {linkEvidence(children)}
    </ReactMarkdown>
  );
}
