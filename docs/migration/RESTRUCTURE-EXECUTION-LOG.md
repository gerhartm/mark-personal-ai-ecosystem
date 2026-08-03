# Client Folder Restructure Execution Log

**Executed:** 2026-07-31  
**Scope:** Consolidate all Mark Gerhart project material under the client-owned folder  
**Method:** Hash first, relocate authoritative files, quarantine generated/duplicate material, verify afterward

## Pre-move safeguards

- Captured a SHA-256 manifest covering 524 client, external-workspace, attachment, and SSH files, excluding the separately checksummed 1.9 GB legacy export.
- Verified all 1,396 entries in the legacy export checksum manifest before relocation.
- Confirmed that the two VPS technical-review PDFs were byte-for-byte identical.
- Confirmed the final Option 1 PDF under the former `output/` directory matched its final render copy.

## Consolidated external assets

- Imported the pre-contract Upwork conversation and July 17 meeting transcript from Codex-managed attachments.
- Imported the final Hetzner read-only access guide and document-builder sources from the former LVLUP working directory.
- Relocated the complete original technical-audit evidence directory from LVLUP into private legacy evidence storage.
- Relocated the dedicated Hetzner and netcup SSH keypairs into the corresponding private credential directories.
- Updated the local SSH alias for `mark-netcup-v2` and verified key-only access afterward.
- Preserved the current Coolify internal environment from the new server in owner-only local credential storage.

## Quarantined material

- Former `GERHART/tmp/` render tree.
- Python bytecode cache.
- Superseded LVLUP Hetzner-guide render tree.
- Duplicate copy of the VPS technical-review PDF.
- Old minimal `.gitignore` after replacement by the client-root ignore policy.
- Finder `.DS_Store` files.

Nothing in quarantine is authoritative. Quarantine is retained until explicit cleanup approval.

## Protected material

- The legacy data export was moved as one intact directory without changing its contents.
- The raw old-VPS credential bundle was moved as one intact directory and supplemented with the relocated SSH keypair.
- No server application, container, or client dataset was started or modified during the folder restructure.

