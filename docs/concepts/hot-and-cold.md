# Hot cache vs cold tier

FilBucket is a two-tier storage system. Users don't see the tiers, but they shape how it feels.

## Hot

**What it is**: S3-compatible object storage at the edge (MinIO in dev, CloudFront + S3 in prod).

**When files live here**:

- For ~30 days after the last access.
- Always, for files uploaded within the last 48 hours.
- For files with active share links (we extend the TTL).

**Why**: 30ms first-byte. Reliable bandwidth. CDN caching for public share links.

## Cold

**What it is**: Filecoin. Pinned via the storage providers holding the PieceCIDs. Served via [FilBeam](https://docs.filoz.org/filbeam/) CDN or direct SP HTTP retrieval.

**When files live here**: Always, regardless of hot tier state. Filecoin is the source of truth.

**Why**: Cheap. Durable. Verifiable.

## Transitions

- **Hot → Cold (eviction)**: after 30 days of idle. File state becomes **Archived**.
- **Cold → Hot (restore)**: triggered by a read. File state becomes **Restoring**, then **Ready**.

## Retrieval paths, in order of preference

1. **FilBucket edge cache** (CloudFront). ~10-100 ms first byte.
2. **FilBeam CDN** (FOC's own edge). ~100-500 ms first byte.
3. **Direct SP HTTP**. ~500 ms - 5 s first byte depending on SP.
4. **SP-to-SP pull** (fallback if primary SP is down, secondary has it).

Every file has a **retrieval URL** captured at commit time per copy, stored in `file_pieces.retrieval_url`. This is how the restore job finds the bytes in the cold tier.

## What this means for users

- First upload: feels instant (hot).
- Re-download within 30 days: instant (hot).
- Re-download after 30 days: takes a few extra seconds (hot warm-up).
- Share link recipient: fast (hot; TTL auto-extended when share is created).

The user sees a brief **Restoring** label if they hit a cold file. Otherwise the tier is invisible.

## Dev environment

In Phase 0 / 1, the "hot cache" is just the MinIO object behind the upload. The cold tier is on calibration Filecoin. The restore-from-cold worker is scaffolded but not exercised in dev because we never evict (keep your life simple while the system is young).
