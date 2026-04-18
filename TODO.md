# FilBucket TODO

See `ARCHITECTURE.md` for the full design. This file is the execution queue.

## Locked defaults (2026-04-18, see ARCHITECTURE §13)
- Wedge: **durable large-file sharing**
- Stack: **Node + TS end-to-end** (Next.js 15, Fastify, Postgres/Drizzle, BullMQ/Redis, Synapse SDK + viem)
- Hosting: **Hetzner 157.180.16.39** (alongside Nøytral, namespaced `/opt/filbucket`)
- Chain: **calibration for Phase 0/1**, mainnet at Phase 2
- Encryption: **managed envelope keys** by default; user-held keys later as Private Vault
- Pricing: **Free 10 GB / $10 500 GB / $25 2 TB**
- Brand: **no crypto words in primary UX**, Filecoin only in deep-link "How your files stay safe"

## Phase 0 — Dev spike (post-decision)
- [ ] Scaffold `web/` (Next.js 15 + Tailwind, calm design tokens)
- [ ] Scaffold `server/` (Fastify + Postgres + Drizzle/Prisma + BullMQ)
- [ ] Add Synapse SDK: `pnpm add @filoz/synapse-sdk viem`
- [ ] Create ops wallet on calibration, fund with tFIL + USDFC from faucet
- [ ] Deposit USDFC into Filecoin Pay, approve FWSS as operator
- [ ] End-to-end spike: upload 1 file → hot cache → Synapse `storage.upload` → wait for first PDP proof → flip state to "Secured"
- [ ] Minimal chain-watcher for PDPVerifier + FWSS events
- [ ] Tiny terminal UI that prints state transitions

## Phase 1 — MVP
### Product
- [ ] Homepage positioning (wedge-specific)
- [ ] Pricing page
- [ ] Durability-language copy (no crypto words in primary flow)

### UX
- [ ] Landing page
- [ ] Auth (email magic link)
- [ ] File library
- [ ] Drag-and-drop upload with resumable multipart
- [ ] Share-link page (expiry, password, email gate)
- [ ] Restore flow
- [ ] File state badges ("Uploading / Ready / Secured / Archived / Restoring / Failed")

### Architecture
- [ ] Finalize Postgres schema (`users`, `buckets`, `files`, `file_pieces`, `pieces`, `aggregates`, `rails`, `proving_status`, `shares`, `share_accesses`, `usage_events`)
- [ ] Upload pipeline (ingest → AV scan → encrypt → chunk/aggregate → commit)
- [ ] Hot cache layer (S3 / Caddy + Varnish)
- [ ] Durability orchestrator (queue + Synapse SDK driver, one-worker-per-dataset lock)
- [ ] Restore pipeline (cold → hot rehydration)
- [ ] Sharing model + short-link service
- [ ] Aggregation worker for <1 MiB files (target ~100 MiB CAR bundles, 15 min timeout)
- [ ] Repair job when an SP faults PDP proofs

### Infra
- [ ] Choose + provision DB (managed Postgres or self-hosted)
- [ ] S3 bucket + CDN front (CloudFront or Caddy edge)
- [ ] Monitoring: proving health, rail lockup runway, SP SLA, queue lag
- [ ] Alerting: wallet balance below 30-day lockup floor, commit failure rate, SP miss rate

### Billing
- [ ] Stripe integration (fiat in)
- [ ] Quota enforcement per tier
- [ ] USDFC top-up routine (Coinbase/Circle) — manual for MVP, scheduled later

## Phase 2 — Mainnet beta
- [ ] Move rails to Filecoin mainnet
- [ ] Aggregation live
- [ ] FilBeam CDN wired in
- [ ] Client-side encryption default-on
- [ ] DB backup → Filecoin (self-dogfood for disaster recovery)
- [ ] Invite-only beta: 20 users

## Phase 3 — Public launch
- [ ] Team buckets + shared folders + permissions
- [ ] Desktop sync client (Mac first)
- [ ] S3-compatible API for devs
- [ ] Versioning + retention policies
- [ ] SOC 2 readiness

## Polish (ongoing)
- [ ] Replace all protocol jargon with human language
- [ ] Add trust cues without chain theater
- [ ] Make share page beautiful
- [ ] Make empty states feel inviting
- [ ] Plain-English "How FilBucket keeps your files safe" page (this is the only place Filecoin appears)
