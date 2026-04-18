# FilBucket Architecture

*How we build a Dropbox-style product on top of Filecoin without the user ever seeing Filecoin.*

Author: Capri
Status: v0 design, ready for a build plan
Audience: Nicklas + future engineers

---

## 1. Guiding constraints (from PROJECT.md + SOUL.md)

1. It must feel like Dropbox, not like a crypto dashboard.
2. Users never touch: wallets, CIDs, deals, SPs, chain, tokens.
3. Uploads feel instant. Durability happens behind the curtain.
4. We control the payment rail. User pays fiat (or card / Stripe) — FilBucket pays USDFC to SPs.
5. Share links must be fast and not require the sharer's recipient to know Filecoin exists.
6. We never invent new crypto primitives. We use **Filecoin Onchain Cloud (FOC)**: PDP + Filecoin Pay + FWSS, via the **Synapse SDK**.

If it feels like crypto, it loses. If it feels like a clean file product that quietly uses Filecoin well, it has a shot.

---

## 2. The Filecoin stack we are building on

FilBucket does **not** run a storage provider. It is a client of the FOC stack. This is the mental model:

```
     ┌──────────────────────────── FilBucket app ─────────────────────────────┐
     │  Web app (React/Next.js) + iOS/Mac later                               │
     │  - Upload, library, share, restore UX                                  │
     │  - Stripe/Vipps billing                                                │
     │  - No wallet, no CID in UI                                             │
     └────────────────────────────┬───────────────────────────────────────────┘
                                  │ REST + S3-compatible
                                  ▼
     ┌─────────────────── FilBucket backend (our code) ───────────────────────┐
     │  - Auth (email + magic link, optional social)                          │
     │  - Metadata DB: users, buckets, files, pieces, shares, states          │
     │  - Ingest + chunker + aggregator (small files → CAR bundles)           │
     │  - Hot-cache layer (S3 + CloudFront / Caddy)                           │
     │  - Durability orchestrator (talks to FOC)                              │
     │  - Billing + quota + abuse/AV pipeline                                 │
     │  - Sharing service (signed short URLs)                                 │
     └────────────┬──────────────────────────────────────┬────────────────────┘
                  │ Synapse SDK (TS, Node)                │ Stripe / Vipps
                  ▼                                       ▼
     ┌─── Filecoin Onchain Cloud (shared public infra) ───┐
     │                                                    │
     │  Filecoin L1 (FEVM)                                │
     │   ├── PDPVerifier      (challenge/response proofs) │
     │   ├── FilecoinPay      (streaming USDFC rails)     │
     │   ├── FWSS             (warm storage business)     │
     │   └── ServiceProviderRegistry                      │
     │                                                    │
     │  Curio SPs (many, selected via FWSS endorsement)   │
     │   ├── /pdp/data-sets, /pdp/piece/uploads/…         │
     │   ├── prove every challenge window                 │
     │   └── retrievable via HTTP + FilBeam CDN           │
     └────────────────────────────────────────────────────┘
```

Three contracts matter for us:
- **PDPVerifier** — verifies that the SP still holds the data (no sealing, no proof-of-replication; just "prove you have these pieces"). Proving every N epochs forever, or the rail defaults.
- **Filecoin Pay** — USDFC streaming payment rails. Payer (us) → Payee (SP). Lockup = 30-day safety net. We can terminate; SP can settle.
- **FWSS (Filecoin Warm Storage Service)** — the product contract that ties PDP + Pay together, handles pricing, dataset lifecycle, listener callbacks, metadata matching.

Pricing (as of Feb 2026, FOC mainnet):
- **$2.50/TiB/month/copy** base storage
- **~$0.014/GiB** FilBeam CDN egress (optional)
- **1 USDFC setup fee** per dataset (if CDN enabled)
- Min ~$0.06/mo per dataset (under ~24.5 GiB, you still pay the floor)

At user-visible pricing of, say, $10/month for 500 GB + 100 GB of monthly egress:
- Cost floor: 2 copies × 500 GB × $2.50/TiB/mo = **$2.50/user/mo** storage
- Egress: 100 GB × $0.014 = **$1.40/user/mo**
- Gross margin per active user: ~60%. Actually viable.

---

## 3. The durability pipeline

This is the beating heart. An uploaded file has to travel from "user clicks Upload" to "proven on Filecoin every proving period, for years." We make it feel instant by doing the chain work asynchronously, with clear human-readable states.

### File states (what the UI shows)

