# Crypto Intelligence dashboard

Production-ready V2 dashboard running on the verified crypto handoff data. It
uses the existing Hermes central brain for answers, the existing unified crypto
database for evidence, and Cloudflare Access for the public authentication
boundary. It does not modify Hermes, OpenViking, or the legacy platform.

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
| `REQUIRE_ACCESS_HEADER` | require the verified Cloudflare Access email header outside production as well |
| `ACCESS_ALLOWED_EMAILS` | comma-separated exact allowlist for authenticated users |
| `CRYPTO_ACTOR` | note author for the local single-user build |

## Production deployment

The accepted V2 release is `20260803T155532Z`. Its reproducible runtime contract
is in `deploy/docker-compose.production.yml`; secrets remain in the owner-only
server environment file referenced there. The service publishes only
`127.0.0.1:9330`, joins the existing private Hermes network, runs non-root with a
read-only root filesystem, and receives no model-provider credential.

The public hostname must be included in the existing exact-email Cloudflare
Access application before the crypto ingress in `deploy/cloudflared-config.yml`
is activated. A public HTTP `200` from an unauthenticated request is a failed
cutover. Production also requires the Access identity on static application
requests as defense in depth. Acceptance requires the Cloudflare Access login
redirect first, then a successful authenticated dashboard and real Ask response.

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

56 tests: reconciliation against the handoff manifest, canonical identity
preservation, facet derivation, precision spans, taxonomy verbatim, append-only
notes, the identity register, unified search determinism, media authorisation
and traversal, the Access identity boundary, bounded Hermes evidence assembly,
safe provider errors, the degraded intelligence plane, and the build's refusal
of a tampered handoff.

## Screenshots

```bash
cd server
node src/screenshots.mjs
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
```

The backend does no reasoning and adds no second memory system. `POST /api/ask`
selects a small, bounded evidence set from the existing database and asks Hermes
to answer from those records with canonical-ID citations. If Hermes is not
configured or available, the route reports that state plainly and returns exact
corpus matches without presenting them as an answer.

Writes reach the database only from the authenticated browser session. Notes are
append only: revision 0 is the value preserved in the frozen handoff, and saving
adds a revision rather than editing it.

## Deliberate boundaries

- No second database, vector service, or memory provider.
- No patch to Hermes or OpenViking native behavior.
- No model-provider key in this container or repository.
- No direct public origin listener. Production binds to VPS loopback and is
  published only through the existing Cloudflare tunnel and Access policy.
- No change to `intel.forkedbrain.fyi`; it remains the isolated legacy service.
