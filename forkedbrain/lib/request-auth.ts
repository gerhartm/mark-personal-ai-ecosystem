import type { NextRequest } from "next/server";

const allowedEmails = new Set(
  (process.env.ACCESS_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function authorizeRequest(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_ACCESS_HEADER !== "true") {
    return { authorized: true, email: "local-development" };
  }
  const email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase() || "";
  if (!email) return { authorized: false, email: "" };
  if (allowedEmails.size && !allowedEmails.has(email)) return { authorized: false, email };
  return { authorized: true, email };
}
