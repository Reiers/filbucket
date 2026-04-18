# Changelog

## 2026-04-18 — Phase 1

### Added

- Premium web redesign: interactive bucket dropzone, new typography, refreshed palette.
- Folder uploads (drag + file picker).
- Inline previews: image, video (with scrubbing), audio, PDF, text.
- Real chunk-level progress bars during upload.
- Streaming chunked uploads — files >200 MiB are split automatically.
- Native macOS arm64 app (SwiftUI, AVKit, PDFKit).
- Share links with expiry, password, max-downloads, revoke.
- Delete / dismiss for failed and successful files.
- GitBook docs at [docs.filbucket.ai](https://docs.filbucket.ai).
- README with screenshots and logo.

### Changed

- FilBucket logo: new mark. Bucket-as-Filecoin-blue, `f` glyph integrated into body.
- First-proof detection rewritten — uses `PDPVerifier.getNextChallengeEpoch` directly (FWSS `provenThisPeriod` reverts on fresh datasets).
- `complete` upload API no longer sends `Content-Type: application/json` (Fastify 5 rejects empty JSON bodies).

### Fixed

- Broken first-proof watcher silently swallowing errors — files were stuck at Ready forever.
- `fetch` PUT to MinIO silently capped by browser → switched to XHR with real progress events.
- Download URL unauthenticated because anchor clicks can't set headers → added `?u=<dev-user-id>` query fallback.

### Schema

- `file_pieces`: added `chunk_index`, `chunk_total`, `retrieval_url`, `role`.
- `commit_event_kind`: added `chunk_started`, `chunk_bytes`, `chunk_stored`, `chunk_committed`.
- New tables: `shares`, `share_accesses`.

## 2026-04-17 — Phase 0 scaffold

### Added

- pnpm monorepo with apps/web, apps/server, packages/shared.
- Postgres + Redis + MinIO infra (Homebrew services on macOS; Docker Compose elsewhere).
- Upload → hot cache → durability worker pipeline.
- Synapse SDK integration for Filecoin calibration.
- Ops wallet setup script (USDFC deposit + FWSS operator approval).
- File states: Uploading, Ready, Secured, Archived, Restoring, Failed.
- First-proof watcher (initially buggy, fixed in Phase 1).

### Infra

- Calibration wallet funded with 5000 tFIL + 10 USDFC.
- `ai.filbucket.desktop` bundle id reserved.
- `Reiers/filbucket` GitHub repo live.
