# Mark Gerhart Project Folder Restructure Plan

**Audit date:** 2026-07-31  
**Status:** Executed on 2026-07-31; generated and duplicate files remain in reversible quarantine  
**Scope:** `/Users/02darsh/Business/GrowthForge AI/GFAI Clients/Mark Gerhart`

## Audit summary

- Current total size: approximately **2.0 GB**.
- The protected legacy-VPS material accounts for approximately **1.9 GB**. It is verified migration data, not disposable clutter.
- The active `GERHART/tmp/` directory accounts for approximately **45 MB** across 160 generated files.
- The non-secret workspace contains **33 exact duplicate groups**, representing approximately **21.6 MB** that can be reclaimed while keeping one copy of each file.
- The two existing VPS technical-review PDFs are byte-for-byte identical.
- Seven non-secret `.DS_Store` files and one Python `__pycache__` directory are disposable operating-system/runtime artifacts.
- The final Option 1 PDF in `output/pdf/` has an identical render copy under `tmp/`; the `output/` copy is authoritative.

## Protected material — do not delete

The following directories are the verified safety copy of the old system and must remain unchanged until the V2 migration has been completed and validated:

- `.secrets/old-vps-data-export-2026-07-30/`
- `.secrets/credentials/old-vps/`

The data export is approximately 1.9 GB and contains 1,395 payload files. Its 1,396 checksum entries were verified successfully, and all nine SQLite snapshots passed integrity checks. This archive contains the authoritative Crypto, Content Intelligence, Sapphire Media, application, conversation, and infrastructure material needed for migration.

The archive must be treated as immutable. V2 imports should operate on a separate migration-staging copy or generated normalized dataset, never by modifying the export in place.

## Authoritative files to retain

| Current item | Role | Decision |
|---|---|---|
| `_source/crypto-intel-technical-review.html` | Editable source for the original VPS review | Keep and relocate under `01-Source-Material/technical-review/` |
| `Crypto-Intel VPS Technical Review.pdf` | Original technical-review deliverable | Keep one copy and relocate under `04-Deliverables/technical-review/` |
| `PDF's/VPS-Technical-Review.pdf` | Exact duplicate of the preceding PDF | Remove after the retained copy is hash-verified |
| `GERHART/output/docx/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.docx` | Editable Option 1 proposal | Keep and relocate under `04-Deliverables/option-1/` |
| `GERHART/output/pdf/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.pdf` | Final Option 1 proposal | Keep and relocate under `04-Deliverables/option-1/` |
| `GERHART/output/Old-VPS-Credential-Inventory.md` | Redacted legacy credential report | Keep under `02-Project-Workspace/docs/security/` |
| `GERHART/docs/infrastructure/` | Current V2 build record and runbook | Keep under `02-Project-Workspace/docs/infrastructure/` |
| `GERHART/tools/*.py` | Reusable document and audit utilities | Keep under `02-Project-Workspace/tools/` |

## Safe cleanup candidates

These items are generated, reproducible, or exact duplicates. They should first be moved to a dated quarantine directory, verified, and only then removed.

1. `GERHART/tmp/` — approximately 45 MB of document renders, page images, contact sheets, extracted text, prior revisions, and generated proposal assets. The proposal generator recreates its diagram and working files.
2. Seven non-secret `.DS_Store` files.
3. `GERHART/tools/__pycache__/` — approximately 32 KB of reproducible Python bytecode.
4. One of the two identical VPS technical-review PDFs.
5. The obsolete `PDF's/` directory after its retained deliverable has been consolidated.

Deleting only byte-for-byte duplicate files would recover about 21.6 MB. Removing the complete reproducible `tmp/` workspace would recover about 45 MB and produce the cleaner result.

## Proposed target structure

