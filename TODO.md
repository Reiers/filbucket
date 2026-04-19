# FilBucket TODO

See `ARCHITECTURE.md` for the full design. This file is the near-term execution queue. Historical work lives in [`docs/operations/changelog.md`](./docs/operations/changelog.md).

## Locked defaults (2026-04-18, see ARCHITECTURE §13)
- Wedge: **durable large-file sharing**
- Stack: **Node + TS end-to-end** (Next.js 15, Fastify, Postgres/Drizzle, BullMQ/Redis, Synapse SDK + viem)
- Hosting: **Hetzner 157.180.16.39** (alongside Nøytral, namespaced `/opt/filbucket`)
- Chain: **calibration for Phase 0/1, mainnet at Phase 2** — migration starts now
- Encryption: **managed envelope keys** by default; user-held keys later as Private Vault
- Pricing: **Free 10 GB / $10 500 GB / $25 2 TB**
- Brand: **no crypto words in primary UX**; Filecoin only in deep-link "How your files stay safe"

---

## Phase 0 ✅ (done 2026-04-18)

Foundation: Next.js + Fastify + Postgres + Redis + MinIO + Synapse SDK, upload → hot cache → PDP commit → first-proof watcher, ops wallet funded + FWSS approved, share links live.

## Phase 1 ✅ (done 2026-04-19)

Premium product: streaming uploads, folder uploads, inline previews, interactive bucket dropzone, iCloud-style UI overhaul with dark mode, native Mac app, one-line installer, custom faucet, full docs.

---

## Phase 2 — Mainnet beta 🚧 (now)

Calibration validated end-to-end. Time to ship on real economics.

### Mainnet migration
- [ ] Add `mainnet` branch to `env.ts` / `synapse.ts` — swap RPC URL + USDFC address + FWSS + PDPVerifier contract addresses
- [ ] Create **mainnet ops wallet** (fresh key, stored in 1Password, funded via Circle / Coinbase)
- [ ] First-time mainnet `setup-wallet` — deposit + approveService against real USDFC
- [ ] Install hardened monitoring: wallet runway vs 30-day lockup floor → Telegram alert at < 60 days
- [ ] Switch `install.sh` default chain to `mainnet` behind a feature flag (`FILBUCKET_CHAIN=calibration` still works for devs)
- [ ] Document the chain-switch process for anyone self-hosting

### Auth
- [ ] Email + magic link (Postmark or Resend), HS256-signed session cookies
- [ ] Per-device session list in settings
- [ ] Retire `X-Dev-User` header flow (still available via `FILBUCKET_DEV_AUTH=1` for local)
- [ ] Password-reset + account-delete surfaces

### Billing
- [ ] Stripe integration (fiat in), webhook handling for subscription lifecycle
- [ ] Vipps integration for Norway
- [ ] Quota enforcement on upload init path (reject if over tier)
- [ ] Pricing page ($0 / $10 / $25), with live Filecoin-cost-per-GB sanity tooltip
- [ ] USDFC top-up routine (manual for MVP; scheduled once we have volume data)

### Pipeline hardening
- [ ] Aggregation for <1 MiB files (~100 MiB CAR bundles, 15-minute window)
- [ ] Cold-restore with multi-chunk byte-range reassembly
- [ ] Repair worker: re-upload + re-commit when an SP misses PDP proofs past threshold
- [ ] Gas-price-aware commit batching during mainnet spikes

### Mac app
- [ ] Notarization + hardened runtime
- [ ] Sparkle auto-update feed
- [ ] Menu-bar mode

### Observability
- [ ] Proving health dashboard
- [ ] Rail-lockup-runway graph
- [ ] Per-SP success rate + latency
- [ ] Queue lag alerting

### Private beta
- [ ] Onboard 20 invited users
- [ ] Feedback loop (Linear-style inbox from inside the app)

---

## Phase 3 — Public launch (Q3 2026)

- [ ] Team buckets + shared folders + permissions (owner / editor / viewer)
- [ ] S3-compatible API for developers
- [ ] Private Vault (user-held keys, E2EE variant)
- [ ] Versioning + retention policies
- [ ] iOS app (share extension)
- [ ] FilBeam CDN integration
- [ ] SOC 2 readiness prep

---

## Phase 4 — Scale (2027)

- [ ] Own CDN layer (top-20 POPs)
- [ ] EU-hosted DB option
- [ ] Enterprise tier (SSO, audit exports)
- [ ] Open-source durability-worker core

---

## Polish (ongoing)

- [ ] Replace any residual protocol jargon with human language
- [ ] Make share page beautiful (Phase 2)
- [ ] Empty states should feel inviting, not blank
- [ ] "How FilBucket keeps your files safe" page (the only place Filecoin appears in the primary flow)
- [ ] Accessibility audit — focus-ring coverage, screen-reader labels on bucket + icons
- [ ] Reduced-motion polish — test every animation under `prefers-reduced-motion: reduce`
