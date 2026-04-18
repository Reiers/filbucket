# Upload a folder

Drag a folder onto the bucket. That's it. FilBucket recursively walks the folder and uploads every file inside, preserving the relative path.

## What you get

- Every file gets its own `files` row in the DB.
- The original relative path is preserved in the filename (e.g. `project/src/index.ts`).
- Folder structure is visible in the library view.
- Each file goes through the normal durability lifecycle independently.

## How many files at once

Phase 1 streams them sequentially through the upload queue; expect roughly 5–10 concurrent uploads depending on your bandwidth. Phase 2 will add parallelism and proper bulk orchestration.

## What's not supported yet

- **Empty folders**: we only track files, not directories. An empty folder "disappears."
- **Symlinks**: we follow symlinks to files (if readable), but don't preserve them as symlinks.
- **Permissions / mtimes**: not carried into the file record.
- **Atomic folder shares**: you can't yet create a single share link for the whole folder. Each file is shared individually.

## Alternative: file picker

Browsers support a folder-select mode via the `webkitdirectory` attribute. FilBucket exposes it as an **Upload folder** button next to the dropzone, which opens the native folder picker. Identical behavior to dragging.

## Mac app

The Mac app uses `NSOpenPanel` with `canChooseDirectories = true`. Same semantics as the web.

## Programmatic

Upload a folder from a script by walking it client-side and POSTing each file with the `name` field containing its relative path:

```bash
find ./my-folder -type f | while read f; do
  curl -X POST http://localhost:4000/api/uploads/init \
    -H "Content-Type: application/json" \
    -H "X-Dev-User: $DEV_USER_ID" \
    -d "{\"filename\": \"$f\", ...}"
done
```

See [Uploads API](../api/uploads.md).
