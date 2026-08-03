import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/memory-store";
import { authorizeRequest } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!authorizeRequest(request).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const group = request.nextUrl.searchParams.get("group") || "all";
  const query = request.nextUrl.searchParams.get("query") || "";
  const validGroup = ["all", "source", "event", "artifact"].includes(group) ? group : "all";
  return NextResponse.json(getGraph(validGroup, query), {
    headers: { "cache-control": "private, no-store" },
  });
}
