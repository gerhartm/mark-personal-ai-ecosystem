import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CaptureInputError, type CaptureRequest } from './ingestion.js';

export type DocumentRequest = { kind: 'document'; value: string; filename: string; title?: string; source_type?: CaptureRequest['source_type'] };
export const MAX_DOCUMENT_BYTES = 5_000_000;
const magic: Record<string, Buffer> = {
  '.pdf': Buffer.from('%PDF-'), '.doc': Buffer.from('d0cf11e0a1b11ae1', 'hex'), '.docx': Buffer.from('504b0304', 'hex'),
};

export function validateDocument(input: DocumentRequest) {
  if (typeof input.filename !== 'string' || !magic[extname(input.filename).toLowerCase()]) {
    throw new CaptureInputError('unsupported_document', 'Choose a Word (.doc or .docx) document or PDF.');
  }
  if (typeof input.value !== 'string' || !input.value.length || input.value.length % 4 !== 0 || input.value.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.value)) {
    throw new CaptureInputError('invalid_document', 'The document is empty, invalid, or exceeds the 5 MB file limit.');
  }
  const bytes = Buffer.from(input.value, 'base64');
  const extension = extname(input.filename).toLowerCase();
  if (bytes.length > MAX_DOCUMENT_BYTES || !bytes.subarray(0, magic[extension].length).equals(magic[extension])) {
    throw new CaptureInputError('invalid_document', 'The file contents do not match its extension. Export it as a Word document or PDF and try again (maximum 5 MB).');
  }
  if (input.source_type && !['note', 'transcript', 'telegram', 'article'].includes(input.source_type)) {
    throw new CaptureInputError('invalid_document', 'Choose a supported source type.');
  }
  return { bytes, extension, title: String(input.title || input.filename).replace(/[\x00-\x1f]/g, ' ').slice(0, 200) };
}

let extracting = false;
export async function extractDocument(input: DocumentRequest): Promise<CaptureRequest> {
  const { bytes, extension, title } = validateDocument(input);
  if (extracting) throw new Error('Document extractor busy');
  extracting = true;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'crypto-document-'));
    const path = join(directory, `source${extension}`);
    await writeFile(path, bytes, { mode: 0o600 });
    // Parsers run out of process with bounded time/output. No uploaded filename is executed.
    const command = extension === '.pdf' ? 'pdftotext' : extension === '.doc' ? 'antiword' : process.execPath;
    const adjacentWorker = fileURLToPath(new URL('./document-worker.js', import.meta.url));
    const worker = existsSync(adjacentWorker) ? adjacentWorker : fileURLToPath(new URL('../dist/document-worker.js', import.meta.url));
    const args = extension === '.pdf' ? ['-enc', 'UTF-8', '-layout', path, '-'] : extension === '.doc' ? ['-m', 'UTF-8.txt', path] : ['--max-old-space-size=128', worker, path];
    let text: string;
    try {
      text = await new Promise<string>((resolve, reject) => execFile(command, args, { timeout: 30_000, maxBuffer: 1_100_000, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new Error('Document extraction is not installed');
      throw new CaptureInputError('document_unreadable', 'This document could not be read. It may be damaged, password-protected, too large after extraction, or too complex. Export an unlocked, smaller Word/PDF or a text transcript and retry.');
    }
    text = text.replace(/\r\n/g, '\n').replace(/\x00/g, '').trim();
    if (!text) throw new CaptureInputError('document_no_text', 'No readable text was found. For a scanned or image-only PDF, run OCR first or upload a text transcript.');
    if (text.length > 250_000) throw new CaptureInputError('document_too_long', 'The extracted document exceeds 250,000 characters. Split it into smaller files.');
    return { kind: 'text', value: text, title, source_type: input.source_type || 'transcript' };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    extracting = false;
  }
}
