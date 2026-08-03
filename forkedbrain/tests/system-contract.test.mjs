import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("keeps the experience private-ready, responsive, and free of starter artifacts", async () => {
  const [page, layout, experience, graph, css, packageJson] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/layout.tsx"),
    read("../app/BrainExperience.tsx"),
    read("../app/MemoryGraph.tsx"),
    read("../app/globals.css"),
    read("../package.json"),
  ]);

  const product = page + layout + experience + graph + css;
  assert.match(page, /<BrainExperience \/>/);
  assert.match(layout, /ForkedBrain \| Mark Gerhart/);
  assert.match(layout, /data-theme="dark"/);
  assert.match(experience, /prefers-reduced-motion/);
  assert.match(experience, /forkedbrain-theme-v2/);
  assert.match(graph, /Live relationships/);
  assert.match(graph, /MARK&apos;S MEMORY/);
  assert.match(graph, /Chat with Hermes about this memory/);
  assert.match(graph, /Drag a node to stretch its bonds/);
  assert.doesNotMatch(graph, /Ask Brain about this/);
  assert.doesNotMatch(graph, /Unified Memory|unified-memory/i);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /@media \(min-width: 2400px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.doesNotMatch(packageJson, /vinext|cloudflare:workers|react-loading-skeleton/);
  assert.doesNotMatch(product, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(product, /\u2014|\u2013/);
});

test("uses one existing read-only database and caps the live graph at twenty nodes", async () => {
  const store = await read("../lib/memory-store.ts");
  assert.match(store, /const GRAPH_LIMIT = 20/);
  assert.match(store, /new Database\(dbPath\(\), \{ readonly: true, fileMustExist: true \}\)/);
  assert.match(store, /query_only = ON/);
  assert.match(store, /CRYPTO_DB_PATH/);
  assert.doesNotMatch(store, /OpenViking|vector|embedding|CREATE TABLE|ATTACH DATABASE/i);
});

test("uses Hermes native authenticated transport without changing Hermes", async () => {
  const hermes = await read("../lib/hermes-client.ts");
  assert.match(hermes, /\/auth\/password-login/);
  assert.match(hermes, /\/api\/auth\/ws-ticket/);
  assert.match(hermes, /method: "llm\.oneshot"/);
  assert.match(hermes, /HERMES_DASHBOARD_PASSWORD_FILE/);
  assert.match(hermes, /no remaining credits/);
  assert.doesNotMatch(hermes, /session\.create|prompt\.submit|writeMemory|createMemory/);
});

test("requires the Cloudflare authenticated identity in production", async () => {
  const auth = await read("../lib/request-auth.ts");
  assert.match(auth, /cf-access-authenticated-user-email/);
  assert.match(auth, /ACCESS_ALLOWED_EMAILS/);
  assert.match(auth, /REQUIRE_ACCESS_HEADER/);
});
