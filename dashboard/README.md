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
| `OPENAI_API_KEY_FILE` | read-only mounted file containing the site's OpenAI API key, used only for topic sorting and analysis pages (see AI connection). Unset means those jobs go through Hermes |
| `OPENAI_API_KEY` | the key itself, for local runs only; the file wins when both are set |
| `OPENAI_BASE_URL` | OpenAI API origin, defaults to `https://api.openai.com/v1`; tests point it at a stand-in |
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
   +-> OpenAI Responses API   (topic sorting and analysis pages only; see AI connection)
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
Extraction calls go to Hermes as task `crypto_claims`, so Hermes can pin their
model (`auxiliary.crypto_claims` in Hermes's config); with nothing set there
Hermes uses its main model.

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
the AI: it sorts every claim into one category, then groups claims into topics
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

A new topic needs at least three claims, or claims from at least two sources.
Two claims from one source are one point, not a topic: the checks drop such a
pair (`same_source_pair`) and its claims wait. Existing topics can still gain a
single claim. The same rule applies to rebuilds, previews, regrouping and
filing.

When most claims behind a topic report someone's view ("A speaker argues…",
"Dana asserts…") and the title neither names the speaker nor says that someone
argues, warns or expects it, a rebuild or preview asks for a corrected title
(the filing worker does not). This is a correction request only: if the second
answer still states the view as fact, the topic is kept rather than dropped.
Claims that only cite a document ("the source asserts…") count as facts. Only
broken topics, views stated as fact and forgotten claims are worth a whole new
answer; length and style notes alone do not trigger one.

Sorting requests hold up to 60 claims. Grouping requests in a rebuild or
preview hold up to 30 claims and list up to 80 existing topics from the same
categories by title. Matching requests (filing and regrouping) hold up to 25
claims and list every topic, in every category, by short alias, category and
title (up to 400, the ones sharing the most words with the batch when there are
more). A cross-category grouping request holds up to 120 claims as short lines.
Every Topics call goes along the route set for task `crypto_topics` in the AI
connection (below): by default straight to OpenAI, where a call may take up to
25 minutes. Through Hermes, Hermes can pin the task's model and reasoning effort
(`auxiliary.crypto_topics` in Hermes's config; with nothing set there Hermes
uses its main model), and the time and token limits are twelve minutes and
24,000 output tokens per grouping call, ten minutes and 16,000 tokens per
matching call, eight minutes and 16,000 tokens for sorting, six minutes and
8,000 tokens for new wording.

Hermes ends a streamed answer that shows no progress for 60 seconds, which is
why batches are this small; the direct route uses the same sizes. A sorting or grouping batch that gets no answer because of a time
limit, an empty answer or an error is split in halves, down to 8 claims, and the
halves are sent in its place rather than the whole batch again; a rate limit or
an unreachable AI service gets one retry of the same batch after a 30-second pause
instead. A batch that still gets no answer waits: its claims stay uncategorized
or ungrouped. Two such batches in a row, or no answer to any batch, stop the
rebuild. Failure messages say why in fixed wording (time limit, empty answer,
out of credits, rate limit, unreachable); provider messages are never shown.
Hermes's cut-off messages (a stalled stream, a broken pipe, and the main
model's rejection of the task's reasoning setting when Hermes falls back to it)
count as the time limit.

A rebuild saves nothing when the AI stops responding, when more than a tenth of
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

Filing and Group waiting claims (Control center) place claims across
categories, in two passes:

1. Matching: batches of claims are checked against the titles of every topic,
   in every category. A claim that tells an existing topic's story joins it.
   The AI also writes a one-line story for each claim, with names spelled the
   usual way (a story line that adds a figure is not used; the claim's own text
   stands in).
2. Grouping: the claims that joined no topic are read together, across
   categories, as story lines with their text and source. Claims that tell one
   story start a new topic, under the one category the AI chooses for it. The
   rules for new topics above still apply.

A topic keeps one category, so the Topics page filters still work; a claim
placed in a topic takes that topic's category, and a claim that stays waiting
keeps its own. Before this, a claim could only join a topic in its own category,
so two claims about one story filed under different categories never met. When
a grouping request is cut off, the claims are split into halves ordered by
shared words, so related claims stay in one request.

