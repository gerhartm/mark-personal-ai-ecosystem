# Crypto Intelligence real Hermes Control Center QA

Date: 2026-09-05

Release: `20260905T072131Z`

Status: accepted in canary and production

## Scope

This release completes a destructive-safe, paid-model acceptance pass for the Control Center and every visible Mark-designed workflow. All prompt edits, topic rebuilds, generated drafts, draft revisions, and failure cases were exercised against a disposable SQLite backup on loopback port `9331`. Production content was not used for mutative testing.

## Defects found and corrected

1. Generated topic titles could be silently cut at 100 characters, including in the middle of a word. Topic validation now rejects titles over 96 characters, titles over 16 words, raw Markdown titles, and titles ending in an incomplete connector. The generation prompt asks for complete 5 to 16 word titles and permits one bounded correction request when the first structured result is invalid.
2. Bodyless Control Center actions inherited a JSON content type from the shared web client. Fastify therefore rejected Restore Default and Rebuild Topics before the handler ran. The client now adds the JSON content type only when a request body exists.

## Real Hermes acceptance

Thirteen user-level paid generation exercises were completed across two disposable canaries. They included:

- two real Topics reorganizations;
- two real Prep briefs;
- real Haseeb generation and revision workflows;
- real Tarun short articles;
- one prompt-effect generation for Prep, Haseeb, and Tarun after changing each page instruction.

The final canary produced 16 focused topic arguments. The longest title was 85 characters, no title was incomplete, and a selected topic resolved to four exact events, four source records, 20 extracted claims, source URLs, dates, channels, and related tags.

The final fresh generation pass returned:

- Prep: five points, five source cards, citations on every point, a concrete counterargument on every point, no raw Markdown, and a direct answer before the supporting detail;
- Haseeb: three medium posts of 185, 197, and 193 characters, followed by revision 1 at 174, 197, and 206 characters, with the same draft identity and citations retained;
- Tarun: one 344-word short article, three citations, rendered headings, and no internal evidence IDs in publishable copy.

For the prompt-effect pass, each page followed its temporary page-specific instruction exactly. All controls were then restored to their defaults. Save, restore, revision history, active topic organization, generated drafts, and draft revisions survived a canary restart.

## Failure and boundary acceptance

The canary returned the intended errors for:

- unknown prompt page: HTTP `404`;
- attempted Timeline prompt edit: HTTP `409` because Timeline is evidence-only;
- empty and underspecified instructions: HTTP `400`;
- instructions over 4000 characters: HTTP `400`;
- missing Prep focus: HTTP `400`;
- invalid Prep lens: HTTP `400`;
- invalid creator: HTTP `400`;
- creator revision without a prior draft: HTTP `400`.

No invalid request created a prompt revision or generated draft.

## Automated and browser verification

- Server tests: 98 of 98 passed across 11 files.
- Server TypeScript check: passed.
- Web TypeScript check: passed.
- Web production build: passed.
- `git diff --check`: passed.
- Final canary browser acceptance: 89 of 89 passed.
- Production browser acceptance: 89 of 89 passed.
- First-party browser request failures: 0.
- Browser console errors: 0.

The browser suite covered all five Mark-designed screens, topic detail, source filters, historic Timeline controls, clickable category colors, full event dossiers, Prep evidence and quotes, Haseeb generation and revision, Tarun blog rendering, requested lengths, Control Center, dark mode, desktop, 390-pixel mobile, live Telegram counts, raw Markdown, horizontal overflow, requests, and console behavior.

## Production and recovery

- Production image: `mark-crypto-dashboard:20260905T072131Z`
- Immediate rollback container: `crypto-dashboard-rollback-20260905T061516Z`
- Immediate rollback image: `mark-crypto-dashboard:20260905T061516Z`
- Database backup: `/srv/mark-v2/crypto-dashboard/backups/pre-20260905T072131Z/crypto-intelligence.db`
- Deployment snapshot: `/srv/mark-v2/crypto-dashboard/deploy.pre-20260905T072131Z`

After promotion, production retained 66 events, 54 sources, 89 media assets, all prompt controls at revision 0, and live Telegram state of 7 received, 7 synced, 0 processing, and 0 failed. A production restart preserved the database checksum and all counts. The container remained healthy, non-root, read-only, capability-dropped, protected by `no-new-privileges`, and bound only to `127.0.0.1:9330`.

Public HTTPS remained behind Cloudflare Access, HTTP redirected to HTTPS, and `intel.forkedbrain.fyi` remained available and unchanged. Hermes configuration, OpenViking, Satoshi, Cloudflare objects, ForkedBrain, and the legacy Intel service were not modified.

No credential, private source text, generated draft body, or client content is recorded in this state file.
