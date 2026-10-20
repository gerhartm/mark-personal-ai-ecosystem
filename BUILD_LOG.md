# Build and maintenance log

## 2026-10-20 — Accidental import removal

Checkpoint: `wrong-import-removal-20261020` (the commit containing this entry).

Completed the owner's request to remove dashboard import 37. Removed one source, its 12 extracted research entries, 25 dashboard search-index rows, processing chunks, import record and dependent metadata. No application code or deployment configuration changed.

Used OpenViking's supported recursive resource deletion API. It reported 13 indexed nodes removed, successful linked-memory cleanup, and completed semantic refresh with no errors. A shared Ethereum memory was updated rather than deleted.

Validation: dry-run transaction passed; actual deletion checked every unrelated dashboard row against its pre-operation value. Foreign-key and SQLite integrity checks passed. Target source/import/evidence/index checks returned zero rows. Memory resource stat returned 404; semantic search returned no references to the removed resource; the updated linked memory contained no filename or source-identifier reference. Dashboard health remained OK.

Limitations: this removes the import from the active corpus, not historical audit records, session archives or disaster-recovery backups. A root-only targeted database rollback copy remains on the VPS, outside application mounts and searchable memory. No private document content or credentials are committed here. Reverting this documentation commit does not restore deleted data.
