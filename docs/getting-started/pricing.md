# Pricing & plans

{% hint style="info" %}
Billing is not yet live in Phase 0 / 1. Everything is free while we run on calibration testnet. The plans below are the **target** pricing for Phase 2 (mainnet beta).
{% endhint %}

| Plan | Storage | Bandwidth | Price |
|---|---|---|---|
| **Free** | 10 GB | 50 GB / mo | $0 |
| **Personal** | 500 GB | 500 GB / mo | **$10 / month** |
| **Team** | 2 TB | unlimited | **$25 / month** |

All paid plans include:

- 2-copy default durability (3 copies on Team)
- All share-link features (expiry, password, download limits, revoke)
- Native macOS app
- Full download API
- Priority retrieval via FilBeam CDN

## Why this works

Under the hood, Filecoin Onchain Cloud storage lists at **$2.50 per TiB per month per copy** (on calibration pricing; mainnet is effectively the same). At Personal tier:

- Storage: 500 GB × 2 copies × $2.50/TiB/mo ≈ **$2.50/user/month**
- Bandwidth via FilBeam CDN: 500 GB × ~$0.014/GiB ≈ **$7/user/month** (worst case)
- **Gross margin**: ~10–15% at the margin, ~60% for average users who don't saturate bandwidth

Team tier adds a third copy for +33% storage cost, recovered by the price jump.

## What you're paying for

- **Storage cost** — replicated across multiple independent Filecoin storage providers
- **Hot cache + CDN** — instant downloads for recent / active files
- **Ops wallet** — FilBucket tops up USDFC monthly so you never touch crypto
- **Verifiability** — every file has public on-chain proofs you can audit

## What you're *not* paying for

- Per-upload fees
- Per-download fees (within plan limits)
- Egress surprises (plan caps are hard caps with grace)
- Token purchases or holding

## Billing rails (Phase 2)

- **Card**: Stripe
- **Vipps** (Norway): direct
- **Invoice** (Team tier, annual): ACH / bank transfer

Fiat only. No crypto billing path, ever.
