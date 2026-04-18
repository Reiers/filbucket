# Architecture

{% hint style="info" %}
This page is the condensed version. The full, opinionated design doc lives at [ARCHITECTURE.md](https://github.com/Reiers/filbucket/blob/main/ARCHITECTURE.md) in the repo.
{% endhint %}

## Stack at a glance

- **Web**: Next.js 15 (App Router), React 19, Tailwind 3, Framer Motion
- **Server**: Node 22, TypeScript, Fastify, Drizzle ORM, Postgres 16, BullMQ, Redis 7, MinIO (S3-compat)
- **Chain**: `@filoz/synapse-sdk` + `viem`, Filecoin calibration (mainnet soon)
- **macOS app**: SwiftUI, SwiftPM (no Xcode), AVKit, PDFKit

## Request path

```
Browser / Mac app
    │
    ▼ REST + XHR PUT
┌───────────────────┐
│  Fastify API      │   ◄── uploads · files · shares · healthz
│  Postgres + Redis │
└────────┬──────────┘
         │ BullMQ jobs
         ▼
┌───────────────────┐
│  Durability       │   ◄── Stream chunks from MinIO to Synapse, persist
│  worker (same     │        pieces + commit events.
│  Node process     │
│  in Phase 0/1)    │
└────────┬──────────┘
         │ Synapse SDK (viem)
         ▼
┌──────────────────────────┐
│  Filecoin Onchain Cloud  │   ◄── PDPVerifier · FilecoinPay · FWSS
│  (shared public infra)   │        Curio storage providers selected via endorsement set.
└──────────────────────────┘
```

## Key design decisions

### 1 · FilBucket is the payer

Users pay fiat (Stripe / Vipps, Phase 2). FilBucket tops up USDFC monthly and pays Filecoin Pay rails on their behalf. **No user ever touches crypto.** This is the single biggest UX unlock.

### 2 · Hot cache first, durability async

Uploads land in hot storage (MinIO / S3) in seconds. The file is **Ready** (downloadable, shareable) immediately. Durability (2-copy replication + PDP commits) happens in the background and takes 5–15 minutes on calibration. This is how we make it feel like Dropbox despite the underlying chain.

### 3 · Chunked streaming upload

Files >200 MiB are split into ≤200 MiB pieces, each streamed from MinIO → Synapse SDK via Node `ReadableStream`. Constant ~128 KB worker memory per chunk. Same dataset is reused across chunks of a file, so one payment rail per file (not per chunk).

### 4 · Proof detection via nextChallengeEpoch

FWSS's `provenThisPeriod()` reverts on freshly-created datasets on calibration (exit 33). We bypass by reading `PDPVerifier.getNextChallengeEpoch` directly and comparing to a snapshot captured at commit time. When the epoch advances, the SP submitted a proof. File → **Secured**.

### 5 · Endorsement-based provider selection

We let FWSS's endorsed SP set drive primary selection; any approved SP can be a secondary. No custom ranking logic in Phase 1.

## Schema

Core tables:

- `users` (id, email)
- `buckets` (user_id, name)
- `files` (bucket_id, name, size_bytes, mime_type, state, hot_cache_key, timestamps)
- `file_pieces` (file_id, piece_cid, byte_start/end, chunk_index/total, sp_provider_id, dataset_id, retrieval_url, role)
- `dataset_rails` (dataset_id unique, provider_id, rail_id, payer, payee, active)
- `commit_events` (file_id, kind, payload jsonb, created_at) — append-only audit log driving UI state
- `shares` (file_id, token unique, password_hash, expires_at, max_downloads, download_count, revoked_at)
- `share_accesses` (share_id, kind, ip, user_agent) — audit log for share abuse

See `apps/server/src/db/schema.ts` for the Drizzle definitions.

## Workers

- **durability** (BullMQ queue `durability`): handles one file at a time, runs the chunked upload → Synapse → commit pipeline.
- **watch-first-proof** (BullMQ queue `watch-first-proof`): polls PDPVerifier per dataset; flips state to Secured on proof landing. Max 6h, then gives up.

Both live in the same Node process as the API in Phase 1. Phase 2 will split them out.

## Failure modes and recovery

See [durability](../concepts/durability.md) for the full table. Short version: faulty SPs trigger repair jobs; ops wallet low-balance triggers paging; chain congestion triggers commit retry. DB loss is covered by PITR + Filecoin-backed offsite of the index.

## What we haven't built yet

- Magic-link auth (Phase 2)
- Stripe billing (Phase 2)
- Aggregation for small files (Phase 2)
- Client-side encryption (Phase 3)
- S3-compatible API for developers (Phase 3)
- iOS app (Phase 3)

See [roadmap](../operations/roadmap.md).