Group waiting claims runs both passes over every waiting claim, usually five or
six AI calls for about a hundred claims. Existing topics keep their claims. What
it placed is saved even when the AI gave no answer for some requests: those
claims keep waiting, the result line says how many (and how many placed claims
moved to another category), and grouping again retries them. When the AI stays
silent twice in a row it stops and keeps what it has. It runs
as a background job (`topics.waiting.job`); new filing runs and rebuilds wait
while it runs, nothing is saved if Topics changed meanwhile, and a filing run
that was already under way skips claims that are in a topic by the time it
saves. Claims a rebuild could not
categorize are not included; the next rebuild retries them. Undo last rebuild
also removes what this added.

Tidy (Control center) returns topics that would not be started today (one
claim, or two claims from the same source) to the waiting list. It uses no AI
calls, changes no categories, and saves the removed topics
(`topics.tidy.previous`) so Undo tidy can put them back with the claims that are
still waiting; a claim that has since joined another topic stays there, and a
topic left with fewer than two of its claims still in the research is not
restored. A second tidy before the next rebuild adds to the saved topics, so one
undo puts back both. Undo tidy is offered until Topics are rebuilt. Tidy and its
undo wait while a rebuild or regrouping runs.

On the Topics page, claims that are not in a topic are listed under their
source ("Points not in a topic yet"), largest groups first.

### Reading marks

A topic page lets Mark mark the topic read, rate how interesting it was (1 to
5) and bookmark it. The Topics list shows the marks on each card, filters by
Unread, Bookmarked or Read, and sorts by Highest rated. When claims join a topic
after it was marked read, the card shows how many are new, the topic page labels
them, and "Mark read again" clears them. Marks are stored as one JSON value
(`topics.reading.v1` in `app_settings`), so no schema change is involved.

Marks are kept by topic key, with the topic's claims at the time. A rebuild
gives every topic a new key, so a topic with no record of its own shows a
leftover mark (one whose topic no longer exists) when it is that topic's
successor: it was created after the mark last changed, it holds at least two of
the mark's claims and at least half of them, and those claims are at least a
third of the topic. Each leftover mark shows on one topic at most, closest match
first. A topic that existed alongside the old one never takes over its mark, even
if it later takes in the old topic's claims. This is worked out whenever Topics
are read and is never saved, so Undo last rebuild or Undo tidy brings back the
original topics with their own marks. Changing a mark on a topic saves it under
that topic, and the leftover mark it continued is then shown on no other topic;
a topic keeps its record even when every mark is cleared, so a leftover mark
cannot appear in their place. `POST
/api/topics/:tag/reading` takes `read` (true or false), `rating` (1 to 5, or
null to clear) and `bookmarked` (true or false).

Once a rebuild exists, a filing worker checks every minute for claims that are
not yet organized, including claims committed during a rebuild or before a
restart, and files up to 20 at a time with the two passes above, beside up to 5
waiting claims: those sharing the most words with the new claims, in any
category, then the most recent ones in the new claims' categories. New claims
join an existing topic, start a new topic with other claims, or wait under
their category. Filing never blocks source processing and pauses for 15 minutes
when the AI is unavailable or answers without usable categories; a claim that
gets three unusable answers waits for the next full rebuild. Funding rounds are
kept only when the company and amount appear as whole names in the retained
evidence passage (or the stored claim when no passage was kept), never as a
fragment of a longer name, and each claim yields at most one round
(`venture.rounds.v1`).

### Analysis pages

A topic with at least two claims can have an analysis page, shown above its
claims: the argument (a thesis and two to six numbered points), pushback the
claims themselves raise, key quotes, what it means, why it matters, what is
contested, what to watch, and up to four connections to other topics, each
labelled same mechanism, in tension, leads to, follows from or context. The
numbers after a point lead to the claims it rests on: clicking one clears the
claim filters, scrolls to the claim and outlines it.