```text
Mark Gerhart/
├── README.md
├── 01-Source-Material/
│   └── technical-review/
│       └── crypto-intel-technical-review.html
├── 02-Project-Workspace/
│   ├── README.md
│   ├── docs/
│   │   ├── architecture/
│   │   ├── decisions/
│   │   ├── infrastructure/
│   │   ├── migration/
│   │   └── security/
│   ├── tools/
│   │   ├── audit/
│   │   └── documents/
│   ├── src/
│   ├── tests/
│   └── .work/
├── 03-Legacy-System/
│   └── README.md
├── 04-Deliverables/
│   ├── technical-review/
│   │   └── VPS-Technical-Review.pdf
│   └── option-1/
│       ├── Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.docx
│       └── Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.pdf
└── .secrets/
    ├── credentials/
    │   ├── old-vps/
    │   │   └── ALL-CREDENTIALS.txt
    │   └── new-vps/
    │       └── ALL-CREDENTIALS.txt
    ├── old-vps-data-export-2026-07-30/
    └── legacy-audit-evidence-2026-07-21/
```

### Directory roles

- `01-Source-Material/`: original client inputs and editable source documents.
- `02-Project-Workspace/`: the active V2 build, technical documentation, code, tests, and reusable tools.
- `02-Project-Workspace/.work/`: disposable generated output only. This directory should be ignored by Git and may be cleared after verification.
- `03-Legacy-System/`: non-secret index and migration notes that describe the immutable export. The private payload itself remains under `.secrets/`.
- `04-Deliverables/`: one authoritative copy of each file sent to Mark.
- `.secrets/`: owner-only credentials and private exports. It must never be committed or uploaded publicly.

## Exact relocation map

| From | To |
|---|---|
| `_source/crypto-intel-technical-review.html` | `01-Source-Material/technical-review/crypto-intel-technical-review.html` |
| `Crypto-Intel VPS Technical Review.pdf` | `04-Deliverables/technical-review/VPS-Technical-Review.pdf` |
| `GERHART/output/docx/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.docx` | `04-Deliverables/option-1/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.docx` |
| `GERHART/output/pdf/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.pdf` | `04-Deliverables/option-1/Mark-Gerhart-Option-1-Architecture-and-Phase-Plan.pdf` |
| `GERHART/output/Old-VPS-Credential-Inventory.md` | `02-Project-Workspace/docs/security/Old-VPS-Credential-Inventory.md` |
| `GERHART/docs/infrastructure/` | `02-Project-Workspace/docs/infrastructure/` |
| `GERHART/tools/build_mark_option1_proposal.py` | `02-Project-Workspace/tools/documents/build_mark_option1_proposal.py` |
| `GERHART/tools/remote_credential_inventory.py` | `02-Project-Workspace/tools/audit/remote_credential_inventory.py` |
| `GERHART/tools/remote_current_credential_audit.py` | `02-Project-Workspace/tools/audit/remote_current_credential_audit.py` |

Tool paths inside `build_mark_option1_proposal.py` must be updated at the same time as relocation so that future builds write to `.work/` and `04-Deliverables/option-1/` correctly.

## V2 credential-file plan

The raw V2 credentials file should be created later at:

`Mark Gerhart/.secrets/credentials/new-vps/ALL-CREDENTIALS.txt`

It will follow the existing old-VPS credential-file style while clearly separating:

- netcup account and recovery access;
- server address, hostname, and SSH access references;
- Coolify administrator and internal platform credentials;
- Hermes, OpenViking, Telegram, AI-provider, and application credentials;
- creation date, owner, status, purpose, and rotation notes for every credential.

The file must use local permissions `0600`. Private SSH-key contents should remain in their dedicated SSH key files and be referenced by path and fingerprint rather than duplicated unnecessarily.

The existing redacted `CREDENTIAL-REGISTER.md` remains useful as a safe operational index, but it is not a replacement for the requested private raw credential file.

## Safe execution sequence

1. Create the target directories and root README files.
2. Copy authoritative files into the target structure.
3. Verify every copied file by SHA-256 hash.
4. Update tool paths and documentation links.
5. Move cleanup candidates into a dated `_quarantine/` directory rather than deleting them immediately.
6. Verify that final deliverables, infrastructure docs, tools, and legacy checksums still work.
7. Remove the quarantined generated files only after approval.
8. Leave the two legacy `.secrets` directories unchanged through V2 migration and acceptance.

## Proposed decision

Proceed with this structure, but perform the change in two reversible passes:

- **Pass 1 — reorganize and verify:** create directories, relocate authoritative material, update references, and quarantine duplicates/generated files.
- **Pass 2 — clean:** delete only the verified quarantine after explicit approval.
