# Mark Lovable Frontend: Redacted Production Snapshot

**Accepted:** 2026-09-02

**Release:** `20260902T073200Z`

**Status:** accepted in production

## Product state

- Topics is the evidence-first home and contains 65 real corpus topics.
- Sources contains 54 real supplied sources, grouped as Transcript, Tweet, Blog post, and Your notes.
- Source detail provides useful extracted context, retained source text when available, linked claims and events, provenance, and source-scoped Ask.
- Timeline spans every stored year. The default 2026 view contains 42 unique events, 564 dated references, and 112 readable rows.
- Ask preserves successful cited answers in searchable history.
- Prep and Studio allow up to 12 selected evidence sources and support X posts, X threads, LinkedIn posts, speaking preparation, and explicit-period review briefs.
- Creator Reference uses the real corpus boundary and contains no demo creator identities.
- Quiz provides evidence-linked questions, grading, feedback, and revealable model answers.
- Mark's Lovable sample records, fake mention counts, demo bots, random seeded timelines, and placeholder status totals are not part of the active application.

## Architecture boundary

- Hermes remains the only reasoning and generation layer.
- OpenViking remains the only semantic memory provider.
- `crypto-intelligence.db` remains the only structured product database.
- Migration `007 ask_history` adds only successful Ask history to the existing database.
- No second database, vector store, agent, scraper, memory service, model provider, DNS route, tunnel, or Access policy was added.

## Acceptance evidence

- Web and server type checks passed.
- Web and server production builds passed.
- All 86 server tests passed.
- Production dependency audits reported zero known vulnerabilities.
- SQLite quick check returned `ok`; foreign-key violations were zero.
- Production contains 66 canonical events, 54 canonical sources, 89 media assets, and seven ready Telegram source-sync jobs.
- Desktop and mobile browser checks passed the primary workflows with zero JavaScript page errors, zero console errors, and no mobile horizontal overflow.
- Production runs as `dashboard`, uses a read-only root filesystem, drops all capabilities, enables `no-new-privileges`, and publishes only on loopback.
- Unauthenticated Crypto requests redirect to Cloudflare Access, HTTP redirects to HTTPS, and legacy Intel remains HTTP `200`.
- Acceptance made zero paid model calls.

## Recovery

- Pre-promotion database: `/srv/mark-v2/crypto-dashboard/backups/pre-20260902T073200Z/crypto-intelligence.db`
- Previous deployment definition: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260902T073200Z`
- Stopped predecessor: `crypto-dashboard-rollback-20260811T132229Z`
- Active image: `mark-crypto-dashboard:20260902T073200Z`

Secrets and private client payloads are intentionally excluded from this snapshot.
