import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const captured = vi.hoisted(() => ({ values: [] as any[], fail: false, sourceId: '' }));
vi.mock('../src/ingestion.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/ingestion.js')>(),
  captureSource: vi.fn(async input => {
    if (captured.fail) throw new Error('provider unavailable');
    captured.values.push(input);
    return { source_id: captured.sourceId };
  }),
}));
const folder = mkdtempSync(join(tmpdir(), 'document-import-test-'));
let database: typeof import('../src/db.js');
let documents: typeof import('../src/documents.js');
let imports: typeof import('../src/imports.js');
const document = (filename: string) => ({ kind: 'document' as const, filename, value: readFileSync(resolve('test/fixtures/documents', filename)).toString('base64'), source_type: 'transcript' as const });
beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  documents = await import('../src/documents.js');
  imports = await import('../src/imports.js');
  database.run('DELETE FROM import_items'); database.run('DELETE FROM import_batches');
  captured.sourceId = database.one<any>('SELECT source_id FROM sources LIMIT 1').source_id;
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });

describe('Word and PDF import', () => {
  for (const extension of ['doc', 'docx', 'pdf']) it(`extracts an actual ${extension} document with speaker labels`, async () => {
    const source = await documents.extractDocument(document(`transcript.${extension}`));
    expect(source).toMatchObject({ kind: 'text', title: `transcript.${extension}`, source_type: 'transcript' });
    expect(source.value).toContain('Alice: The team discussed a fixed-rate lending vault.');
    expect(source.value).toContain('Bob: Preserve the source wording and speaker labels.');
  });
  it('rejects empty, oversized, mislabeled and malformed uploads before accepting a batch', () => {
    for (const invalid of [
      { ...document('transcript.pdf'), value: '' },
      { ...document('transcript.pdf'), filename: 'transcript.doc' },
      { ...document('transcript.pdf'), filename: 'transcript.exe' },
      { ...document('transcript.pdf'), value: Buffer.alloc(5_000_001).toString('base64') },
      { ...document('transcript.pdf'), value: '!!!!' },
    ]) expect(() => imports.enqueueImport([{ kind: 'text', value: 'Good text' }, invalid], 'test')).toThrow();
    expect(database.one<any>('SELECT count(*) n FROM import_items')?.n).toBe(0);
  });
  it('returns actionable errors for unreadable PDFs and documents without text', async () => {
    await expect(documents.extractDocument({ ...document('transcript.pdf'), value: Buffer.from('%PDF-broken').toString('base64') })).rejects.toThrow(/could not be read/);
    await expect(documents.extractDocument(document('no-text.pdf'))).rejects.toThrow(/OCR/);
  });
  it('durably accepts mixed files before extraction, then uses the canonical capture path', async () => {
    const result = imports.enqueueImport([document('transcript.doc'), document('transcript.docx'), document('transcript.pdf'), { kind: 'text', value: 'A normal text source remains supported.' }], 'test');
    expect(result.count).toBe(4);
    expect(captured.values).toHaveLength(0);
    expect(imports.listImports().filter((i: any) => i.status === 'queued')).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(await imports.processNextImport()).toBe(true);
    expect(captured.values).toHaveLength(4);
    expect(captured.values.slice(0, 3).every(source => source.kind === 'text' && source.value.includes('Alice:'))).toBe(true);
    expect(database.all<any>('SELECT payload_json FROM import_items').every(row => row.payload_json === '{}')).toBe(true);
  });
  it('retains extracted text when memory is unavailable and resumes without losing the document', async () => {
    imports.enqueueImport([document('transcript.docx')], 'test');
    captured.fail = true;
    expect(await imports.processNextImport()).toBe(false);
    const failed = database.one<any>('SELECT * FROM import_items ORDER BY id DESC LIMIT 1');
    expect(failed.status).toBe('queued');
    expect(JSON.parse(failed.payload_json)).toMatchObject({ kind: 'text', value: expect.stringContaining('Alice:') });
    captured.fail = false;
    database.run("UPDATE import_items SET not_before='2000-01-01' WHERE id=?", failed.id);
    expect(await imports.processNextImport()).toBe(true);
  });
  it('surfaces permanent extraction failures for the retry interface without blocking later sources', async () => {
    imports.enqueueImport([document('no-text.pdf'), { kind: 'text', value: 'The next item still processes.' }], 'test');
    expect(await imports.processNextImport()).toBe(false);
    expect(imports.listImports().find((i: any) => i.title === 'no-text.pdf')).toMatchObject({ status: 'failed', last_error: expect.stringContaining('OCR') });
    expect(await imports.processNextImport()).toBe(true);
  });
});
