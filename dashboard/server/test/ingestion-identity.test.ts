import { describe, expect, it } from 'vitest';
import {
  CaptureInputError,
  normalizeCaptureUrl,
  prepareSource,
  textSourceId,
  urlSourceId,
} from '../src/ingestion.js';

describe('capture identity contract', () => {
  it('matches the canonical Python URL identity fixtures', () => {
    const noisy = 'https://Example.com/path/?utm_source=x&b=2&a=1#frag';
    expect(normalizeCaptureUrl(noisy)).toBe('https://example.com/path?a=1&b=2');
    expect(urlSourceId(noisy)).toBe('sha256:94ab2087f4c4ce19d248cfbab9e2b19cc5065e443510f7f37cab7347aaa7df0c');

    const encoded = 'https://example.com/a%20b/?z=%7E&a=%2F';
    expect(normalizeCaptureUrl(encoded)).toBe('https://example.com/a%20b?a=%2F&z=~');
    expect(urlSourceId(encoded)).toBe('sha256:a29d77b68ac5e960bd3250f61b3983e6f07fc90e7145212b32d199eba6e66231');
  });

  it('matches the canonical text identity and creates the exact private target', () => {
    expect(textSourceId('alpha  \nbeta\n')).toBe(
      'sha256:bbfb79e82216bd2db1ad2c507d44ddf80aeb12f64f9562056afe93aad43154d9',
    );
    const source = prepareSource({ kind: 'text', value: '# Research note\n\nEvidence.' });
    expect(source.title).toBe('Research note');
    expect(source.targetUri).toBe(
      `viking://user/hermes/resources/crypto/sources/source-${source.sourceId.slice(7)}.md`,
    );
  });

  it('normalizes a supplied title to one line', () => {
    const source = prepareSource({
      kind: 'url',
      value: 'https://example.com/report',
      title: '  Market   structure\nreview  ',
    });
    expect(source.title).toBe('Market structure review');
  });

  it('refuses credentials embedded in a URL', () => {
    expect(() => normalizeCaptureUrl('https://user:secret@example.com/report')).toThrow(CaptureInputError);
  });

  it('refuses local and private network targets before acquisition', () => {
    expect(() => normalizeCaptureUrl('http://127.0.0.1/private')).toThrow(/public source URL/i);
    expect(() => normalizeCaptureUrl('http://10.0.0.4/private')).toThrow(/public source URL/i);
    expect(() => normalizeCaptureUrl('http://[::1]/private')).toThrow(/public source URL/i);
    expect(() => normalizeCaptureUrl('http://localhost/private')).toThrow(/public source URL/i);
  });
});
