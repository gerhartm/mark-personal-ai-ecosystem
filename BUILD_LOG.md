# Build and maintenance log

## 2026-10-20 — Accidental import removal

Checkpoint: `wrong-import-removal-20261020` (the commit containing this entry).

Completed the owner's request to remove dashboard import 37. Removed one source, its 12 extracted research entries, 25 dashboard search-index rows, processing chunks, import record and dependent metadata. No application code or deployment configuration changed.

Used OpenViking's supported recursive resource deletion API. It reported 13 indexed nodes removed, successful linked-memory cleanup, and completed semantic refresh with no errors. A shared Ethereum memory was updated rather than deleted.

Validation: dry-run transaction passed; actual deletion checked every unrelated dashboard row against its pre-operation value. Foreign-key and SQLite integrity checks passed. Target source/import/evidence/index checks returned zero rows. Memory resource stat returned 404; semantic search returned no references to the removed resource; the updated linked memory contained no filename or source-identifier reference. Dashboard health remained OK.

Limitations: this removes the import from the active corpus, not historical audit records, session archives or disaster-recovery backups. A root-only targeted database rollback copy remains on the VPS, outside application mounts and searchable memory. No private document content or credentials are committed here. Reverting this documentation commit does not restore deleted data.

## 2026-10-27 — Owner SSH access

Checkpoint: `owner-ssh-access-20261027` (the commit containing this entry).

Added the owner-supplied Ed25519 key, comment `mark-mac-forkedbrain`, to the netcup server root authorized keys after confirming its SHA256 fingerprint matched the owner's supplied fingerprint. This authorizes root-level server access. Existing keys were preserved; a root-only pre-change authorized-keys backup was retained on the server.

Validation: installed key occurs exactly once, fingerprint verified using ssh-keygen, root SSH directory mode 700 and authorized_keys mode 600, sshd configuration validation passed. Retrieved the server's Ed25519 host-key fingerprint for first-connection verification. Existing operator SSH access remains functional.

No release-helper, Satoshi, application or deployment changes were made. Mark must test login using his own private key; we do not possess it and have not performed that login. The proposed ops/operator-release branch was not reviewed or installed in this access task. Rollback consists of removing only this exact public-key entry, not replacing the whole authorized_keys file or reverting this documentation commit.

## 2026-10-28 — Owner control

Checkpoint: `owner-control-20261028` (the commit containing this entry).

Mark is the only approver. `CLAUDE.md`, the runbook, the credential register, the dashboard handoff and the ingestion design name Mark wherever they asked for Darshan's approval, review or notification, on `main` (pull request #2) and on `satoshi-dashboard`. Darshan's access was intentionally left unchanged at Mark's request.

Installed the release helper from `ops/owner-control` (commit `2b85e1c`) with `tools/owner-access/install-release-helper.py` at 18:59 UTC. The replaced helper matched the reviewed operator-release version (SHA-256 `e1894382…`) and is backed up on the server. Release commits are now signed as Mark with his GitHub noreply address, and the release checkout points at `gerhartm/mark-personal-ai-ecosystem`.

First documentation-only release: `ux/owner-approvals@c5c8bc7` was published as `9eafd84` on `satoshi-dashboard` at 19:01 UTC, signed by Mark, with a `documented` ledger entry. The website was not rebuilt or restarted.

Validation: the installer ran a second time at 19:04 UTC and reinstalled the identical helper (SHA-256 `3481b4c7…`); its read-only `operator history` check confirmed that GitHub and the release ledger agree at `9eafd84`. Both pinned downloads passed their SHA-256 checks. The helper's 37 unit tests pass, including the documentation-release cases.

Rollback: run the installer with `--restore` and the 18:59 UTC backup folder to put back the previous helper, commit identity and remote. Documentation is changed back with a new documentation branch, not by rewriting history.