| UI label       | Internal state       | Meaning                                                                |
|----------------|----------------------|------------------------------------------------------------------------|
| Uploading      | `uploading`          | Bytes still in flight to FilBucket edge                                |
| Ready          | `hot_ready`          | In hot cache, downloadable, not yet on Filecoin                        |
| Secured        | `pdp_committed`      | Pinned on ≥2 SPs, first PDP proof accepted, rail active                |
| Archived       | `archived_cold`      | Removed from hot cache. Still on Filecoin, first-byte latency ≥ seconds |
| Restoring      | `restore_from_cold`  | Rehydrating from SP back into hot cache                                |
| Failed         | `failed`             | Upload died or commit failed. Show retry. Never silently lose data.    |

### End-to-end flow

```
1. Client uploads to FilBucket edge  ───────────────────►  S3 hot bucket + Postgres row
   UI: "Uploading" → "Ready" (once bytes land + virus-scanned)

2. Durability worker picks up "Ready" files
   a. Decide: single-piece or aggregated?
      - file ≥ 1 MiB   → one piece per file
      - file <  1 MiB  → aggregate into a CAR bundle (see §5)
   b. Compute PieceCID (v2 / FRC-0069) and size
   c. Select providers via FWSS endorsement set (default 2 copies)

3. Synapse SDK: storage.upload(bytesOrStream, {metadata})
   - store()  → POST /pdp/piece, PUT /pdp/piece/upload/{uuid} to primary SP
   - pull()   → SP-to-SP replication to the secondary (no FilBucket bandwidth)
   - commit() → createDataSet + addPieces on-chain (one EIP-712 sig per op)

4. First proving period completes on-chain (SP calls nextProvingPeriod → provePossession)
   - Our backend watches PDPVerifier events (via RPC subscription)
   - Flip state to "Secured"

5. After N days without access (default 30), mark file "Archived"
   - Evict from hot cache
   - Future reads trigger a Restore (pull from SP back into hot cache, sometimes seconds)
```

Crucially: after step 1 the user already sees "Ready" and can share / download. Everything from step 2 onwards is invisible unless something breaks.

---

## 4. Who holds the keys (the wallet question)

FilBucket is **the payer** on every rail. Users never sign anything.

- FilBucket treasury runs one or more EOAs funded with USDFC on Filecoin mainnet.
- Each user's files land in **buckets** in our DB. We may shard across multiple rails (per-SP, per-dataset) but all rails are payer = FilBucket.
- Billing: user pays Stripe in fiat. We top up USDFC monthly (or via Coinbase / Circle). We keep ~60-day runway of USDFC deposited into Filecoin Pay so lockup is always covered.

This is the same trick AWS does: the user has no idea there's an EC2 Spot market under their S3 bucket. We just manage the supply side.

**Why not let users bring their own wallet?** Because:
1. It breaks the Dropbox feel instantly.
2. It forces KYC decisions we don't need to make.
3. It complicates refunds, shared buckets, and team accounts.
4. Power users can later get an "advanced" mode where they plug their own rail in. Day-1 MVP: no.

---

## 5. File identity, chunking, and aggregation

Filecoin pieces have a minimum useful size and a maximum SDK upload size:
- **127 bytes min** (PDP requires padded Merkle)
- **254 MiB max per piece** on Curio; **200 MiB via Synapse SDK** today
- Per-piece proving cost is ~constant per period regardless of size, so *lots of tiny pieces = lots of gas*

So:

### Large files (≥ 1 MiB)
- Split into 200 MiB chunks, each its own PieceCID.
- Internal file record: `file_id → [piece_cid_1, piece_cid_2, …]` with offsets.
- Reassemble on download by streaming chunks in order.

### Small files (< 1 MiB)
- Pack into a rolling **aggregation CAR bundle**.
- An aggregator worker builds a target ~100 MiB CAR with many small files inside.
- Once full (or a timeout fires — say 15 min), we compute one PieceCID for the whole aggregate and commit.
- DB records each small file with `{piece_cid: <aggregate>, byte_range: [start, end]}`.
- On read: SP serves the piece (or the byte range), we slice out the user's file.

This also matches how real Filecoin economics work: tiny individual pieces are a tax. Aggregation is how Storacha and web3.storage hide that tax from users.

### Confidentiality / encryption
- **Default: client-side encryption** with a per-file content key, wrapped by a per-user account key we manage (envelope encryption, like Dropbox + AWS KMS).
- The SP only ever sees ciphertext. Public share links decrypt at our edge.
- User-held keys (Shamir or passphrase) come later as "private vault" tier. MVP = managed keys.
- This also neutralizes the "SP looked at my files" concern entirely.

