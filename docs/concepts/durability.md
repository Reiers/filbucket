# Durability model

Technical deep-dive on how FilBucket keeps files safe.

## Components

- **Hot cache**: FilBucket's own S3-compatible layer (MinIO in dev, CloudFront + S3 in prod). Serves first-byte requests fast. Default TTL: 30 days of last-access, then evicted to cold.
- **FilBeam CDN**: Filecoin's shared edge network. Cheap egress for cold reads. Optional per file.
- **Storage providers (SPs)**: Run [Curio](https://github.com/filecoin-project/curio). Pinned storage + PDP compute.
- **PDPVerifier contract**: On-chain verifier of PDP proofs.
- **FWSS contract**: Business logic. Pricing, dataset lifecycle, fault detection.
- **Filecoin Pay**: Streaming USDFC rails.

## Copy strategy

Default: **2 copies** per file. Team tier: **3 copies**.

- **Primary**: selected from FilBucket's **endorsed** SP set (curated high-trust providers).
- **Secondary**: any **approved** SP, preferably geographically diverse from the primary.

Selection runs once per dataset. Datasets are reused across files when metadata matches, which means many files on the same pair of SPs share a single payment rail.

## Proving cadence

On calibration:

- **Challenge epoch**: the Filecoin epoch at which the SP must submit a proof.
- **Proving period**: typically ~30 minutes at steady state; first challenge on a fresh dataset is ~90 minutes out.
- **Proof submission**: SP computes a Merkle path against the stored bytes and calls `PDPVerifier.provePossession(dataSetId, proofs)`.
- **Success**: Next proving period begins. `getNextChallengeEpoch(dataSetId)` advances.

FilBucket watches for `nextChallengeEpoch` advancing past the value we captured at commit time. That's our signal that the first proof landed → file transitions to **Secured**.

## Fault handling

If an SP misses a proving window:

1. FWSS marks the rail **defaulting**.
2. FilBucket's `SettleWatcher` observes this on-chain.
3. Repair job is enqueued: pull piece from the healthy copy, upload to a new SP, commit.
4. User UI shows the file as **Secured** throughout (we don't downgrade state for a single-copy fault).

## Large file handling

Files larger than 200 MiB are split into multiple **pieces** at the FilBucket worker level. Each piece:

- Gets its own PieceCID.
- Is individually proven via PDP.
- Shares the same dataset + rail with its sibling pieces (so one payment rail per file, not per piece).

Small files (<1 MiB) will be **aggregated** into ~100 MiB CAR bundles in Phase 2 to avoid the per-piece proving tax. Not yet implemented in Phase 1.

## Cold tier

After 30 days of no access, hot cache is evicted:

- File state: **Archived**.
- Download request triggers **Restoring**: pull from the SP's retrieval URL via FilBeam, land back in hot cache, stream to the user.
- Subsequent reads are fast again for 30 days.

## What could still go wrong

- **All SPs for a file fault simultaneously**: extremely unlikely (independent providers, different geos), but the cold tier is the last line of defense.
- **FilBucket's own DB dies**: we back up Postgres to Filecoin nightly (via our own dogfood pipeline). Recoverable.
- **FilBucket's ops wallet runs out of USDFC**: auto-top-up + 30-day lockup runway + alerting catches this long before a rail terminates.

## On-chain read recipes

For advanced users who want to verify their file's status independently:

```js
// Given a dataSetId from your file row's commit_ok event:
const nextEpoch = await client.readContract({
  address: '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C', // PDPVerifier proxy on calibration
  abi: PDP_VERIFIER_ABI,
  functionName: 'getNextChallengeEpoch',
  args: [dataSetId],
})

const isLive = await client.readContract({
  address: '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C',
  abi: PDP_VERIFIER_ABI,
  functionName: 'dataSetLive',
  args: [dataSetId],
})
```

See [Synapse SDK](../developers/synapse-sdk.md) for higher-level reads.
