import { NextRequest, NextResponse } from "next/server";
import { askHermes } from "@/lib/hermes-client";
import { getMemoryDetail } from "@/lib/memory-store";
import { authorizeRequest } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatBody = {
  memoryId?: unknown;
  question?: unknown;
  messages?: unknown;
};

const attempts = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => time > now - 60_000);
  if (recent.length >= 12) return true;
  recent.push(now);
  attempts.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  if (!authorizeRequest(request).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Please wait before sending another message." }, { status: 429 });

  let body: ChatBody;
  try { body = await request.json() as ChatBody; } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const memoryId = typeof body.memoryId === "string" ? body.memoryId.slice(0, 240) : "";
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter((item): item is { role: "user" | "assistant"; text: string } => Boolean(
        item && typeof item === "object"
        && ((item as { role?: unknown }).role === "user" || (item as { role?: unknown }).role === "assistant")
        && typeof (item as { text?: unknown }).text === "string",
      ))
      .slice(-6)
      .map((item) => ({ role: item.role, text: item.text.slice(0, 2000) }))
    : [];
  if (!memoryId || !question) return NextResponse.json({ error: "Select a memory and enter a question." }, { status: 400 });
  const memory = getMemoryDetail(memoryId);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

  const result = await askHermes(memory, question, messages);
  return NextResponse.json(result, {
    status: result.available ? 200 : 503,
    headers: { "cache-control": "private, no-store" },
  });
}
