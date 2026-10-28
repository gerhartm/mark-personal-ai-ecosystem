# Crypto Intelligence dashboard

Production-ready V2 dashboard running on the verified crypto handoff data. It
uses the existing Hermes central brain for answers and the existing unified
crypto database for evidence. The application has its own shared-password
login, signed sessions, and Cloudflare Turnstile verification. It does not
modify Hermes, OpenViking, or the legacy platform.

The visible interface preserves Mark's approved Lovable design. Its five
primary screens are:

- **Topics:** the evidence-first home view. Individual claims are grouped into
  topics inside 13 fixed research categories; each topic has a specific title
  and a one-line context. Venture adds a funding-rounds table built only from
  names and amounts written in the stored claims.
- **Timeline:** the uniform category and date view Mark designed, populated from
  real stored events and distinct supporting-source reference counts.
- **Prep:** readable theses, supporting points, evidence, counterarguments, and
  source context generated from a question and selected corpus topics.
- **Haseeb bot:** creator-reference generation through the existing Hermes and
  Studio boundary, using real corpus evidence.
- **Tarun bot:** the second creator-reference workflow using the same verified
  evidence and citation boundary.

**Sources and imports** and **Saved work** are utility links alongside Control
center. Sources accepts batches of article URLs, pasted text, text/transcript
files and Telegram JSON exports. Saved work reopens Prep and creator results,
including citations, inputs and revisions; older drafts remain readable as text.
The existing Ask, Quiz and Studio capabilities remain available in the backend.

Topics refresh every 30 seconds and Timeline every ten seconds while visible, and on focus.
Successful source registration queues evidence extraction through native Hermes;
received, processing, ready and failed states are shown separately. Timeline uses
supported event dates with their actual precision and lists undated evidence
separately. Capture time is never substituted for an unknown event date.

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
| `SOURCE_PROCESSING_ENABLED` | set to `false` to pause source extraction and bulk workers; enabled by default, extraction also requires Hermes |
| `OPENVIKING_BASE_URL` | private OpenViking service origin. Unset leaves Capture explicitly unavailable |
| `OPENVIKING_API_KEY_FILE` | read-only mounted file containing the tenant-scoped OpenViking key |
| `OPENVIKING_ACCOUNT_ID`, `OPENVIKING_USER_ID`, `OPENVIKING_AGENT_ID` | non-secret tenant identity used by the native resource API |
| `SATOSHI_DASHBOARD_SYNC_SECRET_FILE` | read-only file containing the private service credential used by Satoshi's post-ingestion registration helper |
| `AUTH_MODE` | set to `shared-password` for the custom production login |
| `AUTH_USERNAME`, `AUTH_ACTOR` | login name and canonical audit actor, both default to `mark` |
| `AUTH_PASSWORD_HASH_FILE` | read-only file containing the salted scrypt password verifier |
| `AUTH_SESSION_SECRET_FILE` | read-only file containing the session signing secret |
| `AUTH_COOKIE_SECURE` | secure by default; set to `false` only for isolated local HTTP acceptance |
| `TURNSTILE_SITE_KEY` | public Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY_FILE` | read-only file containing the Turnstile secret |
| `TURNSTILE_EXPECTED_HOSTNAME` | required production hostname check, `crypto.forkedbrain.fyi` |
| `TURNSTILE_EXPECTED_ACTION` | required production action check, `workspace_login` |
| `REQUIRE_ACCESS_HEADER` | require the verified Cloudflare Access email header outside production as well |
| `ACCESS_ALLOWED_EMAILS` | comma-separated exact allowlist for authenticated users |
| `CRYPTO_ACTOR` | note author for the local single-user build |

## Production deployment

The accepted application release is `20260910-completion-r3`. Its runtime contract
is in `deploy/docker-compose.production.yml`; secrets remain in the owner-only
server environment file referenced there. The service publishes only
`127.0.0.1:9330`, joins the existing private Hermes network, runs non-root with a
read-only root filesystem, and receives no model-provider credential. Capture
receives only a tenant-scoped OpenViking key through a read-only file mount; the
credential is absent from the image, environment, logs, and repository.

The application login is live through a local Caddy gateway at
`127.0.0.1:9331`. The September 5 cutover installed a real Turnstile widget and
removed only `crypto.forkedbrain.fyi` from the shared Access application. The
public boundary is the custom login, server-side Turnstile verification, and a
Secure HttpOnly signed session. The other application hostnames retain Access.
The guarded cutover script below is retained for recovery, not a step to rerun
on an already accepted deployment.

The guarded removal script updates only the existing Access application,
verifies the exact policy and all existing hostnames, and restores Access
automatically if any check fails. Give it a fresh short-lived token through
standard input so the token never appears in the command line or repository:

```bash
dashboard/deploy/remove-crypto-from-access.sh < \
  ../.secrets/credentials/new-vps/cloudflare/access-update-token
