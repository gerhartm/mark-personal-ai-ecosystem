# Crypto Intelligence dashboard

Production-ready V2 dashboard running on the verified crypto handoff data. It
uses the existing Hermes central brain for answers, the existing unified crypto
database for evidence, and Cloudflare Access for the public authentication
boundary. It does not modify Hermes, OpenViking, or the legacy platform.

Primary workflows:

- **Topics:** the evidence-first home view, built only from real stored tags,
  events, sources, and extracted claims.
- **Sources:** the material Mark supplied, grouped as Transcripts, Tweets, Blog
  posts, and Your notes, with a useful overview, key arguments, retained text,
  and source-scoped Ask.
- **Ask:** plain-language grounded answers with clickable inline evidence and
  the exact corpus records Hermes reviewed.
- **Quiz:** evidence-linked questions, one bounded Hermes grading pass,
  model-answer reveals, feedback, scores, and preserved session history.
- **Studio:** topic-guided, selected-source X posts, X threads, LinkedIn posts,
  review briefs, source-cited drafts, and an explicit Mark or Creator Reference
  writing lens. Format limits are validated before a draft is saved.
- **Speaking Prep:** theses, talking points, likely questions,
  counterarguments, and closing takeaways from a selected date range.
- **Capture:** native OpenViking URL or text ingestion with deterministic
  identity, duplicate protection, and explicit receipts.
- **Satoshi sync:** completed Telegram Crypto ingestions enter a durable FIFO
  registration queue and become visible in Library, full-text search, and the
  bounded ForkedBrain graph without a second ingestion or memory system.

## Run it

```bash
cd server
npm install
npm run build:db          # builds ../data/crypto-intelligence.db from the frozen handoff
npm start                 # http://127.0.0.1:5183
```

```bash
cd web
npm install
npm run build             # the server serves web/dist when it exists
npm run dev               # or the Vite dev server on 5184, proxying /api to 5183
```

Environment, all optional, all by name only:

| Variable | Meaning |
|---|---|
| `PORT`, `HOST` | listen address, defaults `127.0.0.1:5183` |
| `CRYPTO_DB` | path to the active database |
| `CRYPTO_MEDIA_ROOT` | private media archive root. Unset means media is unavailable, which the interface states explicitly |
| `HERMES_BASE_URL` | Hermes dashboard origin. Unset means Ask runs in its explicit degraded state |
| `HERMES_DASHBOARD_USERNAME` | Hermes dashboard service account name |
| `HERMES_DASHBOARD_PASSWORD_FILE` | mounted file containing the Hermes dashboard password |
| `INTELLIGENCE_AUTO_REFRESH_HOURS` | minimum interval between scheduled live intelligence reviews, defaults to `24` |
| `OPENVIKING_BASE_URL` | private OpenViking service origin. Unset leaves Capture explicitly unavailable |
| `OPENVIKING_API_KEY_FILE` | read-only mounted file containing the tenant-scoped OpenViking key |
| `OPENVIKING_ACCOUNT_ID`, `OPENVIKING_USER_ID`, `OPENVIKING_AGENT_ID` | non-secret tenant identity used by the native resource API |
| `SATOSHI_DASHBOARD_SYNC_SECRET_FILE` | read-only file containing the private service credential used by Satoshi's post-ingestion registration helper |
| `REQUIRE_ACCESS_HEADER` | require the verified Cloudflare Access email header outside production as well |
| `ACCESS_ALLOWED_EMAILS` | comma-separated exact allowlist for authenticated users |
| `CRYPTO_ACTOR` | note author for the local single-user build |

## Production deployment

The accepted V2 release is `20260902T084905Z`. Its reproducible runtime contract
is in `deploy/docker-compose.production.yml`; secrets remain in the owner-only
server environment file referenced there. The service publishes only
`127.0.0.1:9330`, joins the existing private Hermes network, runs non-root with a
read-only root filesystem, and receives no model-provider credential. Capture
receives only a tenant-scoped OpenViking key through a read-only file mount; the
credential is absent from the image, environment, logs, and repository.

The public hostname is live at `https://crypto.forkedbrain.fyi/` through the
existing exact-email Cloudflare Access application and the isolated V2 tunnel.
An unauthenticated request must redirect to the Cloudflare Access login, and an
externally forged identity header must not bypass that redirect. Production also
requires the Access identity on static application requests as defense in depth.
The accepted origin and public-boundary tests include the complete dashboard,
private media range streaming, a real sourced live briefing, and a real Hermes
answer with canonical evidence.

The guarded cutover script updates only that Access application and the V2
tunnel route, verifies the exact policy and all existing hostnames, and restores
both automatically if any check fails. Give it a fresh short-lived token through
standard input so the token never appears in the command line or repository:

```bash
dashboard/deploy/activate-crypto-hostname.sh < \
  ../.secrets/credentials/new-vps/cloudflare/access-cutover-token
```

