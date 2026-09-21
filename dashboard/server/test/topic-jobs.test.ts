import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const mock = vi.hoisted(() => ({ rebuild: vi.fn() }));
vi.mock('../src/prompt-controls.js', () => ({ rebuildTopics: mock.rebuild }));
const folder = mkdtempSync(join(tmpdir(), 'crypto-topic-job-'));
let database: typeof import('../src/db.js');
let jobs: typeof import('../src/topic-jobs.js');
beforeAll(async () => {
  copyFileSync(resolve('../data/crypto-intelligence.db'), join(folder, 'test.db'));
  process.env.CRYPTO_DB = join(folder, 'test.db');
  database = await import('../src/db.js');
  jobs = await import('../src/topic-jobs.js');
});
afterAll(() => { database?.db.close(); rmSync(folder, { recursive: true, force: true }); });
describe('persistent background topic rebuild', () => {
  it('persists queued work and coalesces repeated clicks', () => {
    const first = jobs.queueTopicRebuild('mark');
    expect(jobs.queueTopicRebuild('mark').id).toBe(first.id);
    expect(jobs.topicRebuildStatus()).toEqual(first);
    expect(JSON.parse(database.one<any>("SELECT value FROM app_settings WHERE key='topics.rebuild.job'")!.value).status).toBe('queued');
  });
  it('keeps one generation active and persists its result after the request has returned', async () => {
    let finish: (value: any) => void = () => {};
    mock.rebuild.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const active = jobs.processTopicRebuildJob();
    const current = jobs.topicRebuildStatus();
    expect(current.status).toBe('running');
    expect(await jobs.processTopicRebuildJob()).toBe(false);
    expect(jobs.queueTopicRebuild('mark').id).toBe(current.id);
    finish({ topics: [{ title: 'Existing source-backed organization' }] });
    expect(await active).toBe(true);
    expect(mock.rebuild).toHaveBeenCalledTimes(1);
    expect(jobs.topicRebuildStatus()).toMatchObject({ status: 'ready', topic_count: 1 });
  });
  it('shows a safe failure and permits a new explicit retry', async () => {
    const failed = jobs.queueTopicRebuild('mark');
    mock.rebuild.mockRejectedValueOnce(new Error('private provider detail must not be shown'));
    expect(await jobs.processTopicRebuildJob()).toBe(false);
    expect(jobs.topicRebuildStatus().status).toBe('failed');
    expect(jobs.topicRebuildStatus().error).not.toContain('private provider detail');
    expect(jobs.queueTopicRebuild('mark').id).not.toBe(failed.id);
  });
  it('retains queued work after startup and makes interrupted active work visible', () => {
    jobs.recoverInterruptedTopicRebuild();
    expect(jobs.topicRebuildStatus().status).toBe('queued');
    const active = { ...jobs.topicRebuildStatus(), status: 'running' };
    database.run("UPDATE app_settings SET value=? WHERE key='topics.rebuild.job'", JSON.stringify(active));
    const calls = mock.rebuild.mock.calls.length;
    jobs.recoverInterruptedTopicRebuild();
    expect(jobs.topicRebuildStatus()).toMatchObject({ status: 'failed', error: expect.stringContaining('interrupted') });
    expect(mock.rebuild.mock.calls.length).toBe(calls);
  });
});
