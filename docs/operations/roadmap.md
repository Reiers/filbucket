# Roadmap

Aspirational but honest. Last updated 2026-04-18.

## Phase 0 — Foundation ✅

**Done (April 18, 2026):**

- Scaffold (Next.js + Fastify + Postgres + Redis + MinIO + Synapse SDK)
- Upload → hot cache → durability worker → on-chain PDP commit → first proof detection
- Share links with expiry, password, max-downloads, revocation
- Calibration testnet, ops wallet funded + FWSS operator approved
- Delete / dismiss for failed uploads + successful files

## Phase 1 — Premium product ✅

**Done (April 18, 2026):**

- Streaming chunked uploads (no more 200 MiB ceiling)
- Real chunk-level progress bars
- Folder uploads (drag + file picker)
- Inline previews: image, video, audio, PDF, text
- Interactive bucket dropzone (animated SVG, opens on drag-over)
- Premium typography + color system
- Native macOS arm64 app
- README + GitBook docs

## Phase 2 — Mainnet beta

Target: Q2 2026.

- **Auth**: email + magic link (Postmark / Resend), signed session cookies, per-device session list
- **Billing**: Stripe for cards, Vipps for Norway; quota enforcement per tier
- **Mainnet rails**: `FILBUCKET_CHAIN=mainnet`, real USDFC; ops wallet runway automation
- **Aggregation**: <1 MiB files packed into ~100 MiB CAR bundles (save proving tax)
- **Cold-restore multi-chunk**: proper byte-range reassembly from SPs when hot cache is evicted
- **Mac app auto-update** via Sparkle
- **Mac app notarization** (Apple)
- **Private beta**: 20 invited users

## Phase 3 — Public launch

Target: Q3 2026.

- **Team buckets** + shared folders + basic permissions
- **S3-compatible API** for developers (bring-your-own-tool integration)
- **Private Vault** (user-held encryption keys, E2EE variant)
- **Versioning** + retention policies
- **iOS app**
- **CDN polish**: FilBeam integration, edge caching tiers
- **SOC 2 readiness**

## Phase 4 — Scale

Target: 2027.

- **Own CDN layer** (our own edge in top 20 POPs)
- **Europe-hosted DB option** for GDPR-strict customers
- **Enterprise tier**: SSO, audit exports, custom data-residency
- **Open-source** the core worker under Apache-2.0

## Non-goals

Things we're deliberately **not** building:

- A token
- A "FilBucket Coin"
- Wallet-based user accounts
- A DAO
- A marketplace / staking layer
- A generic Web3 storage API (Synapse already is that — we build on top)
- A file-sharing product that auto-expires all files (that's WeTransfer; we want retention)

## How we prioritize

1. **Product feel** beats feature count.
2. **Real users** beat hypothetical users.
3. **Fix what's broken** before building what's new.
4. **Durability guarantees** are sacred — we don't cut corners there.
5. **Every UI string** is reviewed under the [language rules](../brand/language.md).

## Tracking

Active work: [GitHub project board](https://github.com/Reiers/filbucket/projects) (when public).
Near-term: [TODO.md](https://github.com/Reiers/filbucket/blob/main/TODO.md).
