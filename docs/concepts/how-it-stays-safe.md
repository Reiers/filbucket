---
description: The plain-English durability story for people who just want to know their files are safe.
---

# How it stays safe

## The one-sentence version

**Every file you upload is replicated across multiple independent storage providers, and each of those providers continuously proves on a public blockchain that they still hold your bytes. If any of them stops proving, we automatically repair your file to a new one, before you even notice.**

## The slightly longer version

Most cloud storage is "safe" because you trust one company not to lose your data. That's a lot of trust in one place. It's also opaque — you have no way to verify, from the outside, that your files are actually still there.

FilBucket uses a different foundation: [Filecoin](https://filecoin.io), a decentralized storage network.

- Your file lands on our edge first, so it's downloadable in seconds.
- In the background, we send copies to **at least two** independent storage providers on the Filecoin network.
- Each provider is obligated to respond to cryptographic **challenges** every proving period. The challenge says: _"prove, right now, that you still have exactly these bytes."_ The response is called a **Proof of Data Possession** (PDP).
- Every PDP response is posted to the Filecoin blockchain. The record is public, immutable, and auditable.
- If any provider stops responding correctly, our system sees that on-chain and **repairs** the file to a new provider — without you doing anything.

**The result**: your file's durability is a continuously verified fact, not a promise from a single company.

## What you see

In the FilBucket UI, your file transitions between states in plain language. See [file states explained](file-states.md) for the full lifecycle.

## What we never ask you to do

- Hold crypto or tokens
- Manage keys or wallets
- Understand storage providers, CIDs, rails, epochs, or deals
- Trust any single company to keep your bytes alive

## What we pay attention to, so you don't have to

- Which providers are healthy (we pick from an **endorsed** set maintained by the Filecoin community)
- Whether your file has at least the number of copies you're paying for
- Whether every copy has landed its first on-chain proof (that's when your file becomes **Secured**)
- Whether any provider has missed a proof (we trigger a repair)
- Whether our ops wallet has enough USDFC to keep rails paid for the next 30+ days (we auto-top-up)

## The deep end

If you want the technical version: [architecture](../developers/architecture.md) and [Synapse SDK integration](../developers/synapse-sdk.md). Not required reading.

## Summary for people who skim

> Your files are on multiple storage providers. Each one is cryptographically forced to keep proving they still have your data. Proofs are public and on-chain. If a provider fails, we repair automatically. You never touch crypto.

That's it. That's the whole story.
