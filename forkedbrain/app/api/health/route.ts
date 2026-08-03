import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/memory-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    const database = checkDatabase();
    return NextResponse.json({ status: database.ok ? "ok" : "degraded", database: database.result }, { status: database.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "unavailable" }, { status: 503 });
  }
}
