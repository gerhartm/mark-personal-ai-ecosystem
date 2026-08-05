import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db.js';

const { runHermesAgent } = vi.hoisted(() => ({
  runHermesAgent: vi.fn(),
}));

vi.mock('../src/hermes-client.js', async () => {
  const actual = await vi.importActual<any>('../src/hermes-client.js');
  return { ...actual, runHermesAgent };
});

const { intelligenceStatus, refreshIntelligence } = await import('../src/intelligence.js');

const previousBase = process.env.HERMES_BASE_URL;
const previousBrief = db
  .prepare("SELECT value FROM generation_meta WHERE key = 'intelligence.latest'")
  .get() as { value: string } | undefined;
const previousAttempt = db
  .prepare("SELECT value FROM generation_meta WHERE key = 'intelligence.last_attempt_at'")
  .get() as { value: string } | undefined;

beforeAll(() => {
  process.env.HERMES_BASE_URL = 'http://hermes.test';
  db.prepare("DELETE FROM generation_meta WHERE key IN ('intelligence.latest', 'intelligence.last_attempt_at')").run();
});

afterAll(() => {
  if (previousBrief) {
    db.prepare(`
      INSERT INTO generation_meta (key, value)
      VALUES ('intelligence.latest', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(previousBrief.value);
  } else {
    db.prepare("DELETE FROM generation_meta WHERE key = 'intelligence.latest'").run();
  }
  if (previousAttempt) {
    db.prepare(`
      INSERT INTO generation_meta (key, value)
      VALUES ('intelligence.last_attempt_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(previousAttempt.value);
  } else {
    db.prepare("DELETE FROM generation_meta WHERE key = 'intelligence.last_attempt_at'").run();
  }
  db.prepare("DELETE FROM audit_log WHERE actor = 'test' AND action = 'intelligence.refresh'").run();
  if (previousBase == null) delete process.env.HERMES_BASE_URL;
  else process.env.HERMES_BASE_URL = previousBase;
});

describe('Hermes intelligence briefing', () => {
  it('accepts a bounded sourced briefing and preserves it in the existing database', async () => {
    runHermesAgent.mockResolvedValueOnce({
      text: `Research completed with verified sources.\n\n\`\`\`json\n${JSON.stringify({
        headline: 'Governance and deployment changes deserve a focused review.',
        summary: 'Verified protocol updates create a small number of meaningful changes that should be compared with the stored thesis before Mark speaks or publishes.',
        needs_attention: [
          { title: 'Review the deployment change', why: 'It alters the current stored picture.', urgency: 'today' },
        ],
        changes: [
          {
            title: 'Protocol documentation was updated',
            detail: 'The primary documentation records a material implementation change.',
            source_label: 'Protocol documentation',
            source_url: 'https://example.com/protocol-change',
            published_at: '2026-08-05',
          },
        ],
        suggested_actions: [
          { title: 'Challenge the stored thesis', reason: 'Test whether the new evidence changes it.', target: 'ask', query: 'How does the deployment change affect the stored thesis?' },
        ],
        watchlists: [
          { label: 'Aave', status: 'moving', detail: 'A verified change is worth following.' },
        ],
      })}\n\`\`\``,
    });

    const brief = await refreshIntelligence('test', 'manual');
    expect(brief.changes).toHaveLength(1);
    expect(brief.sources_reviewed).toBe(1);
    expect(intelligenceStatus().brief?.id).toBe(brief.id);
    expect(intelligenceStatus().last_attempt_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(runHermesAgent).toHaveBeenCalledTimes(1);
  });

  it('rejects unsourced output and keeps the last accepted briefing', async () => {
    const before = intelligenceStatus().brief;
    runHermesAgent.mockResolvedValueOnce({
      text: JSON.stringify({
        headline: 'This output has no verifiable changes.',
        summary: 'It is long enough to pass the textual minimum but contains no real source URL and must never replace accepted intelligence.',
        changes: [],
      }),
    });

    await expect(refreshIntelligence('test', 'manual')).rejects.toMatchObject({ code: 'sources_missing' });
    expect(intelligenceStatus().brief?.id).toBe(before?.id);
  });
});
