# File states explained

Every file in FilBucket is in one of six states. The UI shows these in plain English; this page explains what each one means and how long it typically takes.

## The happy path

```
Uploading ─► Ready ─► Secured ─► (Archived, if idle 30+ days) ─► Restoring ─► Ready
                             ▲                                                       │
                             └───────────────────────────────────────────────────────┘
```

## Uploading

**Meaning**: Bytes are still flowing from your browser or Mac app into FilBucket's edge.

**How long**: As long as the upload takes (depends on file size and your network).

**What you can do**: Wait. Cancel with the X. Other files upload in parallel.

## Ready

**Meaning**: Your file has landed in hot storage. You can download it, share it, and preview it immediately. Durability work is happening in the background.

**How long**: Seconds to minutes, depending on file size.

**What you can do**: Everything. Share, preview, download. No need to wait for "Secured."

## Secured

**Meaning**: Your file has been replicated across at least 2 independent storage providers AND each of them has successfully submitted its first cryptographic proof on-chain that they hold your bytes.

**How long**: Typically 5–15 minutes on calibration, 1–5 minutes on mainnet. Some large files take longer because they're split into multiple pieces.

**What you can do**: Same as Ready, plus: you can sleep at night.

## Archived

**Meaning**: The hot cache copy has been evicted because the file hasn't been accessed in a while (default 30 days). The file is still safe on Filecoin — we have verifiable cryptographic proof of it — but the first byte of a download is now a few seconds slower.

**How long**: State persists until you access the file.

**What you can do**: Download normally. The system automatically transitions to **Restoring**.

## Restoring

**Meaning**: We're rehydrating your file from a Filecoin storage provider back into hot cache, because you (or a share-link recipient) just requested it.

**How long**: Seconds to a minute depending on file size and SP performance.

**What you can do**: Wait. The download will start as soon as the first bytes land in hot cache.

## Failed

**Meaning**: Something went wrong during upload or the background durability work. Common causes: file smaller than Filecoin's minimum (127 bytes), storage provider transient failure, ops wallet out of funds.

**What you can do**: Click the X to dismiss, or click the file to see the detailed error.

## Where states come from

These states are computed on the server from:

- DB columns (`files.state`, `files.size_bytes`, `files.hot_cache_key`)
- Append-only event log (`commit_events` table — `upload_complete`, `store_ok`, `commit_ok`, `first_proof_ok`, `fault`, etc.)
- On-chain reads via the [Synapse SDK](../developers/synapse-sdk.md) + direct PDPVerifier queries

The UI polls `GET /api/files?bucketId=...` every 3 seconds and reflects the latest state. See [Files API](../api/files.md) for details.

## Vocabulary we don't show

Internally we track dozens of finer-grained states: `hot_ready`, `pdp_committed`, `archived_cold`, `restore_from_cold`, `chunk_started`, `chunk_stored`, `chunk_committed`. The UI collapses them into the six above because **the user doesn't need to know about chunks**. See [GLOSSARY.md](https://github.com/Reiers/filbucket/blob/main/GLOSSARY.md) in the repo for the full translation table.
