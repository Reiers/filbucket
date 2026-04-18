# Uploads

FilBucket uploads use a 2-step presigned flow:

1. `POST /api/uploads/init` — reserve a file row, get a presigned PUT URL.
2. `PUT <presignedUrl>` — upload bytes directly to MinIO.
3. `POST /api/uploads/:fileId/complete` — mark the file ready + enqueue durability work.

This avoids streaming large bytes through our API.

## 1 · Init

```http
POST /api/uploads/init
X-Dev-User: <uuid>
Content-Type: application/json

{
  "filename": "project/src/index.ts",
  "size": 15248,
  "mimeType": "application/typescript",
  "bucketId": "<uuid>"
}
```

**Response** 200:

```json
{
  "fileId": "<uuid>",
  "uploadUrl": "http://localhost:9000/filbucket-hot/hot/<uuid>?X-Amz-Algorithm=...",
  "s3Key": "hot/<uuid>"
}
```

The `uploadUrl` is valid for 15 minutes.

## 2 · PUT bytes

```http
PUT <uploadUrl>
Content-Type: application/typescript

<raw bytes>
```

Standard S3 PUT semantics. The browser XHR path captures upload progress via `xhr.upload.addEventListener('progress', ...)`.

## 3 · Complete

```http
POST /api/uploads/:fileId/complete
X-Dev-User: <uuid>
```

The server HEADs the MinIO object to confirm it exists (prevents lying clients), flips state to `hot_ready`, inserts `upload_complete` commit event, and enqueues the durability job.

**Response** 200 (a full file DTO).

## Errors

- **400** `invalid_body` — zod validation failed (see `issues` in response)
- **400** "Body cannot be empty when content-type is set to 'application/json'" — don't send `Content-Type: application/json` on the complete call if you aren't sending a body
- **404** `bucket_not_found` — bucket id doesn't belong to this user
- **404** `file_not_found` — completing a file that doesn't exist
- **409** `no_hot_cache_key` — file row missing s3 key (shouldn't happen)
- **409** `object_not_found_in_hot_cache` — you forgot to PUT the bytes

## After complete

The durability worker picks up the job. Flow:

```
complete  ─►  worker: plan chunks (200 MiB each)
           ─►  for each chunk:
                 stream from MinIO ─► Synapse storage.upload() ─►  PieceCID
                 record file_pieces (1 per SP copy) + commit events
           ─►  snapshot nextChallengeEpoch per dataset
           ─►  enqueue watch-first-proof
```

`watch-first-proof` polls `PDPVerifier.getNextChallengeEpoch(dataSetId)` every 2 minutes for 30 min, then every 10 min, for up to 6 hours. When any dataset's epoch advances past the initial snapshot, the file transitions to `pdp_committed` ("Secured" in the UI).

See [architecture](../developers/architecture.md) for full detail.

## Chunking

Files >200 MiB are split into ≤200 MiB pieces, each uploaded independently. Multiple pieces per file typically share a single dataset + rail because metadata matches. Per-chunk progress events (`chunk_bytes`) are emitted every 4 MiB.

See [durability model](../concepts/durability.md).
