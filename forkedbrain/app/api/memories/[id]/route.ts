import { NextRequest, NextResponse } from "next/server";
import { getMemoryDetail } from "@/lib/memory-store";
import { authorizeRequest } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!authorizeRequest(request).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const memory = getMemoryDetail(id);
  if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  return NextResponse.json(memory, { headers: { "cache-control": "private, no-store" } });
}