---

## 6. Provider selection and redundancy

We lean on FWSS's endorsement set rather than running our own SP ranking:

- **Primary**: endorsed provider (high trust, well-capitalized, strong proving history).
- **Secondary**: any approved provider with matching metadata (geo-diverse if possible).
- **Default copies: 2.** Upgrade to 3 on paid tiers or on flagged "important" files.
- If an SP starts faulting PDP proofs, FWSS will mark the rail defaulting → our SettleWatcher-analog sees this → we trigger a repair job that pulls from the healthy copy and re-commits to a new provider. User sees nothing.

This is the same pattern Curio's `pdp_piece_pull_items` already supports — SP-to-SP transfers without the client being a bottleneck.

---

## 7. Hot cache and retrieval

The UX promise is "feels instant." Filecoin first-byte from a Curio SP over HTTP is usually fast (sub-second for warm pieces, seconds for cold), but it is not CDN-class.

Layers (in order of preference for a read):

1. **FilBucket edge cache** — CloudFront (or Caddy + Varnish on our Hetzner box for MVP) fronting an S3 bucket. TTL ~30 days for hot files, evicted on "Archived" transition.
2. **FilBeam CDN** — FOC's own edge network. Cheap, already integrated via Synapse SDK piece resolvers.
3. **Direct SP HTTP retrieval** — `GET /piece/{cid}` on the provider's retrieval URL.
4. **SP-to-SP pull** as a last resort if a primary SP is down.

Share links always resolve through our edge so we can enforce auth, rate limits, and analytics.

---

## 8. Sharing

Not crypto. Signed URLs.

```
https://filbucket.app/s/aB9kx2   (short, memorable)
  → our server validates:
      - link is valid (not expired, not revoked)
      - password match if set
      - optional email gate
  → 302s to a one-time signed URL on our edge
  → edge fetches from hot cache / FilBeam / SP
  → decrypts if needed and streams to user
```

Share settings in the UI (nothing chain-y about any of these):
- Who can access: anyone with the link / specific emails / authenticated FilBucket users
- Expiry: never / 1h / 24h / 7d / 30d / custom
- Password protection: optional
- Download vs view-only (for previews)
- Download count limit (optional)
- Revoke button

---

## 9. Backend services (concrete)

| Service              | Responsibility                                               | Tech choice for MVP               |
|----------------------|--------------------------------------------------------------|-----------------------------------|
| `api`                | REST + auth + rate limits                                    | Node/Fastify or Go (match Swopa?) |
| `uploader-edge`      | Large multipart upload receiver, streams to S3               | Caddy + signed presigned URLs     |
| `ingest-worker`      | Virus scan, encrypt, PieceCID compute, chunker, aggregator   | Node worker + BullMQ              |
| `durability-worker`  | Drives Synapse SDK: store → pull → commit → watch            | Node worker, one-per-dataset lock |
| `chain-watcher`      | Subscribes to PDPVerifier + FWSS + FilecoinPay events        | Go or ethers/viem WS client       |
| `restore-worker`     | Cold → hot rehydration                                       | Node worker                       |
| `shares-api`         | Signed URL minting, access checks, password verify           | Same as `api`                     |
| `billing`            | Stripe webhooks → quota → USDFC top-up                       | Stripe + scheduled Coinbase swap  |
| `metrics`            | Proving health, rail lockup runway, SP SLA                   | Prometheus + Grafana              |

Database: Postgres. Key tables:
- `users`, `buckets`, `files`, `file_pieces`, `pieces`, `aggregates`, `rails`, `proving_status`, `shares`, `share_accesses`, `usage_events`, `billing_accounts`.

State machine moves forward on events:
- `upload_complete` → move to ingest queue
- `piece_uploaded_to_sp` → move to commit queue
- `commit_confirmed` → start watching for first proof
- `first_proof_accepted` → flip UI to "Secured"
- `rail_defaulting` → trigger repair job
- `no_access_30d` → archive (drop hot cache)

---

## 10. Failure modes and what we do about them

