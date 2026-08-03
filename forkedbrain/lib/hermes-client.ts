import WebSocket from "ws";
import { readFileSync } from "node:fs";
import type { MemoryDetail } from "./memory-store";

type ChatMessage = { role: "user" | "assistant"; text: string };
type RpcMessage = {
  id?: string;
  result?: { text?: string };
  error?: { code?: number; message?: string };
};

let cachedCookie = "";
let cookieExpiresAt = 0;

function baseUrl() {
  return (process.env.HERMES_BASE_URL || "http://hermes:9119").replace(/\/$/, "");
}

function credentials() {
  const username = process.env.HERMES_DASHBOARD_USERNAME?.trim();
  const passwordFile = process.env.HERMES_DASHBOARD_PASSWORD_FILE?.trim();
  const password = passwordFile
    ? readFileSync(passwordFile, "utf8").trim()
    : process.env.HERMES_DASHBOARD_PASSWORD?.trim();
  if (!username || !password) throw new Error("Hermes dashboard credentials are not configured");
  return { username, password };
}

function cleanError(message: unknown) {
  const text = String(message ?? "Hermes is unavailable");
  if (/insufficient_quota|no credits remaining|add credits/i.test(text)) {
    return "Hermes is connected, but the configured AI provider has no remaining credits.";
  }
  if (/401|403|invalid credentials/i.test(text)) return "Hermes authentication is unavailable.";
  if (/timeout/i.test(text)) return "Hermes took too long to respond. Please try again.";
  return "Hermes could not answer this request right now.";
}

function cookieHeader(headers: Headers) {
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter((value): value is string => Boolean(value));
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

async function login(force = false) {
  if (!force && cachedCookie && Date.now() < cookieExpiresAt) return cachedCookie;
  const { username, password } = credentials();
  const response = await fetch(`${baseUrl()}/auth/password-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "basic", username, password, next: "/" }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Hermes login failed with status ${response.status}`);
  cachedCookie = cookieHeader(response.headers);
  if (!cachedCookie) throw new Error("Hermes login did not return a session");
  cookieExpiresAt = Date.now() + 10 * 60 * 1000;
  return cachedCookie;
}

async function ticket(forceLogin = false) {
  const cookie = await login(forceLogin);
  const response = await fetch(`${baseUrl()}/api/auth/ws-ticket`, {
    method: "POST",
    headers: { cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 401 && !forceLogin) {
    cachedCookie = "";
    cookieExpiresAt = 0;
    return ticket(true);
  }
  if (!response.ok) throw new Error(`Hermes ticket failed with status ${response.status}`);
  const payload = await response.json() as { ticket?: string };
  if (!payload.ticket) throw new Error("Hermes ticket was empty");
  return payload.ticket;
}

function websocketUrl(value: string) {
  const url = new URL(value);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/ws`;
  return url;
}

async function oneshot(instructions: string, input: string) {
  const authTicket = await ticket();
  const url = websocketUrl(baseUrl());
  url.searchParams.set("ticket", authTicket);

  return new Promise<string>((resolve, reject) => {
    const requestId = `forkedbrain-${Date.now()}`;
    const socket = new WebSocket(url, { handshakeTimeout: 12_000 });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("Hermes request timeout"));
    }, 90_000);

    const settle = (callback: () => void) => {
      clearTimeout(timeout);
      try { socket.close(); } catch { /* socket may already be closed */ }
      callback();
    };

    socket.once("open", () => {
      socket.send(JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "llm.oneshot",
        params: {
          instructions,
          input,
          task: "title_generation",
          max_tokens: 700,
          temperature: 0.25,
        },
      }));
    });
    socket.on("message", (data) => {
      let message: RpcMessage;
      try { message = JSON.parse(String(data)) as RpcMessage; } catch { return; }
      if (message.id !== requestId) return;
      if (message.error) {
        settle(() => reject(new Error(message.error?.message || "Hermes generation failed")));
        return;
      }
      const text = message.result?.text?.trim();
      if (!text) {
        settle(() => reject(new Error("Hermes returned an empty response")));
        return;
      }
      settle(() => resolve(text));
    });
    socket.once("error", () => settle(() => reject(new Error("Hermes websocket failed"))));
  });
}

function contextFor(memory: MemoryDetail, history: ChatMessage[], question: string) {
  const recent = history.slice(-6).map((message) => `${message.role.toUpperCase()}: ${message.text.slice(0, 1200)}`).join("\n");
  const metadata = memory.metadata.map((item) => `${item.label}: ${item.value}`).join("\n");
  const insights = memory.insights.length ? memory.insights.map((item) => `- ${item}`).join("\n") : "None stored";
  return [
    `SELECTED MEMORY\nID: ${memory.id}\nTitle: ${memory.label}\nType: ${memory.group}`,
    `Summary: ${memory.summary}`,
    `Stored detail: ${memory.body}`,
    `Metadata:\n${metadata}`,
    `Stored insights:\n${insights}`,
    recent ? `RECENT CHAT\n${recent}` : "",
    `CURRENT QUESTION\n${question}`,
  ].filter(Boolean).join("\n\n").slice(0, 14_000);
}

export async function askHermes(memory: MemoryDetail, question: string, history: ChatMessage[]) {
  const instructions = [
    "You are Hermes inside Mark Gerhart's private intelligence system.",
    "Answer the current question using the selected stored memory and recent chat below.",
    "Distinguish stored evidence from your interpretation. Do not invent facts.",
    "Be concise, useful, and direct. Use short paragraphs or bullets when helpful.",
    "If the stored material cannot answer the question, say what is missing.",
  ].join(" ");
  try {
    return { answer: await oneshot(instructions, contextFor(memory, history, question)), available: true };
  } catch (error) {
    return { answer: cleanError(error instanceof Error ? error.message : error), available: false };
  }
}
