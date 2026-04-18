# Upload your first file

The whole point of FilBucket is that this is boring. But here, in detail:

## Web

1. Open **http://localhost:3010** (or your deployed FilBucket URL).
2. Either:
   - **Drag** a file from Finder / Explorer into the bucket illustration in the middle of the page.
   - **Click** the bucket to open the system file picker.
3. Watch it upload. The file row appears immediately with state **Uploading** and a live byte-count.
4. When the browser finishes the MinIO upload, state flips to **Ready** (usually within seconds).
5. In the background, FilBucket streams your file to 2 storage providers and waits for the first on-chain PDP proof.
6. State flips to **Secured** when the proof lands — typically 5–15 min on calibration.

You can use the file immediately (download, share, preview) the moment it's **Ready**. You don't have to wait for Secured.

## Mac app

1. Open the FilBucket menu bar app (or the main window).
2. Drag files onto the dropzone.
3. Same state machine applies.

## What's happening under the hood

For the full technical story see [architecture](../developers/architecture.md) and [durability](../concepts/durability.md). The short version:

```
You drop a file
    │
    ▼
Browser does a presigned PUT to MinIO (hot cache)
    │
    ▼
FilBucket API marks the file Ready and enqueues a durability job
    │
    ▼
Durability worker streams the file from MinIO to Filecoin via Synapse SDK
    │ (chunked into <=200 MiB pieces if large)
    ▼
Storage providers acknowledge, write piece + prepare dataset + addPieces tx
    │
    ▼
File's first proving period elapses; SP submits PDP proof on-chain
    │
    ▼
Watcher sees nextChallengeEpoch advance → state flips to Secured
```

## Size limits

- **Minimum**: 127 bytes (Filecoin's lower bound; files smaller fail with a clear message)
- **Maximum**: effectively unlimited in Phase 1 (streaming + chunking removed the old 200 MiB ceiling)
- **Recommended**: any file under a few GB uploads smoothly on typical connections

For huge files (>50 GB), plan to keep the browser tab open — we don't yet resume interrupted uploads. Phase 2 fixes that.

## Supported file types

All of them. We don't inspect file content. Some types get inline previews:

- Images: png, jpg, gif, webp, svg
- Videos: mp4, webm, mov
- Audio: mp3, wav, ogg, m4a
- Documents: pdf
- Text: anything small

See [previews](previews.md) for details.

## Folders

Dragging a folder works the same way. See [upload a folder](upload-folder.md).
