#!/usr/bin/env node
/**
 * Captures every screen at desktop and phone width, plus the reduced-motion
 * and high-contrast variants. Uses a real Chrome so WebGL is hardware backed
 * and the ambient field and connection field actually render.
 *
 *   node src/screenshots.mjs [--base http://127.0.0.1:5183] [--out ../screenshots]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://127.0.0.1:5183');
const OUT = resolve(arg('out', join(HERE, '..', '..', 'screenshots')));
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

const SHOTS = [
  { name: '01-brief', path: '/', full: false, settle: 3200 },
  { name: '02-timeline', path: '/timeline', full: false },
  { name: '03-library-events', path: '/library', full: false },
  { name: '04-library-filtered', path: '/library?family=risk&significanceMin=4', full: false },
  { name: '05-library-media', path: '/library?scope=media', full: false },
  { name: '06-event-detail', path: '/event/2026-05-13-0026', full: false },
  { name: '07-connections', path: '/connections', full: false, settle: 2600 },
  { name: '08-studio', path: '/studio', full: false },
  { name: '09-recall', path: '/recall', full: false },
  { name: '10-archive', path: '/archive', full: false },
  { name: '11-settings', path: '/settings', full: false },
  { name: '12-theme', path: '/theme/d9dd821b4b0d64da', full: false },
  { name: '19-capture', path: '/capture', full: false },
];

const shot = async (page, file, full) => {
  await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: full });
  console.log(`  ${file}.png`);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-gpu', '--use-gl=angle', '--ignore-gpu-blocklist'],
});

try {
  console.log('desktop 1440x950');
  const desk = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await desk.newPage();
  for (const s of SHOTS) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.settle ?? 900);
    await shot(page, s.name, s.full);
  }

  // Studio composer, connected-state shell. The screenshot run does not
  // submit the form or call Hermes.
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
  const createDraft = page.getByRole('button', { name: 'Create draft' });
  if (await createDraft.isEnabled()) {
    await createDraft.click();
    await page.waitForTimeout(300);
    await shot(page, '20-studio-composer', false);
  }
  const studioPayload = await page.evaluate(async () => (await fetch('/api/drafts')).json());
  const firstDraft = studioPayload?.drafts?.[0]?.id;
  if (firstDraft) {
    await page.goto(`${BASE}/studio/${firstDraft}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await shot(page, '21-studio-draft', false);
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await page.waitForTimeout(200);
    await shot(page, '22-studio-edit', false);
  }

  // The command surface, opened over the Brief.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('aave utilisation');
  await page.waitForTimeout(900);
  await shot(page, '13-command-search', false);
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(900);
  await shot(page, '14-command-ask-degraded', false);

  // Depth on, Connections.
  await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Depth/ }).click();
  await page.waitForTimeout(2600);
  await shot(page, '15-connections-depth', false);
  await desk.close();

  console.log('phone 390x844');
  const mob = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  const mp = await mob.newPage();
  for (const s of [SHOTS[0], SHOTS[1], SHOTS[2], SHOTS[5], SHOTS[12]]) {
    await mp.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
    await mp.waitForTimeout(s.settle ?? 900);
    await shot(mp, `m-${s.name}`, s.full);
  }
  await mp.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
  const mobileCreateDraft = mp.getByRole('button', { name: 'Create draft' });
  if (await mobileCreateDraft.isEnabled()) {
    await mobileCreateDraft.click();
    await mp.waitForTimeout(300);
    await shot(mp, 'm-20-studio-composer', false);
  }
  await mob.close();

  console.log('accessibility variants');
  const rm = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const rp = await rm.newPage();
  await rp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await rp.waitForTimeout(2600);
  await shot(rp, '16-brief-reduced-motion', false);
  const stats = await rp.evaluate(() => window.__sceneStats?.() ?? null);
  console.log('  reduced motion scene stats:', JSON.stringify(stats));
  await rp.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
  await rp.waitForTimeout(800);
  await shot(rp, '17-connections-reduced-motion', false);
  await rm.close();

  const hc = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, colorScheme: 'dark' });
  const hp = await hc.newPage();
  await hp.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await hp.evaluate(() => {
    localStorage.setItem('contrast', 'high');
    document.documentElement.dataset.contrast = 'high';
  });
  await hp.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await hp.waitForTimeout(700);
  await shot(hp, '18-library-high-contrast', false);
  await hc.close();
} finally {
  await browser.close();
}

console.log(`\nwrote screenshots to ${OUT}`);
