import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

type RpcMessage = {
  id?: string;
  result?: { text?: string };
  error?: { code?: number; message?: string };
};

export interface HermesGenerationOptions {
  instructions?: string[];
  task?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

let cachedCookie = '';
let cookieExpiresAt = 0;

function baseUrl() {
  return (process.env.HERMES_BASE_URL ?? 'http://hermes:9119').replace(/\/$/, '');
}

function credentials() {
  const username = process.env.HERMES_DASHBOARD_USERNAME?.trim();
  const passwordFile = process.env.HERMES_DASHBOARD_PASSWORD_FILE?.trim();
  const password = passwordFile
    ? readFileSync(passwordFile, 'utf8').trim()
    : process.env.HERMES_DASHBOARD_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error('Hermes dashboard credentials are not configured');
  }
  return { username, password };
}

function cookieHeader(headers: Headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter((value): value is string => Boolean(value));
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function login(force = false) {
  if (!force && cachedCookie && Date.now() < cookieExpiresAt) return cachedCookie;
  const { username, password } = credentials();
  const response = await fetch(`${baseUrl()}/auth/password-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'basic', username, password, next: '/' }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Hermes login failed with status ${response.status}`);
  cachedCookie = cookieHeader(response.headers);
  if (!cachedCookie) throw new Error('Hermes login did not return a session');
  cookieExpiresAt = Date.now() + 10 * 60 * 1000;
  return cachedCookie;
}

async function ticket(forceLogin = false) {
  const cookie = await login(forceLogin);
  const response = await fetch(`${baseUrl()}/api/auth/ws-ticket`, {
    method: 'POST',
    headers: { cookie },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 401 && !forceLogin) {
    cachedCookie = '';
    cookieExpiresAt = 0;
    return ticket(true);
  }
  if (!response.ok) throw new Error(`Hermes ticket failed with status ${response.status}`);
  const payload = await response.json() as { ticket?: string };
  if (!payload.ticket) throw new Error('Hermes ticket was empty');
  return payload.ticket;
}

function websocketUrl(value: string) {
  const url = new URL(value);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ws`;
  return url;
}

export function cleanHermesError(message: unknown) {
  const text = String(message ?? 'Hermes is unavailable');
  if (/insufficient_quota|no credits remaining|add credits/i.test(text)) {
    return 'Hermes is connected, but the configured AI provider has no remaining credits.';
  }
  if (/401|403|invalid credentials/i.test(text)) {
    return 'Hermes authentication is unavailable.';
  }
  if (/timeout/i.test(text)) {
    return 'Hermes took too long to respond. Please try again.';
  }
  return 'Hermes could not answer this request right now.';
}

export async function generateWithHermes(input: string, options: HermesGenerationOptions = {}) {
  const authTicket = await ticket();
  const url = websocketUrl(baseUrl());
  url.searchParams.set('ticket', authTicket);

  return new Promise<string>((resolve, reject) => {
    const requestId = `crypto-intelligence-${Date.now()}`;
    const socket = new WebSocket(url, { handshakeTimeout: 12_000 });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Hermes request timeout'));
    }, options.timeoutMs ?? 90_000);

    const settle = (callback: () => void) => {
      clearTimeout(timeout);
      try { socket.close(); } catch { /* socket may already be closed */ }
      callback();
    };

    socket.once('open', () => {
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'llm.oneshot',
        params: {
          instructions: (options.instructions ?? [
            "You are Hermes inside Mark Gerhart's private Crypto Intelligence system.",
            'Answer only from the supplied corpus evidence.',
            'Separate stored evidence from interpretation and never invent facts.',
            'Cite supporting records with their exact bracketed IDs.',
            'If the evidence is insufficient, say exactly what is missing.',
            'Be concise, decision-useful, and direct.',
          ]).join(' '),
          input,
          task: options.task ?? 'title_generation',
          max_tokens: options.maxTokens ?? 1200,
          temperature: options.temperature ?? 0.2,
        },
      }));
    });

    socket.on('message', (data) => {
      let message: RpcMessage;
      try { message = JSON.parse(String(data)) as RpcMessage; } catch { return; }
      if (message.id !== requestId) return;
      if (message.error) {
        settle(() => reject(new Error(message.error?.message ?? 'Hermes generation failed')));
        return;
      }
      const text = message.result?.text?.trim();
      if (!text) {
        settle(() => reject(new Error('Hermes returned an empty response')));
        return;
      }
      settle(() => resolve(text));
    });
    socket.once('error', () => settle(() => reject(new Error('Hermes websocket failed'))));
  });
}

export async function askHermes(input: string) {
  return generateWithHermes(input);
}