```

The token needs only `Account > Access: Apps and Policies > Edit` for Mark's
Cloudflare account. Keep the token file mode `0600`, revoke it immediately after
acceptance, and then delete the local token file. Create and install a real
Turnstile widget before running this script.

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

104 tests: reconciliation against the handoff manifest, canonical identity
preservation, facet derivation, precision spans, taxonomy verbatim, append-only
notes, the identity register, unified search determinism, media authorisation
and traversal, the Access identity boundary, bounded Hermes evidence assembly,
safe provider errors, the degraded intelligence plane, URL and text capture,
exact duplicate skipping, partial-native-write cleanup, locked-resource safety,
Studio evidence packaging, citation enforcement, atomic generation, append-only
draft editing, evidence-linked Quiz generation and atomic grading, sourced
briefing validation and preservation, Satoshi sync authentication, durable
queue completion, long-source indexing, replay deduplication, structured Prep
and creator validation, publishable-length enforcement, evidence-ID leak
prevention, and the build's refusal of a tampered handoff.

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
   |  password + Turnstile -> signed Secure session
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

Sources and imports submits URLs or retained text to the authenticated
backend. The backend computes a stable source identity, prevents exact replay,
and calls OpenViking's native acquisition path. It registers the source and a
receipt in the existing database only after native acceptance. If OpenViking
materialises a target before its embedding provider fails, the backend removes
that exact remote-only target or reports it as still processing; it never marks
the source ready. The dashboard's SQLite queues coordinate capture and evidence
extraction; acquisition and memory remain native OpenViking operations. There is
no custom scraper, vector store, memory engine or second agent.

After Satoshi completes a Crypto ingestion, its native Crypto skill calls the
small `sync_dashboard_source.py` helper. The helper acknowledges one deterministic
external identity, waits on the private queue, and reports `ready`, `failed`, or
the current processing state. The queue survives application restarts, processes
one registration at a time, retries bounded transient failures, and reads the
full retained source from OpenViking. Replaying the same external identity or
canonical source does not create another source.

After registration, a separate durable source-processing queue extracts bounded
chunks using native Hermes. Exact retained passages back each new claim. All
chunks validate before a source's records are published atomically; checkpoints
survive restarts and fingerprints prevent exact replay duplicates. Unsupported
dates are omitted. Three failed processing attempts stop with a visible retry
action. A five-second worker tick schedules work; it is not a promise that a
document finishes in five seconds. Provider availability and document length
determine completion time and processing consumes the existing model allowance.

Bulk requests accept up to 100 items each, with a persistent per-item queue. The
UI splits larger selections into bounded requests. Supported uploads are TXT,
MD, SRT, VTT, CSV and Telegram JSON (5 MB per file; 250,000 characters per imported
text item). Each retained source can be processed up to 1,000,000 characters;
oversize sources fail visibly rather than silently losing their ending. Audio,
video and PDFs need text/transcript conversion first. Import-ready means the
source was retained; evidence status separately reports extraction completion.

### Topics and categories

The 13 categories are fixed in `server/src/topic-organization.ts` and mirrored
for display in `web/src/lib/categories.ts`. A rebuild runs two passes through
Hermes: it sorts every claim into one category, then groups claims into topics
within each category and writes their titles and context lines from the Topics
instruction in Control center. Claims from one source about the same story or
debate are asked to share a category, so a debate is not split across
categories. Every answer is validated against the stored claims, and any figure
in a title or context line must appear in that topic's claims. The final answer
for a batch is salvaged rather than discarded: wrong claim IDs, repeats and
claims from another category leave their topic instead of sinking it (a topic
that loses more than half of what it listed is dropped). A new topic whose only
problem is its title or context line gets one request for new wording, checked
the same way. When an existing topic gains claims but its proposed new wording
fails, it keeps the new claims and its current title and context line. A topic
that still fails (for example, a new topic left with one claim) is dropped and
its claims wait under their category; the rest of the batch is kept.

When most claims behind a topic report someone's view ("A speaker argues…",
"Dana asserts…") and the title neither names the speaker nor says that someone
argues, warns or expects it, a rebuild or preview asks for a corrected title
(the filing worker does not). This is a correction request only: if the second
answer still states the view as fact, the topic is kept rather than dropped.
Claims that only cite a document ("the source asserts…") count as facts. Only
broken topics, views stated as fact and forgotten claims are worth a whole new
answer; length and style notes alone do not trigger one.

Grouping requests hold up to 60 claims and list up to 80 existing topics from
the same categories by title, so each answer fits well within the six-minute
limit per call (four minutes for sorting). A call that gets no answer is retried
once after a 30-second pause. A batch that still gets no answer waits: its
claims stay uncategorized or ungrouped. Two such batches in a row, or no answer
to any batch, stop the rebuild. Failure messages say why in fixed wording
(time limit, empty answer, out of credits, rate limit, unreachable); provider
messages are never shown.

A rebuild saves nothing when Hermes stops responding, when more than a tenth of
the claims cannot be categorized, or when grouping fails for more than a quarter
of the claims. Of two usable answers, one that states fewer views as fact wins
unless it puts under 90% as many claims into topics; otherwise the answer that
puts more claims into topics is kept. Figures are compared at their written size, so
$285B never stands in for $285 million. The result is stored as `topics.organization.v2` in
`generation_meta`, and each event's `primary_category` becomes the main category
of its claims. Before that, the categories and organization from before the
rebuild are saved (`topics.categories.previous`) so Control center can undo the
last rebuild, each event's first-ever label is kept once
(`topics.categories.original`), and earlier labels are added as tags. Until the
first rebuild, Topics shows the earlier organization unchanged.

Preview runs the same two passes on about 70 claims from the largest earlier
topics and changes nothing. Rebuilds and previews run as persistent background
jobs with saved progress; repeated clicks reuse the active job, and an
interrupted job is marked failed at startup for an explicit retry, avoiding an
unnoticed repeat of paid generation. Each finished rebuild, preview and
regrouping records what happened to the claims in grouping, as counts only
(`grouping` in the job status; for a preview, in its result): placed, listed as
unsorted by the answer, dropped by the checks (with reasons), missing (never
mentioned, or mentioned only with a wrong ID, category or as a repeat), and kept
after new wording.

Group waiting claims (Control center) gives claims that are in no topic a second
look. Waiting claims are batched by category, never mixed, beside the existing
topics of that category, so they can join a topic or start one with each other.
Existing topics keep their claims and every claim keeps its category. It runs as
a background job (`topics.waiting.job`); new filing runs and rebuilds wait while
it runs, nothing is saved if Topics changed meanwhile, and a filing run that was
already under way skips claims that are in a topic by the time it saves. Claims a rebuild could not
categorize are not included; the next rebuild retries them. Undo last rebuild
also removes what this added.

Once a rebuild exists, a filing worker checks every minute for claims that are
not yet organized, including claims committed during a rebuild or before a
restart, and files up to 40 at a time with one Hermes call: they join an
existing topic, start a new topic with another waiting claim, or wait under
their category. Filing never blocks source processing and pauses for 15 minutes
when Hermes is unavailable or answers without usable categories; a claim that
gets three unusable answers waits for the next full rebuild. Funding rounds are
kept only when the company and amount appear as whole names in the retained
evidence passage (or the stored claim when no passage was kept), never as a
fragment of a longer name, and each claim yields at most one round
(`venture.rounds.v1`).

## Deliberate boundaries

- No second database, vector service, or memory provider.
- No patch to Hermes or OpenViking native behavior.
- No model-provider key in this container or repository. Runtime credentials
  are the tenant-scoped OpenViking key and Satoshi registration service secret,
  both supplied by read-only file mounts.
- No direct public origin listener. Production binds to VPS loopback and is
  published only through the existing Cloudflare tunnel and dashboard login.
- No change to `intel.forkedbrain.fyi`; it remains the isolated legacy service.

### Timeline content quality

New source processing stores separate validated headline, explanation and
significance fields in `event_editorial`. The dossier labels inferred significance
as analysis and keeps supporting passages and full sources inspectable. Source
metadata and duplicate claims remain archived and resolvable, while research
views exclude them. Undated items open complete dossiers without invented dates.
Events with no claims keep a label from the original eleven-label taxonomy after
a Topics rebuild; the Timeline shows them under today's matching category
(governance under Tokens & governance, exploit incident under Security &
exploits, and so on) without changing the stored label.
The reviewed September 10 repair and recovery instructions are documented in
`../docs/infrastructure/state/2026-09-10-timeline-quality.md`.