The AI writes each page in one call, along the route set for task
`crypto_analysis` in the AI connection (below), from the topic's 40 most
significant claims, the retained passage behind each (up to 900 characters),
the research note written when it was extracted, and the 24 other topics most
related to it (shared words, shared sources, same category). The Topic analysis
instruction in Control center shapes the writing; fixed rules keep every fact,
figure, name and date to that evidence. Each answer is checked: every point
names claim IDs from the topic, every written figure must appear in the claims,
passages, notes or claim dates (number words such as "two" count as wording), a
quote must keep at least nine in ten of its passage's words and add no figure,
and a connection must name one of the related topics. Missing or malformed
sections, unknown claim IDs and invented figures get one corrected retry; a
weak quote, watch item or connection is dropped on its own. A call with no
answer is retried once after 30 seconds. A call may take up to 30 minutes on the
direct route; through Hermes (`auxiliary.crypto_analysis` in its config) it may
take up to 15 minutes and 24,000 output tokens. Each page records the model and
reasoning level that wrote it, or that it came through Hermes.

Pages are stored per topic key in `generation_meta` (`topics.analysis.<key>`)
with the claims they were written from, and are never deleted, so a topic
brought back by an undo finds its page again. A page shows how many claims were
added since it was written; once the claims added and removed reach a fifth of
what it was written from (and at least two), it counts as out of date and is
written again by the next run.

Control center writes pages in the background (`topics.analysis.job`): Write 5
sample pages takes the five largest topics without a current page, Write all
remaining takes the rest, and Rewrite on a topic page rewrites that topic. Each
page is saved as soon as it is written. A topic with no usable answer is listed
with the reason and the run moves on; the next run retries it. On the direct
route four pages are written at once; through Hermes, one at a time, since a
cut-off on one Hermes call breaks a call beside it. Two topics in a row with no
answer from the AI stop the run. Rebuilds, previews, regrouping and filing wait
while pages are written, and a queued run waits for a filing run already under
way, so pages are written from topics that are not changing. A run interrupted
by a restart is marked failed at startup, with its pages kept.

### AI connection

Hermes is the central brain and answers everything else: Ask, Studio, Prep,
Quiz, claim extraction, Satoshi and Telegram. Its one-off answers end after 60
seconds without progress, which is too short for a reasoning model working on
the site's two long batch jobs, so since 12 November 2026 (approved by Mark)
those can call OpenAI directly:

| Job | Task | Covers |
|---|---|---|
| Topic sorting | `crypto_topics` | rebuilds, previews, Group waiting claims and filing |
| Analysis pages | `crypto_analysis` | one call per topic page |

Each job has a route (OpenAI direct or Hermes), a model (`gpt-6-astra` or
`gpt-5.6-sol`) and a reasoning level (low, medium or high), set in Control
center's AI connection panel and stored as `ai.routes` in `app_settings`; every
change is audited, and routes cannot change while a Topics or analysis job runs.
The default is OpenAI direct with `gpt-6-astra` at high reasoning. On the Hermes
route, Hermes's own settings choose the model. Without a key, a job set to OpenAI
direct goes through Hermes and the panel says so. A failed direct call is
reported like any other failure, never retried through Hermes.

A direct call uses the Responses API in background mode: the request is sent
with `background: true` and `store: true` (so a long answer can still be read
when it finishes), the answer is requested as a JSON object, and the site checks
every four seconds until it is done, then deletes the stored copy. There is no
60-second window and no output-token cap. The site cancels a request that is
still queued after 5 minutes, or unfinished after 25 minutes (Topics) or 30
minutes (analysis pages); brief network errors while checking are tolerated.
Failures are reported in the fixed wording above.

The panel shows whether the key is present (never the key itself), what each
job uses now, and for the last seven days each job's calls, failures, tokens in
and out (with reasoning tokens) and average time per call, plus the last call's
outcome (`ai.usage` in `app_settings`, kept for 30 days). A failed call is
recorded as a fixed label and, from OpenAI, its status and code ("rate limit,
OpenAI 429 rate_limit_exceeded"); a provider's own message is never stored or
shown. Test sends a one-line request along a job's current route. The routes are
`GET /api/ai/connection`, `PUT /api/ai/connection` with
`{ "jobs": { "<task>": { "via", "model", "reasoning" } } }`, and
`POST /api/ai/connection/test` with `{ "task" }`.

## Deliberate boundaries

- No second database, vector service, or memory provider.
- No patch to Hermes or OpenViking native behavior.
- No model-provider key in the repository or image. The one model-provider key
  in this container is the site's OpenAI key for its two long jobs (approved 12
  November 2026); like the tenant-scoped OpenViking key and the Satoshi
  registration service secret, it is supplied by a read-only file mount.
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
