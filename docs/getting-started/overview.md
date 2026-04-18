# Product overview

## What FilBucket is

FilBucket is a file-storage product that feels like Dropbox and uses Filecoin underneath.

- You drop files in a bucket.
- They land instantly in hot storage.
- In the background, FilBucket replicates them across multiple independent storage providers and continuously proves on-chain that the providers still hold your bytes.
- You share files with signed links. Recipients never see a wallet, a login, or a crypto term.

## What FilBucket is not

- **Not a token product.** FilBucket has no token. Ever.
- **Not a wallet product.** Users never hold crypto. FilBucket pays storage providers in USDFC on your behalf; you pay FilBucket in fiat (or nothing, on the free tier).
- **Not a Web3 dashboard.** You will not see CIDs, storage providers, datasets, epochs, or rails in the main UI. Those words live in the engine room.
- **Not "decentralized Dropbox."** It's a real product. The fact that the storage layer is decentralized is an implementation detail.

## Five file states

Every file lives in one of these states, in plain English:

| Status | Meaning |
|---|---|
| **Uploading** | Bytes still in flight from your browser/desktop to FilBucket |
| **Ready** | Landed in hot storage. You can download + share it immediately |
| **Secured** | Replicated to storage providers AND cryptographically proven on-chain at least once |
| **Archived** | Safely on Filecoin only; hot cache has been evicted (still downloadable, a few seconds slower first-byte) |
| **Restoring** | Rehydrating from cold tier back into hot cache |
| **Failed** | Something went wrong during upload or commit. Retry or dismiss. |

Most files will go `Uploading → Ready → Secured` within a few minutes.

## Why this matters

Files on typical cloud storage are durable only because you trust one company not to lose them. Files on FilBucket are durable because:

1. They're replicated across **multiple independent storage providers**.
2. Every provider **continuously proves on-chain** that it still holds your bytes.
3. If any provider stops proving, we **automatically repair** to a new one.
4. We **can't silently lose your data** and lie about it — the proof record is on a public chain.

You don't have to think about any of that. It's just how FilBucket works.

## Continue reading

- **[Quickstart](quickstart.md)** — install and upload your first file in 5 minutes.
- **[How it stays safe](../concepts/how-it-stays-safe.md)** — the plain-English durability story.
- **[Architecture](../developers/architecture.md)** — for developers who want to see under the hood.