The token needs only `Account > Access: Apps and Policies > Edit` for Mark's
Cloudflare account. Keep the token file mode `0600`, revoke it immediately after
acceptance, and then delete the local token file. A successful run reports
`crypto_status=302`, `legacy_intel_status=200`, and the owner-only backup paths.

## The active database

One SQLite file, `data/crypto-intelligence.db`, built from the immutable
verified handoff and evolved by forward migrations recorded in
`schema_migrations`. The frozen handoff is opened read only, on its own
connection, and is never written to. The build verifies its SHA-256 against
`handoff-manifest.json` and refuses to run on a mismatch.

It holds the migrated corpus, derived facets, notes and their revisions, draft
revisions, quiz and conversation history, media metadata, the canonical identity
register, receipts and audit history, and one unified FTS5 index. Every record
carries an `origin` of `migrated` or `ingested`, so migrated and post-migration
counts stay separately reportable without any structural split.

Rebuilding refuses to run against a database holding ingested records unless you
pass `--force`, because reinitialising recovers the migrated baseline only.

## Tests

```bash
cd server
npm start &               # the API tests exercise the running server
npx vitest run
```

87 tests: reconciliation against the handoff manifest, canonical identity
preservation, facet derivation, precision spans, taxonomy verbatim, append-only
notes, the identity register, unified search determinism, media authorisation
and traversal, the Access identity boundary, bounded Hermes evidence assembly,
safe provider errors, the degraded intelligence plane, URL and text capture,
exact duplicate skipping, partial-native-write cleanup, locked-resource safety,
Studio evidence packaging, citation enforcement, atomic generation, append-only
draft editing, evidence-linked Quiz generation and atomic grading, sourced
briefing validation and preservation, Satoshi sync authentication, durable
queue completion, long-source indexing, replay deduplication, and the build's
refusal of a tampered handoff.

## Screenshots

```bash
cd server
node src/screenshots.mjs
node src/screenshots.mjs --base http://127.0.0.1:9330 --identity approved@example.com
```

Captures every screen at 1440 and 390, plus reduced motion and high contrast,
using a real Chrome so WebGL renders. Output in `screenshots/`.

## Architecture

```text
Authenticated browser
   |  Cloudflare Access assertion
   v
Fastify backend  ->  crypto-intelligence.db   (one database, one FTS index)
   |             ->  private media archive     (authorised per request, range streaming)
   |
   +-> Hermes central brain -> configured model provider
   |
   +-> OpenViking native resource API -> unified semantic memory
```

The backend does no reasoning and adds no second memory system. `POST /api/ask`
selects a small, bounded evidence set from the existing database and asks Hermes
to answer from those records with canonical-ID citations. If Hermes is not
configured or available, the route reports that state plainly and returns exact
corpus matches without presenting them as an answer.

User writes reach the database only from an authenticated browser session.
Satoshi source registration reaches one private internal endpoint authenticated
by a file-mounted service secret; the request contains metadata and an
OpenViking URI, never the retained transcript or a user credential. Notes are
append only: revision 0 is the value preserved in the frozen handoff, and saving
adds a revision rather than editing it.

Studio uses the existing native Hermes agent path so the approved context skills
and unified OpenViking memory remain available. The backend selects a small,
bounded set of existing corpus records and gives Hermes the chosen format,
focus, date window, writing lens, and citation contract. The Mark lens uses the
Crypto context directly. The Creator Reference lens changes expression only and
refuses generation until manually supplied reference material exists. A draft is
saved only when every returned canonical event/source citation resolves in the
existing database. The generated body is revision 0; each browser edit appends
a new revision and leaves the original body untouched. This adds no second
agent, model provider, memory service, or reasoning layer.

The Capture screen submits only a URL or pasted text to the authenticated
backend. The backend computes a stable source identity, prevents exact replay,
and calls OpenViking's native acquisition path. It registers the source and a
receipt in the existing database only after native acceptance. If OpenViking
materialises a target before its embedding provider fails, the backend removes
that exact remote-only target or reports it as still processing; it never marks
the source ready. There is no custom scraper, queue, vector store, memory engine,
or second agent.

After Satoshi completes a Crypto ingestion, its native Crypto skill calls the
small `sync_dashboard_source.py` helper. The helper acknowledges one deterministic
external identity, waits on the private queue, and reports `ready`, `failed`, or
the current processing state. The queue survives application restarts, processes
one registration at a time, retries bounded transient failures, and reads the
full retained source from OpenViking. Replaying the same external identity or
canonical source does not create another source.

## Deliberate boundaries

- No second database, vector service, or memory provider.
- No patch to Hermes or OpenViking native behavior.
- No model-provider key in this container or repository. Runtime credentials
  are the tenant-scoped OpenViking key and Satoshi registration service secret,
  both supplied by read-only file mounts.
- No direct public origin listener. Production binds to VPS loopback and is
  published only through the existing Cloudflare tunnel and Access policy.
- No change to `intel.forkedbrain.fyi`; it remains the isolated legacy service.
