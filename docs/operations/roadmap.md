# Roadmap

Aspirational but honest. Last updated 2026-04-19.

## Phase 0 — Foundation ✅

**Done April 18, 2026.**

- Scaffold (Next.js 15 + Fastify + Postgres + Redis + MinIO + Synapse SDK)
- Upload → hot cache → durability worker → on-chain PDP commit → first proof detection
- Share links with expiry, password, max-downloads, revocation
- Calibration testnet: ops wallet funded, FWSS operator approved
- Delete / dismiss for failed uploads and successful files

## Phase 1 — Premium product ✅

**Done April 19, 2026.**

> **End-to-end proof on calibration.** Real uploads land through the full pipeline:
> client PUT → MinIO hot cache → durability worker chunks to SPs → on-chain PDP commit
> → passive first-proof watcher. Currently replicating against two independent Curio
> SPs (dataset `13175` on `infrafolio`, dataset `13176` on `ezpdpz`), both retrievable
> via SP retrieval URLs, commits visible on the calibration explorer. The `pdp_committed`
> state flips the moment the PDPVerifier emits `getNextChallengeEpoch` for the dataset
> (~30-min proving period on calibration).

- Streaming chunked uploads (no more 200 MiB ceiling)
- Real chunk-level progress bars, per-SP progress events
- Folder uploads (drag + file picker, `webkitdirectory`)
- Inline previews: image, video, audio, PDF, text, markdown
- Interactive bucket dropzone (animated SVG, lid lifts, water rises)
- Native macOS arm64 app (SwiftUI, SwiftPM, AVKit, PDFKit)
- **iCloud-style UI overhaul** — custom FilBucket logo + wordmark, Inter + IBM Plex Mono, soft pastel palette, rounded tiles, spring easings, ⌘K search
- **Full dark mode** — harmonised pastels, Apple-style deep-grey canvas, localStorage + prefers-color-scheme, no flash on first paint
- **Real sidebar nav** — /recents, /shared, /trash all have themed coming-soon pages
- **One-line installer** — curl | bash: Homebrew prereqs, Postgres/Redis/MinIO, wallet + faucet + setup-wallet + dev stack, ~3 minutes end-to-end
- **FilBucket faucet service** — own calibration drip: 0.5 tFIL + 11 USDFC per call, 3 drips per IP per 12h
- **Docs** — README + full GitBook-ready `docs/` tree

## Phase 2 — Mainnet beta 🚧

**Now.** Calibration has been validated end-to-end. The product survives real uploads through the full state machine (Uploading → Saving → Secured → Failed) and sane error paths (lockup runway exhaustion, faucet rate-limits, provider faults, hydration races). It is time to ship on top of real economics.

Target: Q2 2026.

### Mainnet migration

- **`FILBUCKET_CHAIN=mainnet`** — swap RPC endpoint, USDFC contract address, FWSS + PDPVerifier contracts
- **Real ops-wallet runway automation** — top up USDFC from fiat via Circle / Coinbase, alert before 30-day lockup floor
- **Cost accounting pipeline** — per-file $/GB/mo bookkeeping; feed into billing layer
- **Gas-price-aware commit batching** — defer commits during spikes; reduce commit frequency via aggregation

### Revenue surface

- **Auth** — email + magic link (Postmark / Resend), signed session cookies, per-device session list
- **Stripe billing** — cards for international, Vipps for Norway
- **Quotas** — enforce per tier on upload path, server-side
- **Pricing page** — $0 / $10 / $25 tiers live
- **Free-tier economics** — Solana-style loss-leader framing, capped at 10 GB

### Pipeline hardening

- **Aggregation for small files** — <1 MiB files packed into ~100 MiB CAR bundles; slash proving tax
- **Cold-restore with byte-range reassembly** — proper multi-chunk restore from SPs when hot cache is evicted
- **Repair worker** — re-upload + re-commit when an SP faults PDP proofs past threshold

### Mac app

- Notarization (Apple), hardened runtime
- Sparkle auto-update on a signed update feed
- Menu-bar mode (drag, drop, done — without opening the main window)

### Private beta

- 20 invited users, real mainnet, real billing
- Feedback loop + product iteration
- SOC 2 readiness prep (audit logs, access controls, SSO skeleton)

## Phase 3 — Public launch

Target: Q3 2026.

- **Team buckets** + shared folders + basic permissions (owner / editor / viewer)
- **S3-compatible API** for developers — bring-your-own-tool integration, rclone works out of the box
- **Private Vault** — user-held encryption keys, E2EE variant alongside default managed-keys
- **Versioning + retention policies**
- **iOS app** — SwiftUI share extension for one-tap upload
- **CDN polish** — FilBeam integration, edge caching tiers, signed-URL expiry on retrieval
- **Public launch** — press day, Product Hunt, refer-a-friend GB tier

## Phase 4 — Scale

Target: 2027.

- **Own CDN layer** in the top 20 POPs
- **EU-hosted DB option** for GDPR-strict customers
- **Enterprise tier** — SSO (SAML / OIDC), audit exports, custom data-residency, DPA
- **Open-source** the durability-worker core under Apache-2.0

## Non-goals

Things we will deliberately **not** build:

- A token
- A "FilBucket Coin"
- Wallet-based user accounts
- A DAO
- A marketplace / staking layer
- A generic Web3 storage API (Synapse already is that — we build on top)
- A WeTransfer-style auto-expire product (we want retention as a feature, not a cost-cut)

## How we prioritize

1. **Product feel** beats feature count.
2. **Real users** beat hypothetical users.
3. **Fix what's broken** before building what's new.
4. **Durability guarantees** are sacred — we don't cut corners there.
5. **Every UI string** is reviewed under the [language rules](../brand/language.md). No crypto words in the primary flow.

## Tracking

- Active work: [GitHub project board](https://github.com/Reiers/filbucket/projects) (public once Phase 2 kicks off).
- Near-term: [`TODO.md`](https://github.com/Reiers/filbucket/blob/main/TODO.md).
- Change log: [`docs/operations/changelog.md`](./changelog.md).
