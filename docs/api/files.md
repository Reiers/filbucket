# Files

## List files in a bucket

```http
GET /api/files?bucketId=<uuid>
X-Dev-User: <uuid>
```

Returns up to the full set of files in a bucket, ordered by `createdAt` desc. For in-flight uploads, a `progress` object is included so the client can render a live bar.

**Response**:

```json
{
  "files": [
    {
      "id": "0e15a998-4372-43c8-8be4-4b80d32bcce6",
      "bucketId": "0c946aae-387c-485b-a9d4-58c28b97af7e",
      "name": "vacation.mp4",
      "sizeBytes": 314572800,
      "mimeType": "video/mp4",
      "state": "hot_ready",
      "progress": {
        "chunkIndex": 0,
        "chunkTotal": 2,
        "totalUploaded": 209715200,
        "totalBytes": 314572800
      },
      "createdAt": "2026-04-18T19:39:02.123Z",
      "updatedAt": "2026-04-18T19:39:09.456Z"
    }
  ]
}
```

## Get file detail

```http
GET /api/files/:id
X-Dev-User: <uuid>
```

Returns the file + all its pieces + recent commit events.

**Response** extends the list shape with:

```json
{
  "pieces": [
    {
      "id": "<uuid>",
      "pieceCid": "bafkzcibe3gsb...",
      "byteStart": 0,
      "byteEnd": 209715199,
      "chunkIndex": 0,
      "chunkTotal": 2,
      "spProviderId": "4",
      "datasetId": "13177",
      "retrievalUrl": "https://caliberation-pdp.infrafolio.com/piece/...",
      "role": "primary"
    }
  ],
  "events": [
    { "id": "<uuid>", "kind": "upload_complete", "payload": { "sizeBytes": 314572800 }, "createdAt": "..." },
    { "id": "<uuid>", "kind": "chunk_started",  "payload": { "chunkIndex": 0, "chunkTotal": 2, "size": 209715200 }, "createdAt": "..." },
    { "id": "<uuid>", "kind": "store_ok",       "payload": { "pieceCid": "bafkzci...", "copies": [...] }, "createdAt": "..." }
  ]
}
```

## Download a file

```http
GET /api/files/:id/download?u=<uuid>
```

Returns **302** to a short-lived presigned MinIO GET URL. The URL is scoped to the exact object and expires in 5 minutes.

For multi-chunk files, the client downloads the whole object; byte-range reassembly is a Phase 2 concern (cold restore path).

## Delete a file

```http
DELETE /api/files/:id
X-Dev-User: <uuid>
```

Returns **204** on success. Deletes:

- The `files` row (cascades to `file_pieces` and `commit_events`)
- The MinIO object
- Any active share links (soft: they'll return 410 on next access)

Does **not** schedule on-chain piece removal in Phase 1. See [delete](../guides/delete.md).

## Common errors

- **404** `file_not_found` — wrong id or wrong user
- **401** `unauthorized` — missing / bad dev user header
- **500** `object_fetch_failed` — MinIO transient; retry
