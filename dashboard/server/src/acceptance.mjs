#!/usr/bin/env node
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:5183').replace(/\/$/, '');
const OUT = resolve(arg('out', join(HERE, '..', '..', 'acceptance')));
const IDENTITY = arg('identity', '');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADERS = IDENTITY ? { 'cf-access-authenticated-user-email': IDENTITY } : {};
const HTTP_USERNAME = process.env.ACCEPTANCE_HTTP_USERNAME ?? '';
const HTTP_PASSWORD = process.env.ACCEPTANCE_HTTP_PASSWORD ?? '';
const HTTP_CREDENTIALS = HTTP_USERNAME && HTTP_PASSWORD
  ? { username: HTTP_USERNAME, password: HTTP_PASSWORD }
  : undefined;
const LOGIN_USERNAME = process.env.ACCEPTANCE_LOGIN_USERNAME ?? '';
const LOGIN_PASSWORD = process.env.ACCEPTANCE_LOGIN_PASSWORD ?? '';
const SESSION_TOKEN = process.env.ACCEPTANCE_SESSION_TOKEN ?? '';

mkdirSync(OUT, { recursive: true });
const checks = [];
const failures = [];
const networkFailures = [];
const consoleErrors = [];
let revisionIncludedPriorOutput = false;

const check = (condition, label, detail = '') => {
  checks.push({ label, passed: Boolean(condition), detail });
  if (!condition) failures.push(detail ? `${label}: ${detail}` : label);
};

const bodyHasRawMarkdown = async (locator) => {
  const text = await locator.innerText();
  return /\*\*|```|(^|\n)#{1,6}\s/.test(text);
};

const sourceFixture = async (request) => {
  const timelineResponse = await request.get(`${BASE}/api/timeline`, { headers: HEADERS });
  check(timelineResponse.ok(), 'Timeline API responds', `${timelineResponse.status()}`);
  const timeline = timelineResponse.ok() ? await timelineResponse.json() : { pins: [] };
  const pin = timeline.pins?.[0];
  return {
    id: pin?.event_id ?? '2026-01-01-0001',
    kind: 'event',
    title: pin?.source_title || pin?.source_label || 'Stored protocol research',
    who: pin?.source_label || pin?.source_title || 'Stored source',
    when: pin?.sort_key || '2026-01-01',
    source_type: 'transcript',
    url: pin?.source_url || 'https://example.com/source',
  };
};

const prepResponse = (source) => ({
  id: 'draft-browser-prep',
  revision: 0,
  overview: 'The retained evidence shows that distribution, liquidity, and governance shape protocol outcomes together. The useful preparation angle is to explain the mechanism first, identify who captures value, and state what the source does not prove.',
  suggested_tangents: ['liquidity', 'governance'],
  sources: [source],
  points: Array.from({ length: 5 }, (_, index) => ({
    title: ['Distribution determines durable value capture', 'Liquidity changes the practical risk', 'Governance reacts after constraints appear', 'Source context limits the conclusion', 'The open question is persistence'][index],
    body: `Point ${index + 1} connects a specific mechanism to the retained evidence in plain language, without turning the brief into a disconnected list of figures.`,
    detail: [`The source provides a concrete sequence for point ${index + 1}. The preparation brief keeps the claim narrow, identifies the mechanism, and leaves uncertainty visible.`],
    counter: 'The retained source supports the immediate mechanism but does not prove that the same outcome will persist across every market cycle.',
    citations: [{ id: source.id, quote: 'retained evidence', inference: 'The source supports the mechanism used in this point.' }],
    sources: [source.id],
    quotes: [{ quote: 'retained evidence', speaker: source.who, locator: 'source excerpt', when: source.when, read: 'This excerpt is used only for the narrow mechanism described above.' }],
    window: source.when,
    tag: index === 4 ? 'governance' : null,
  })),
});

const tweetText = (creator, index, revised) => {
  const base = creator === 'Haseeb'
    ? 'Fee compression is not mainly an execution story. Distribution decides who keeps margins after the wrapper becomes easy to copy, so watch who owns the user relationship.'
    : 'Governance is not merely a voting problem. It is a legitimacy problem because durable coordination depends on who accepts the decision and who can credibly exit.';
  return `${base} ${revised ? 'That is the sharper version.' : `Angle ${index + 1}.`}`;
};

const blogText = (creator) => {
  const opening = `## The mechanism\n\n${creator} would start with the mechanism rather than the headline. Distribution, incentives, and credible participation determine whether a protocol can keep value after its technical wrapper becomes easier to copy.`;
  const paragraph = 'The retained evidence matters because it separates a visible market outcome from the operating constraint beneath it. That distinction keeps the argument grounded. It also prevents a single statistic from being treated as a complete explanation when the source only supports one part of the causal chain.';
  const close = '## What remains uncertain\n\nThe source does not settle the long-term outcome. A useful conclusion names the mechanism, shows the evidence, and leaves the unresolved question visible instead of manufacturing confidence.';
  return `${opening}\n\n${Array.from({ length: 5 }, () => paragraph).join('\n\n')}\n\n${close}`;
};

