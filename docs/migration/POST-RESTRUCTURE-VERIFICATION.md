# Post-Restructure Verification

**Verified:** 2026-07-31  
**Result:** Passed

## Integrity

- All three authoritative client deliverables match their pre-move SHA-256 hashes.
- The editable technical-review HTML source matches its pre-move SHA-256 hash.
- Both consolidated communication attachments match their original SHA-256 hashes.
- Both relocated SSH private keys match their pre-move SHA-256 hashes.
- All 1,396 legacy-export checksum entries pass from the new client-root location.
- Post-restructure private manifest contains 543 entries.

The private pre- and post-restructure manifests are stored under `.secrets/migration-manifests/` because they include hashes and paths for sensitive credential-bearing files.

## Access and secrets

- `ssh mark-netcup-v2` succeeds using the relocated key under the Mark client folder.
- The local Coolify environment backup matches the remote `/data/coolify/source/.env` hash.
- The Coolify internal SSH keypair is preserved under the new-VPS credential directory.
- Old- and new-VPS master credential records both exist and use mode `0600`.
- Mark-specific SSH private keys use mode `0600`.
- Secret-pattern scanning found no raw credential values outside `.secrets/` and `_quarantine/`.
- The new server still has zero running Docker containers; the restructure did not resume Coolify.

## Structure and cleanup

- The former `GERHART`, `PDF's`, and `_source` paths no longer exist.
- The former Mark-specific LVLUP audit and render paths no longer exist outside the client folder.
- The former `~/.ssh/mark_netcup_v2*` and `~/.ssh/mark_hetzner_review*` paths no longer exist; SSH config points to the client-folder key.
- The active non-secret tree has zero exact duplicate groups.
- Seven original non-secret `.DS_Store` files plus private-source Finder artifacts are quarantined.
- Generated and duplicate material remains recoverable under `_quarantine/2026-07-31/`.

## Size summary

| Area | Size |
|---|---:|
| Source material | 264 KB |
| Active project workspace | 192 KB |
| Client deliverables | 1.0 MB |
| Private secrets and verified legacy export | 1.9 GB |
| Reversible quarantine | 55 MB |
| Total client folder | 2.0 GB |

## Remote documentation mirror

Six non-secret infrastructure Markdown files were refreshed under `/root/mark-v2-docs/`. Local and remote SHA-256 manifests match, and zero Docker containers remain running.

## Remaining actions

1. Mark should rotate the netcup panel password and enable two-factor authentication.
2. The netcup panel password and root recovery password remain marked as not stored until Mark resets/provides them.
3. Create the Coolify administrator under Mark's ownership when deployment resumes.
4. Add Hermes, OpenViking, Telegram, provider, database, storage, and backup credentials as they are created or approved.
5. Delete `_quarantine/2026-07-31/` only after explicit approval.
