import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  PromptControlError,
  getPageInstructions,
  getPromptControl,
  promptHistory,
  restorePromptControl,
  savePromptControl,
  validateTopicOrganization,
} from '../src/prompt-controls.js';

const ACTOR = 'prompt-control-test';
let original: any;

beforeAll(() => {
  original = db.prepare("SELECT * FROM prompt_settings WHERE page_id='haseeb'").get();
});

afterAll(() => {
  db.transaction(() => {
    db.prepare('DELETE FROM prompt_revisions WHERE actor=?').run(ACTOR);
    db.prepare("DELETE FROM audit_log WHERE actor=? AND action LIKE 'prompt.%'").run(ACTOR);
    if (original) {
      db.prepare(
        `INSERT INTO prompt_settings (page_id, instructions, revision, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(page_id) DO UPDATE SET instructions=excluded.instructions,
           revision=excluded.revision, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
      ).run(original.page_id, original.instructions, original.revision, original.updated_at, original.updated_by);
    } else {
      db.prepare("DELETE FROM prompt_settings WHERE page_id='haseeb'").run();
    }
  })();
});

describe('page prompt controls', () => {
  it('keeps the Timeline contract visible and non-editable', () => {
    const control = getPromptControl('timeline');
    expect(control.mode).toBe('evidence');
    expect(() => savePromptControl('timeline', 'x'.repeat(100), ACTOR)).toThrow(PromptControlError);
  });

  it('saves and restores an append-only revision history', () => {
    const instructions = 'Use a more specific mechanism-first opening, connect the claim to named evidence, keep the post native to X, and stop as soon as the argument is complete.';
    const saved = savePromptControl('haseeb', instructions, ACTOR);
    expect(saved.instructions).toBe(instructions);
    expect(getPageInstructions('haseeb')).toBe(instructions);
    const restored = restorePromptControl('haseeb', ACTOR);
    expect(restored.instructions).toBe(restored.default_instructions);
    const history = promptHistory('haseeb');
    expect(history.slice(0, 2).map((item: any) => item.action)).toEqual(['restore', 'save']);
  });

  it('rejects vague instructions before writing them', () => {
    expect(() => savePromptControl('prep', 'Be better.', ACTOR)).toThrow(/at least 80/i);
  });

  it('accepts only topic organizations grounded in known event IDs', () => {
    const valid = new Set(['a', 'b', 'c', 'd']);
    const topic = (index: number) => ({
      title: `Specific mechanism claim number ${index}`,
      description: 'A clear description of the shared source-backed argument and why the grouped evidence belongs together.',
      event_ids: index % 2 ? ['a', 'b'] : ['c', 'd'],
    });
    expect(validateTopicOrganization({ topics: Array.from({ length: 6 }, (_, index) => topic(index)) }, valid)).toHaveLength(6);
    expect(() => validateTopicOrganization({ topics: [...Array.from({ length: 5 }, (_, index) => topic(index)), { ...topic(6), event_ids: ['a', 'missing'] }] }, valid)).toThrow(/unknown evidence/i);
  });

  it('rejects topic titles that would be cut or read as incomplete', () => {
    const valid = new Set(['a', 'b']);
    const base = Array.from({ length: 6 }, (_, index) => ({
      title: `Specific mechanism claim number ${index}`,
      description: 'A clear description of the shared source-backed argument and why the grouped evidence belongs together.',
      event_ids: ['a', 'b'],
    }));
    expect(() => validateTopicOrganization({ topics: [{ ...base[0], title: `${'Long topic '.repeat(12)}mechanism` }, ...base.slice(1)] }, valid)).toThrow(/96 characters/i);
    expect(() => validateTopicOrganization({ topics: [{ ...base[0], title: 'Collateral risk moves from protocols to' }, ...base.slice(1)] }, valid)).toThrow(/incomplete phrase/i);
  });
});