| Failure                                  | Detection                                     | Response                                               |
|------------------------------------------|-----------------------------------------------|--------------------------------------------------------|
| Primary SP upload fails                  | Synapse SDK `StoreError`                      | Retry with next candidate; exclude failing SP for 1h   |
| All commits fail (chain congestion)      | `CommitError`                                 | Keep hot copy; show "Ready"; retry commits hourly      |
| SP misses proving period                 | `PDPVerifier.PossessionProven` missed         | Rail defaults → repair to new SP, file stays "Secured" |
| Our wallet runs out of USDFC             | Balance monitor < 30-day lockup floor         | Pager alert Nicklas; pause new uploads before breach   |
| FilBucket DB loss                        | Postgres replica + PITR                       | + weekly export of `{file_id → piece_cid, range}` map to a cold S3 + Filecoin backup. If DB dies, we can rebuild user files from pieces. |
| CDN/edge outage                          | Our uptime probes                             | Fallback via FilBeam + direct SP HTTP                   |
| Malicious user (CSAM, abuse)             | Virus + hash pipeline on ingest; NCMEC hashes | Block + legal hold + piece scheduled for removal       |

The DB-backup-to-Filecoin trick is important: it means "if everything we run burns, the user's data is still on Filecoin and we just need to rebuild our index from the backup we also stored on Filecoin."

---

## 11. Roadmap

### Phase 0 — Dev spike (2 weeks)
- `pnpm create` a Next.js app in `filbucket/web`
- Backend scaffold in `filbucket/server` (Node + Fastify + Postgres + BullMQ + Caddy)
- Integrate Synapse SDK against **calibration testnet** (`chainId 314159`, USDFC faucet)
- Upload → hot cache → one-copy PDP commit → first proof confirmed. End-to-end, ugly UI.

### Phase 1 — MVP ugly-but-complete (4–6 weeks)
- Auth (email magic link)
- Buckets + folders + files
- Drag-and-drop upload with resumable multipart
- Five file states live in UI
- Share links with expiry + password
- Stripe billing, $0 free tier, $10/mo paid tier
- Two-copy durability on calibration

### Phase 2 — Mainnet private beta (4 weeks)
- Move rails to Filecoin mainnet
- Real USDFC top-up pipeline (Coinbase / Circle)
- Aggregation for small files
- FilBeam CDN wired in
- Client-side encryption default-on
- Restore flow polished

### Phase 3 — Public launch (ongoing)
- Team buckets, shared folders
- Desktop sync client (Mac first)
- API / S3-compatible endpoint for devs
- Retention policies, versioning
- SOC 2 readiness

### Wedge recommendation (from PROJECT.md)
Start with **"durable large-file sharing"** — WeTransfer but files don't disappear in 7 days, and there is a clear "this is stored durably on a public network" trust story. It's the narrowest, clearest product, and it lets us demo the Filecoin durability without ever saying the word "Filecoin" unless a user clicks "Why is this safer?".

---

## 12. What we are explicitly *not* doing on day 1

- Not running our own storage provider.
- Not writing new Solidity. We consume FWSS as-is.
- Not exposing CIDs, tx hashes, or chain state in the main UI.
- Not requiring a wallet ever, at any tier.
- Not building a token. FilBucket has no token. Ever.
- Not promising sub-100ms global retrieval. CDN-class yes, S3-class no.
- Not marketing "web3" anything. Durability and trust, in plain English.

---

## 13. Locked decisions (2026-04-18)

Nicklas locked defaults. These are the operating parameters for Phase 0 onward:

1. **First wedge**: durable large-file sharing (WeTransfer-killer with real retention + proven durability).
2. **Stack**: Node + TypeScript end-to-end. Next.js 15 (web), Fastify (api/workers), Postgres + Drizzle, BullMQ + Redis, Synapse SDK + viem. Revisit Go for chain-watcher in Phase 2 only if needed.
3. **Hosting**: reuse Hetzner `157.180.16.39` for MVP. Nøytral is already there. We'll namespace under `/opt/filbucket` and run a separate systemd unit + nginx vhost.
4. **Chain**: calibration for Phase 0 + 1. Mainnet switch at Phase 2 beta.
5. **Encryption**: managed keys by default (envelope encryption, per-file content key wrapped by per-user account key). User-held keys become a "Private Vault" upgrade in Phase 3.
6. **Pricing hypothesis**: Free 10 GB / $10 for 500 GB / $25 for 2 TB. Revisit after first 100 paid users.
7. **Brand**: zero "Filecoin" / "web3" / crypto words in hero, nav, pricing, or primary flow. One deep-link "How your files stay safe" page may name-drop Filecoin.

All subsequent docs, TODOs, and code should respect these unless we explicitly change them here.
