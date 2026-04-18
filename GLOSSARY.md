# FilBucket Glossary

Internal reference. **Never show these words in the product UI.**

## Filecoin / FOC stack

- **Filecoin Onchain Cloud (FOC)** — the umbrella product: PDP + Filecoin Pay + FWSS + Synapse SDK + FilBeam. Think "AWS primitives, on Filecoin."
- **PDP (Proof of Data Possession)** — challenge/response protocol where an SP proves to the chain that it still holds the bytes, every proving period. No sealing, no replication proof. Cheap, lightweight, continuous.
- **PDPVerifier** — the on-chain contract that verifies proofs. Addresses in `ARCHITECTURE.md §2`. Our backend watches its events.
- **Filecoin Pay (FilecoinPayV1)** — generic streaming payment rails in USDFC. Payer streams tokens to Payee at a configured rate per epoch; 30-day lockup is a safety net, not escrow.
- **USDFC** — Filecoin-native USD stablecoin by Secured Finance. Mainnet `0x80B98d3aa09ffff255c3ba4A241111Ff1262F045`. 18 decimals.
- **FWSS (Filecoin Warm Storage Service)** — the product contract. Glues PDPVerifier + FilecoinPay together: pricing, lifecycle, metadata matching, listener callbacks. This is what the Synapse SDK mostly talks to.
- **ServiceProviderRegistry** — on-chain directory of SPs + their PDP URLs + retrieval URLs + capabilities.
- **Endorsed providers** — curated high-trust subset of SPs. Used for primary copies.
- **Approved providers** — any registered SP meeting FWSS baseline. Used for secondaries.
- **FilBeam** — FOC's optional CDN layer for cheap egress (~$0.014/GiB).

## Primitives

- **PieceCID (v2 / FRC-0069)** — content-addressed Filecoin piece identifier. Binary Merkle root. Contracts use the 32-byte digest only. Synapse SDK computes it client-side.
- **Data set** — logical container of pieces per provider. Each dataset → its own payment rail. Metadata-matched for reuse.
- **Rail** — a streaming USDFC payment stream. `{payer, payee, operator, rate, lockupPeriod, lockupFixed, endEpoch}`.
- **Epoch** — 30 seconds. ~2,880/day. Most rates are quoted "per epoch" internally but we translate to $/month in UI.
- **Proving period** — interval at which an SP must submit a proof for a dataset. Set by FWSS.
- **Sybil fee** — 0.1 FIL. SP anti-spam fee when creating a dataset.
- **CommP** — older name for PieceCID digest in some legacy code paths.

## Clients

- **Synapse SDK** — `@filoz/synapse-sdk` (TypeScript, viem-based). Our primary integration. Wraps all of the above.
  - `synapse.storage.upload()` — one-call upload with auto SP selection + multi-copy + pull + commit
  - `synapse.payments.*` — deposit, withdraw, settle rails, operator approvals
  - `synapse.warmStorage.*` — pricing, datasets, metadata
  - `synapse.spRegistry.*` — provider discovery
- **Curio** — the Filecoin SP runtime software. Not our code. It's what SPs run. Exposes the HTTP API Synapse SDK calls (`/pdp/data-sets`, `/pdp/piece/uploads/*`, etc.).
- **filecoin-pin** — reference CLI client, useful for debugging.

## FilBucket-internal terms

- **Bucket** — a top-level container in FilBucket (user-visible).
- **Folder** — nested container inside a bucket (user-visible).
- **File** — user-visible unit. May map to 1..N pieces internally.
- **Aggregate** — one PieceCID that packs many small user files inside a CAR bundle.
- **Hot cache** — our S3 + CDN front layer. Where "Ready" files live.
- **Cold tier** — on-Filecoin only, hot cache evicted. File still "Secured" but first-byte latency jumps from ms to seconds.
- **Restore** — rehydration from cold → hot cache. Triggered by a read on an archived file.
- **Repair job** — when an SP faults PDP proofs, we pull the piece from the healthy copy and re-commit to a new SP.
- **Ops wallet** — FilBucket's EOA on Filecoin that pays all rails. User never sees it.

## What we never say in the UI

CID, PieceCID, CommP, dataset, rail, epoch, proving period, storage provider, SP, wallet, on-chain, tx, gas, USDFC, FIL, Filecoin (except in one deep-link "How it works"), PDP, FWSS, Synapse. Translate all of these into product language:

| Internal                          | UI says                     |
|-----------------------------------|-----------------------------|
| Piece committed + first proof OK  | "Secured"                   |
| Rail created                      | (silent)                    |
| Dataset reused                    | (silent)                    |
| SP faulted + repair running       | "Verifying" (or silent)     |
| USDFC balance low                 | (internal page only)        |
| Hot cache evicted                 | "Archived"                  |
| Restore job queued                | "Restoring"                 |
