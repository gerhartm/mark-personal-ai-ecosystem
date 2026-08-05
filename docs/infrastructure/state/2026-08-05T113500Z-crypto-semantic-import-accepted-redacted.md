# Crypto semantic import acceptance — redacted snapshot

**Captured:** 2026-08-05 11:35 UTC
**Scope:** native OpenViking semantic memory for Crypto Intelligence V2
**Status:** accepted

## Runtime

- OpenViking: official `v0.4.11` digest-pinned image, private internal service, no published host port.
- Hermes memory provider: native `openviking`, installed and available.
- Resource-processing VLM: `gpt-5.6-luna`, reasoning disabled, one retry, native concurrency four.
- Vector model: `text-embedding-3-small`.
- Final queue: zero pending, zero running, zero errors, zero active locks.

## Identity and replay proof

| Check | Result |
|---|---:|
| Source/artifact targets | 131 of 131 |
| Event targets | 66 of 66 |
| Total deterministic targets | 197 of 197 |
| Missing/locked/error targets | 0 |
| Acceptance replay skips | 197 |
| Acceptance replay creates | 0 |
| Acceptance replay failures | 0 |
| Representative deep provenance reads | 6 of 6 |

Identity is checked with native deterministic target `stat`, never semantic
search. The importer therefore remains replay-safe without a model call for
identity resolution.

## Intelligence acceptance

- Native memory retrieval returned the expected Crypto event from OpenViking.
- Production Crypto Ask returned through Hermes in connected mode.
- Eight canonical evidence records were supplied.
- Four citations were returned and all four resolved to supplied canonical evidence.
- Free-form model citations are never treated as identity or authorization; the production boundary validates citations against canonical records.

## Cost

The combined OpenViking observers estimate approximately **$3.46** for the
clean Luna import, including embeddings. The billing dashboard remains
authoritative. Embedding work accounted for only cents and has no fixed monthly
storage charge.

## Recovery

Accepted server recovery point:

```text
/root/mark-v2-backups/20260805T112800Z-post-complete-crypto-import/
```

- Archive: `openviking-data.tar.gz`
- Bytes: `34,801,436`
- File mode: `0600`
- Checksum: verified through the adjacent `SHA256SUMS`
- Restore drill: passed in a disposable volume under the same pinned image
- Restored proof: service healthy and exact imported target stat succeeded
- Cleanup: disposable container and volume removed

The final manifest and receipts are retained separately in the owner-only local
secret tree. This redacted snapshot contains no client packet content,
credentials, API keys, cookies, or raw model output.

## Unchanged boundaries

No Cloudflare, DNS, tunnel, Access, public hostname, dashboard code, Telegram,
Hermes source, OpenViking source, legacy service, or client credential changed.
The legacy Crypto endpoint remained live.
