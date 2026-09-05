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
const USERNAME = arg('username', process.env.ACCEPTANCE_LOGIN_USERNAME ?? 'mark');
const PASSWORD = arg('password', process.env.ACCEPTANCE_LOGIN_PASSWORD ?? '');
const OUT = resolve(arg('out', join(HERE, '..', '..', 'acceptance-auth')));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IGNORE_HTTPS_ERRORS = process.env.ACCEPTANCE_IGNORE_HTTPS_ERRORS === 'true';

if (!PASSWORD) throw new Error('Set ACCEPTANCE_LOGIN_PASSWORD or pass --password.');
mkdirSync(OUT, { recursive: true });

const checks = [];
const failures = [];
const check = (condition, label, detail = '') => {
  const passed = Boolean(condition);
  checks.push({ passed, label, detail });
  if (!passed) failures.push(detail ? `${label}: ${detail}` : label);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    colorScheme: 'light',
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
  });
  const consoleErrors = [];
  const networkFailures = [];
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(BASE)) networkFailures.push(`${request.method()} ${request.url()}`);
  });

  const privateResponse = await context.request.get(`${BASE}/api/brief`);
  check(privateResponse.status() === 401, 'Private API rejects an anonymous request', String(privateResponse.status()));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-page').waitFor();
  check(await page.getByRole('heading', { name: 'Evidence, organized for decisions.' }).isVisible(), 'Login retains the Crypto Intelligence editorial hierarchy');
  check(await page.getByLabel('Username').isVisible(), 'Username has a persistent label');
  check(await page.getByLabel('Password').isVisible(), 'Password has a persistent label');
  const config = await (await context.request.get(`${BASE}/api/auth/config`)).json();
  check(config.mode === 'shared-password', 'Shared password mode is active', config.mode);
  check(config.turnstile === true, 'Turnstile is enabled');
  check(await page.getByTestId('turnstile').isVisible(), 'Turnstile has a visible verification surface');
  await page.waitForFunction(() => Boolean(document.querySelector('.login-turnstile input[name="cf-turnstile-response"]')?.getAttribute('value')), null, { timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, '01-login-desktop.png'), fullPage: true });

  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(`${PASSWORD}-incorrect`);
  await page.getByRole('button', { name: /Enter workspace/ }).click();
  await page.getByRole('alert').waitFor({ timeout: 15_000 });
  check((await page.getByRole('alert').innerText()).includes('incorrect'), 'Incorrect credentials produce a clear inline repair message');
  consoleErrors.length = 0;
  await page.getByLabel('Password').fill(PASSWORD);
  await page.waitForFunction(() => Boolean(document.querySelector('.login-turnstile input[name="cf-turnstile-response"]')?.getAttribute('value')), null, { timeout: 20_000 });
  await page.getByRole('button', { name: /Enter workspace/ }).click();
  await page.getByTestId('workspace-opening').waitFor({ timeout: 15_000 });
  check(await page.getByRole('heading', { name: 'Opening your workspace' }).isVisible(), 'Successful login uses the matching workspace transition');
  await page.getByRole('heading', { name: 'Topics', exact: true }).waitFor({ timeout: 15_000 });
  check(await page.getByRole('heading', { name: 'Topics', exact: true }).isVisible(), 'Login opens the real Topics dashboard');
  const cookies = await context.cookies(BASE);
  const sessionCookie = cookies.find((cookie) => cookie.name === 'crypto_session');
  check(Boolean(sessionCookie?.httpOnly), 'Session cookie is HttpOnly');
  check(sessionCookie?.sameSite === 'Lax', 'Session cookie uses SameSite Lax', String(sessionCookie?.sameSite));
  const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
  check(session.authenticated === true && session.actor === 'mark', 'Authenticated session resolves to Mark');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Topics', exact: true }).waitFor({ timeout: 15_000 });
  check(await page.getByRole('heading', { name: 'Topics', exact: true }).isVisible(), 'Session survives a page reload');
  const logoutStatus = await page.evaluate(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    return response.status;
  });
  check(logoutStatus === 200, 'Logout endpoint responds', String(logoutStatus));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-page').waitFor({ timeout: 15_000 });
  check(await page.getByTestId('login-page').isVisible(), 'Logout returns to the login screen');

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  check(dimensions.width <= dimensions.viewport + 1, 'Desktop login has no horizontal overflow', `${dimensions.width}/${dimensions.viewport}`);
  check(networkFailures.length === 0, 'Login has no first-party network failures', networkFailures.join(', '));
  check(consoleErrors.length === 0, 'Login has no browser console errors', consoleErrors.join(', '));
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mobilePage.getByTestId('login-page').waitFor();
  await mobilePage.waitForFunction(() => Boolean(document.querySelector('.login-turnstile input[name="cf-turnstile-response"]')?.getAttribute('value')), null, { timeout: 20_000 });
  await mobilePage.waitForTimeout(400);
  const mobileDimensions = await mobilePage.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  check(mobileDimensions.width <= mobileDimensions.viewport + 1, 'Mobile login has no horizontal overflow', `${mobileDimensions.width}/${mobileDimensions.viewport}`);
  const targetHeight = await mobilePage.getByRole('button', { name: /Enter workspace/ }).evaluate((element) => element.getBoundingClientRect().height);
  check(targetHeight >= 44, 'Mobile primary action meets the touch target threshold', String(targetHeight));
  await mobilePage.screenshot({ path: join(OUT, '02-login-mobile.png'), fullPage: true });
  await mobile.close();

  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  const animation = await reducedPage.locator('.login-form').evaluate((element) => getComputedStyle(element).animationName);
  check(animation === 'none', 'Reduced motion disables the login entrance animation', animation);
  await reduced.close();
} finally {
  await browser.close();
}

const report = { base: BASE, checkedAt: new Date().toISOString(), checks, failures };
writeFileSync(join(OUT, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} checks passed`);
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
if (failures.length) process.exitCode = 1;