async function installGenerationMocks(context, source) {
  const saved = new Map();
  await context.route('**/api/workflows/draft-browser*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const entry = saved.get(id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revisions: entry ? [entry] : [] }) });
  });
  await context.route('**/api/prep', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const result = prepResponse(source); saved.set(result.id, { revision: 0, result, input: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await context.route('**/api/creator', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request().postDataJSON();
    const revised = Boolean(request.feedback);
    if (revised) revisionIncludedPriorOutput = Array.isArray(request.prior_output) && request.prior_output.length > 0 && Boolean(request.draft_id);
    const count = request.format === 'blog' ? 1 : Number(request.count || 3);
    const outputs = Array.from({ length: count }, (_, index) => ({
      angle: revised ? `Revised angle ${index + 1}` : `Angle ${index + 1}`,
      text: request.format === 'blog' ? blogText(request.creator) : tweetText(request.creator, index, revised),
      citations: [{ id: source.id, quote: 'retained evidence', inference: 'This source supplied the factual mechanism while Creator Reference memory supplied the voice.', source }],
    }));
    const result = { id: request.draft_id || `draft-browser-${request.creator}`, revision: revised ? 1 : 0, creator: request.creator, format: request.format, outputs };
    saved.set(result.id, { revision: result.revision, result, input: request });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
}

async function instrument(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(BASE)) networkFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
}

async function checkViewport(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  check(dimensions.width <= dimensions.viewport + 1, `${label} has no horizontal overflow`, `${dimensions.width}px document in ${dimensions.viewport}px viewport`);
}

async function desktopPass(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1, colorScheme: 'light', extraHTTPHeaders: HEADERS, httpCredentials: HTTP_CREDENTIALS });
  if (SESSION_TOKEN) {
    await context.addCookies([{ name: 'crypto_session', value: SESSION_TOKEN, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  }
  if (LOGIN_USERNAME && LOGIN_PASSWORD) {
    const loginResponse = await context.request.post(`${BASE}/api/auth/login`, {
      data: { username: LOGIN_USERNAME, password: LOGIN_PASSWORD, turnstileToken: '' },
    });
    check(loginResponse.ok(), 'Acceptance session login succeeds', `${loginResponse.status()}`);
  }
  const briefResponse = await context.request.get(`${BASE}/api/brief`, { headers: HEADERS });
  check(briefResponse.ok(), 'Live status API responds', `${briefResponse.status()}`);
  const liveBrief = briefResponse.ok() ? await briefResponse.json() : { telegram_sync: null };
  const source = await sourceFixture(context.request);
  await installGenerationMocks(context, source);
  const page = await context.newPage();
  let briefFetches = 0;
  page.on('response', (response) => {
    if (response.url() === `${BASE}/api/brief`) briefFetches += 1;
  });
  await instrument(page);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const syncStatus = page.getByTestId('telegram-sync-status');
  await syncStatus.waitFor();
  const syncText = await syncStatus.innerText();
  const normalizedSyncText = syncText.toLowerCase().replace(/\s+/g, ' ');
  check(Boolean(liveBrief.telegram_sync) && normalizedSyncText.includes(`${liveBrief.telegram_sync.received} received`), 'Sidebar shows the live Telegram received count', syncText);
  check(Boolean(liveBrief.telegram_sync) && normalizedSyncText.includes(`${liveBrief.evidence_processing.ready} processed`), 'Sidebar shows evidence processing completion', syncText);
  check(Boolean(liveBrief.telegram_sync) && normalizedSyncText.includes(`${liveBrief.telegram_sync.processing + liveBrief.evidence_processing.processing} processing`), 'Sidebar shows the live Telegram processing count', syncText);
  check(Boolean(liveBrief.telegram_sync) && normalizedSyncText.includes(`${liveBrief.telegram_sync.failed + liveBrief.evidence_processing.failed} failed`), 'Sidebar shows the live Telegram failed count', syncText);
  check((await page.locator('nav a').allTextContents()).length === 5, 'Navigation contains exactly Mark’s five screens');
  check(await page.getByRole('link', { name: 'Control center', exact: true }).isVisible(), 'Control Center is a separate utility link');
  check(await page.getByRole('heading', { name: 'Topics', exact: true }).isVisible(), 'Topics opens as the home screen');
  check((await page.locator('main a[href^="/topics/"]').count()) > 0, 'Topics uses live topic records');
  const firstTopicTag = page.locator('main button').nth(1);
  check(await firstTopicTag.isVisible(), 'Topics exposes Mark’s tag filter rail');
  await firstTopicTag.click();
  check((await page.locator('main a[href^="/topics/"]').count()) > 0, 'Topic tag filter works');
  await page.getByRole('button', { name: 'all', exact: true }).click();
  await page.locator('main a[href^="/topics/"]').first().click();
  await page.waitForURL(/\/topics\//);
  await page.getByTestId('topic-claim').first().waitFor();
  check((await page.getByTestId('topic-claim').count()) > 0, 'Topic detail shows readable claims');
  check(!(await bodyHasRawMarkdown(page.locator('main'))), 'Topic detail has no raw Markdown');
  const actualSourceTypes = await page.getByTestId('topic-layout').locator('aside > div').last().locator('button').allTextContents();
  check(actualSourceTypes.length > 0 && actualSourceTypes.every(label => !/\s0$/.test(label.trim())), 'Topic source filters reflect the retained source types');
  check(!(await page.locator('main').innerText()).includes('Actively contested'), 'Topic categories do not imply a disagreement');
  const sourceFilter = page.getByTestId('topic-layout').locator('aside > div').first().locator('button').nth(1);
  if (await sourceFilter.count()) {
    await sourceFilter.click();
    await page.getByRole('button', { name: 'clear filters' }).waitFor();
    check(await page.getByRole('button', { name: 'clear filters' }).isVisible(), 'Topic filters expose a clear state');
    await page.getByRole('button', { name: 'clear filters' }).click();
  }
  await page.screenshot({ path: join(OUT, '01-topic-detail.png'), fullPage: true });
  await checkViewport(page, 'Topic detail desktop');

  await page.getByRole('link', { name: /Timeline/ }).click();
  await page.waitForURL(/\/timeline$/);
  await page.getByRole('heading', { name: 'Timeline', exact: true }).waitFor();
  check(await page.getByRole('heading', { name: 'Timeline', exact: true }).isVisible(), 'Timeline screen opens');
  check((await page.getByTestId('timeline-year').count()) > 0, 'Timeline exposes historic year controls');
  const selectedYear = page.locator('[data-testid="timeline-year"][aria-selected="true"]');
  const activeYearColor = (await selectedYear.count())
    ? selectedYear.getByTestId('timeline-year-segment').first()
    : page.getByTestId('timeline-year-segment').first();
  check(await activeYearColor.isVisible(), 'Timeline year bars contain clickable category colors');
  await activeYearColor.click();
  check((await page.locator('[data-testid="timeline-category"][aria-pressed="true"]').count()) === 1, 'Clicking a year color filters its category');
  check((await page.getByRole('button', { name: 'All Signals', exact: true }).getAttribute('aria-pressed')) === 'false', 'Year color filter leaves the all-signals state');
  await page.getByRole('button', { name: 'All Signals', exact: true }).click();
  check((await page.getByTestId('timeline-month').count()) === 12, 'Timeline density strip covers all twelve months');
  const densityColor = page.getByTestId('timeline-month-segment').first();
  check(await densityColor.isVisible(), 'Timeline month bars contain clickable category colors');
  await densityColor.click();
  check((await page.locator('[data-testid="timeline-category"][aria-pressed="true"]').count()) === 1, 'Clicking a month color filters its category');
  const firstEvent = page.getByTestId('timeline-event').first();
  check(await firstEvent.isVisible(), 'Timeline category filter retains relevant events');
  const dossierResponse = page.waitForResponse(response => /\/api\/timeline\/[^/]+\/dossier$/.test(new URL(response.url()).pathname));
  await firstEvent.click();
  const dossierData = await (await dossierResponse).json();
  await page.getByTestId('timeline-dossier').waitFor();
  await page.getByTestId('timeline-dossier-sources').waitFor();
  check(await page.getByTestId('timeline-dossier').isVisible(), 'Timeline event opens Mark’s full evidence dossier');
  check(await page.getByTestId('timeline-dossier').getByText('Mentions', { exact: true }).isVisible(), 'Timeline dossier shows mention volume');
  check(await page.getByTestId('timeline-dossier-reactions').isVisible() === Boolean(dossierData.reactions?.length), 'Timeline shows related claims only when distinct supporting records exist');
  check(await page.getByTestId('timeline-dossier-sources').isVisible(), 'Timeline dossier exposes supporting sources');
  check((await page.getByTestId('timeline-dossier-source').count()) > 0, 'Timeline dossier contains real source cards');
  check(await page.getByText('What to watch', { exact: true }).isVisible() === Boolean(dossierData.watch?.length), 'Timeline shows watch points only when retained evidence supports them');
  const timelineData = await (await page.request.get(`${BASE}/api/timeline`, { headers: HEADERS })).json();
  const selectedYearValue = await page.locator('[data-testid="timeline-year"][aria-selected="true"]').getAttribute('data-year');
  const selectedYearText = await page.locator('[data-testid="timeline-year"][aria-selected="true"]').innerText();
  const selectedYearNumber = selectedYearValue || selectedYearText.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const hasNext = timelineData.pins.some(pin => pin.sort_key.startsWith(selectedYearNumber) && pin.primary_category === dossierData.event.category && pin.event_id !== dossierData.event.id);
  check(await page.getByTestId('timeline-dossier-footer').getByRole('button').isVisible() === hasNext, 'Timeline next-signal navigation requires another event in the category');
  check(!(await bodyHasRawMarkdown(page.getByTestId('timeline-dossier'))), 'Timeline evidence dossier has no raw Markdown');
  await page.screenshot({ path: join(OUT, '02-timeline-event.png'), fullPage: false });
  await page.getByRole('button', { name: 'Close event details' }).click();
  await checkViewport(page, 'Timeline desktop');

  await page.getByRole('link', { name: /Prep/ }).click();
  const prepAction = page.getByRole('button', { name: 'Generate with Hermes' });
  await prepAction.waitFor();
  check(await prepAction.isVisible(), 'Prep exposes its primary generation action');
  await page.locator('#prep-topic').fill('How does distribution shape value capture in lending protocols?');
  const tangent = page.locator('button').filter({ hasText: /^\+ / }).first();
  if (await tangent.count()) await tangent.click();
  await prepAction.click();
  await page.getByText('Distribution determines durable value capture', { exact: true }).waitFor();
  check((await page.locator('button').filter({ hasText: /Open ·/ }).count()) === 5, 'Prep returns the requested five source-backed points');
  check(!(await bodyHasRawMarkdown(page.locator('main'))), 'Prep has no raw Markdown');
  await page.locator('button').filter({ hasText: 'Distribution determines durable value capture' }).first().hover();
  await page.locator('button').filter({ hasText: 'Distribution determines durable value capture' }).first().click();
  check(await page.getByText("Where it's weak", { exact: true }).isVisible(), 'Prep exposes uncertainty and counterarguments');
  check(await page.getByText('Direct quotes · 1', { exact: true }).isVisible(), 'Prep exposes quote-level evidence');
  check(await page.getByText('Sourced from', { exact: true }).last().isVisible(), 'Prep exposes exact sources');
  await page.screenshot({ path: join(OUT, '03-prep-detail.png'), fullPage: false });
  await page.getByRole('button', { name: 'Close point details' }).click();
  await checkViewport(page, 'Prep desktop');

  await page.getByRole('link', { name: /Haseeb bot/ }).click();
  await page.locator('.creator-prompt').fill('Why protocol distribution matters more than execution speed');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByTestId('creator-draft').first().waitFor();
  check((await page.getByTestId('creator-draft').count()) === 3, 'Haseeb bot returns exactly three requested tweets');
  const haseebTweetLengths = await page.getByTestId('creator-tweet').evaluateAll((nodes) => nodes.map((node) => (node.textContent || '').trim().length));
  check(haseebTweetLengths.every((length) => length >= 140 && length <= 220), 'Haseeb tweets use a realistic short-post length', haseebTweetLengths.join(', '));
  check((await page.getByRole('button', { name: 'Copy' }).count()) === 3, 'Haseeb outputs are individually copyable');
  check(!(await bodyHasRawMarkdown(page.locator('.creator-output'))), 'Haseeb output has no raw Markdown');
  check((await page.getByTestId('creator-citation').count()) === 3, 'Haseeb outputs include source evidence and inference');
  await page.getByTestId('creator-feedback').locator('textarea').fill('Make the opening sharper and keep the mechanism.');
  await page.getByRole('button', { name: 'Revise' }).click();
  await page.getByText('Revised angle 1', { exact: true }).waitFor();
  check(revisionIncludedPriorOutput, 'Creator revision preserves and sends the previous draft');
  await page.screenshot({ path: join(OUT, '04-haseeb-revised.png'), fullPage: true });
  await page.getByRole('button', { name: 'blog post' }).click();
  check((await page.getByTestId('creator-draft').count()) === 0, 'Changing creator format clears incompatible prior output');
  await checkViewport(page, 'Haseeb desktop');

  await page.getByRole('link', { name: /Tarun bot/ }).click();
  await page.getByRole('button', { name: 'blog post' }).click();
  await page.getByRole('button', { name: 'short' }).click();
  await page.locator('.creator-prompt').fill('Why token governance is a legitimacy problem');
  check(await page.getByRole('button', { name: 'Generate' }).isEnabled(), 'Tarun controls keep the entered prompt');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByTestId('creator-draft').first().waitFor();
  check((await page.getByTestId('creator-draft').count()) === 1, 'Tarun blog mode returns exactly one draft');
  check((await page.getByTestId('creator-draft').locator('h2, h3').count()) > 0, 'Tarun blog Markdown renders as headings');
  const tarunBlogWords = await page.getByTestId('creator-draft').first().innerText().then((text) => text.trim().split(/\s+/).filter(Boolean).length);
  check(tarunBlogWords >= 250 && tarunBlogWords <= 350, 'Tarun short blog uses the requested length', `${tarunBlogWords} words`);
  check(!(await bodyHasRawMarkdown(page.locator('.creator-output'))), 'Tarun blog shows rendered text without Markdown artifacts');
  check((await page.getByTestId('creator-citation').count()) === 1, 'Tarun output includes source evidence and inference');
  await page.screenshot({ path: join(OUT, '05-tarun-blog.png'), fullPage: true });
  await checkViewport(page, 'Tarun desktop');

  await page.getByRole('link', { name: 'Control center', exact: true }).click();
  await page.getByRole('heading', { name: 'Control center', exact: true }).waitFor();
  check((await page.getByTestId('control-center').locator('aside button').count()) === 5, 'Control Center covers all five Mark-designed pages');
  check(await page.getByLabel('Page instructions').isVisible(), 'Control Center exposes the active Topics instruction');
  check(await page.getByText('Fixed evidence contract', { exact: true }).isVisible(), 'Control Center keeps evidence safeguards visible');
  await page.getByTestId('control-center').locator('aside button').filter({ hasText: 'Timeline' }).click();
  check(await page.getByText('This view is evidence-only, so there is no prompt to edit.', { exact: true }).isVisible(), 'Control Center identifies the non-generative Timeline contract');
  await page.getByTestId('control-center').locator('aside button').filter({ hasText: 'Prep' }).click();
  check(await page.getByLabel('Page instructions').isVisible(), 'Control Center switches between page instructions');
  check(!(await bodyHasRawMarkdown(page.locator('main'))), 'Control Center has no raw Markdown');
  await page.screenshot({ path: join(OUT, '06-control-center.png'), fullPage: true });
  await checkViewport(page, 'Control Center desktop');

  const theme = page.getByRole('button', { name: 'Dark mode' });
  check(await theme.isVisible(), 'Dark mode control is available');
  await theme.click();
  check(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Dark mode applies to the approved design');
  await page.waitForTimeout(300);
  const darkDraft = await page.getByTestId('control-center').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      foreground: style.color,
      cardToken: style.getPropertyValue('--card').trim(),
      foregroundToken: style.getPropertyValue('--foreground').trim(),
    };
  });
  check(darkDraft.background === 'rgb(22, 26, 23)', 'Control Center inherits the dark surface', JSON.stringify(darkDraft));
  check(darkDraft.foreground === 'rgb(220, 227, 221)', 'Control Center retains readable dark-mode text', JSON.stringify(darkDraft));
  check(briefFetches >= 2, 'Telegram status refreshes automatically while the page is visible', `${briefFetches} live reads`);
  await page.screenshot({ path: join(OUT, '07-dark-mode.png'), fullPage: false });

  await context.close();
}

async function mobilePass(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'light', extraHTTPHeaders: HEADERS, httpCredentials: HTTP_CREDENTIALS });
  if (SESSION_TOKEN) {
    await context.addCookies([{ name: 'crypto_session', value: SESSION_TOKEN, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  }
  if (LOGIN_USERNAME && LOGIN_PASSWORD) {
    const loginResponse = await context.request.post(`${BASE}/api/auth/login`, {
      data: { username: LOGIN_USERNAME, password: LOGIN_PASSWORD, turnstileToken: '' },
    });
    check(loginResponse.ok(), 'Mobile acceptance session login succeeds', `${loginResponse.status()}`);
  }
  const source = await sourceFixture(context.request);
  await installGenerationMocks(context, source);
  const page = await context.newPage();
  await instrument(page);
  const routes = [
    ['/', 'Topics'],
    ['/timeline', 'Timeline'],
    ['/prep', 'Prep'],
    ['/haseeb', 'Haseeb bot'],
    ['/tarun', 'Tarun bot'],
    ['/control-center', 'Control center'],
    ['/sources', 'Sources and imports'],
    ['/saved', 'Saved work'],
  ];
  for (const [path, heading] of routes) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    check(await page.getByRole('heading', { name: heading, exact: true }).isVisible(), `${heading} opens on mobile`);
    await checkViewport(page, `${heading} mobile`);
  }
  await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
  await page.getByTestId('timeline-event').first().click();
  await page.getByTestId('timeline-dossier').waitFor();
  check(await page.getByTestId('timeline-dossier').isVisible(), 'Timeline dossier opens as a mobile sheet');
  check(!(await bodyHasRawMarkdown(page.getByTestId('timeline-dossier'))), 'Mobile Timeline dossier has no raw Markdown');
  await page.screenshot({ path: join(OUT, '08-mobile-timeline.png'), fullPage: false });
  await context.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  await desktopPass(browser);
  await mobilePass(browser);
} finally {
  await browser.close();
}

check(networkFailures.length === 0, 'No first-party browser requests fail', networkFailures.join('; '));
check(consoleErrors.length === 0, 'No browser console errors occur', consoleErrors.join('; '));
const report = { base: BASE, checkedAt: new Date().toISOString(), checks, failures, networkFailures, consoleErrors };
writeFileSync(join(OUT, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} checks passed`);
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
if (failures.length) process.exitCode = 1;
