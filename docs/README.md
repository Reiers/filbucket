---
description: Your bucket, in the cloud. Drop files, share them, sleep well.
cover: .gitbook/assets/cover.png
coverY: 0
layout:
  cover:
    visible: true
    size: full
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# Welcome to FilBucket

**FilBucket is a file product that happens to use Filecoin.**

Drop anything. It lands instantly. In the background, it gets replicated across multiple storage providers and continuously proven on-chain. Share it with a signed link that expires when you want it to.

Nobody on your team ever needs to see a wallet, a CID, or a storage provider.

## Start here

{% hint style="info" %}
New to FilBucket? The [quickstart](getting-started/quickstart.md) takes 5 minutes. If you want the why, read the [product overview](getting-started/overview.md) first.
{% endhint %}

{% content-ref url="getting-started/overview.md" %}
[Product overview](getting-started/overview.md)
{% endcontent-ref %}

{% content-ref url="getting-started/installer.md" %}
[One-line installer](getting-started/installer.md)
{% endcontent-ref %}

{% content-ref url="getting-started/quickstart.md" %}
[Quickstart](getting-started/quickstart.md)
{% endcontent-ref %}

{% content-ref url="getting-started/install-mac.md" %}
[Install the Mac app](getting-started/install-mac.md)
{% endcontent-ref %}

## Why FilBucket

Most Filecoin products look and feel like protocol dashboards. FilBucket is not a dashboard. It's a file product. You drop files into a bucket; they come out when you want them. Filecoin handles durability invisibly underneath.

- **Instant uploads** via hot cache; durability runs async.
- **Verifiable storage** across ≥2 storage providers with continuous PDP proofs.
- **Beautiful sharing** with expiry, password, and download limits.
- **No wallets for users** — FilBucket is the payer on every payment rail.
- **Native Mac app**, web, S3-compatible API (soon).
- **Light + dark** — full theme system with system-preference detection.

## What Filecoin gives us

FilBucket is built on [Filecoin Onchain Cloud (FOC)](https://docs.filecoin.io/basics/how-filecoin-works/filecoin-onchain-cloud):

- **PDP** — Proof of Data Possession. Storage providers continuously prove they still hold the bytes.
- **Filecoin Pay** — Streaming USDFC payment rails.
- **FWSS** — Warm-storage business logic that glues PDP + Pay together.
- **Synapse SDK** — Our single integration point.

We don't run storage providers. We don't write new Solidity. We don't build a token. We just make the user-facing product feel as good as Dropbox.

## What's new

- **2026-04-19** — iCloud-style UI overhaul (light + dark mode), one-line installer, custom faucet service. Phase 1 shipped; **Phase 2 (mainnet migration) starts now.** See the [changelog](operations/changelog.md) for every meaningful change and the [roadmap](operations/roadmap.md) for what's next.

## Next steps

- [How it stays safe](concepts/how-it-stays-safe.md) — plain-English durability story
- [Upload your first file](guides/first-upload.md)
- [Create a share link](guides/sharing.md)
- [Developers: REST API reference](api/overview.md)
