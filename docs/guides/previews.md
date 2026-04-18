# Preview files inline

FilBucket renders a preview inline for most common file types. No download needed.

## What's supported

| Type | Extensions | How |
|---|---|---|
| **Images** | png, jpg, jpeg, gif, webp, avif, svg | `<img>` tag with lazy loading |
| **Video** | mp4, webm, mov, m4v | `<video controls>` with Range support for scrubbing |
| **Audio** | mp3, wav, ogg, m4a, flac | `<audio controls>` |
| **PDF** | pdf | First-page thumbnail via pdf.js (files <20 MB only) |
| **Text** | txt, md, log, json, csv, etc. | First 20 lines, monospace, no syntax highlighting (Phase 2 does) |

Everything else shows a file icon + filename.

## Where previews appear

- **Library row thumbnails**: small inline thumbnail for images.
- **Detail panel**: full-size preview when you click a file.
- **Share page**: preview before the Download button (recipients can decide "is this the file I expected?" before downloading).

## Video specifics

Video playback uses the native HTML5 `<video>` element:

- **Scrubbing** works because MinIO serves `Range` requests.
- **Streaming** is direct from MinIO / FilBeam — no transcoding in Phase 1.
- **Large videos** (1 GB+) play fine; you're just pulling from S3-compat storage.

For Phase 2 we may add client-side HLS transcoding á la [FilStream](https://github.com/curiostorage/filstream). Not needed for the MVP.

## Image specifics

Large images (>20 MB) still render, but are deferred behind a click to avoid blowing out the library viewport. SVGs are sanitized before rendering to prevent XSS.

## PDF specifics

We render the first page as a thumbnail using `pdfjs-dist`. For full PDF viewing, the Download button delivers the file; users can then open it in their PDF viewer of choice.

This avoids bundling a full PDF engine into the web app.

## Privacy note

Previews fetch bytes from MinIO the same way downloads do — authenticated with the owner's dev key (or the share token on public pages). There's no cross-origin leak and no CDN that serves preview bytes differently from download bytes.
