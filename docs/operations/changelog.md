# Changelog

## 2026-04-19 — Phase 1 finished + installer hardened + calibration e2e proven

### Calibration end-to-end evidence

With the installer running on a fresh machine, three uploads flowed cleanly
through the full pipeline:

- `client PUT → MinIO hot cache` (via presigned S3 URL)
- `durability worker chunks & stores on 2 SPs` (`store_ok` with `copies[]`)
- `on-chain PDP commit` (`chunk_committed` + `commit_ok` with `dataSetId`)
- two-copy redundancy: dataset `13175` on SP 4 (`caliberation-pdp.infrafolio.com`) + dataset `13176` on SP 2 (`calib2.ezpdpz.net`)
- both retrieval URLs serve the piece CIDs; pieces visible via the SP endpoints

The `pdp_committed` state transition fires passively when the first-proof
watcher observes `getNextChallengeEpoch` advance for the dataset (~30 min
proving period on calibration). Calibration is now fully validated as the
base case before mainnet migration.


### Added

- **iCloud-style UI overhaul**
  - Custom FilBucket mark (v3) — proper Filecoin `f` glyph centered on the bucket face, volumetric shading, rolled lip, ambient ground shadow. 128×128 viewBox, scales cleanly from favicon to app icon.
  - Custom wordmark pairing the mark with Inter Display tight-tracked.
  - Full type-system replacement — Inter (400–800) + IBM Plex Mono, feature-settings `cv11 ss01 ss03` for SF-Pro-alike feel.
  - iCloud pastel palette — sky / lavender / mint / peach / rose / sunflower, each with fill / base / deep ramps.
  - Rounded-tile layout language, spring easings (`cubic-bezier(0.34, 1.56, 0.64, 1)`) on all interactive elements.
  - New layout: frosted-glass sidebar + main content area, sticky top bar with ⌘K search.
- **Dark mode** — full `data-theme`-driven theme system, pre-hydration inline script prevents flash, harmonised pastels, boosted accents for dark canvas. localStorage-persisted, respects `prefers-color-scheme` on first load.
- **Real routed pages** — `/recents`, `/shared`, `/trash` each have themed coming-soon pages with pastel illustrations and back-to-bucket CTAs.
- **File details sheet** — rebuilt as an iCloud-style rounded sheet with shimmer loading skeleton, status chip, Download + Share pill buttons, clean meta grid (Status / Size / Kind / Added / Updated), collapsible Dev · technical section.
- **Status tooltip** — `?` HelpTip on the Status column header explains the state machine (Uploading → Saving → Secured) on hover / focus / click.
- **Pastel file-type icons** driven by classifier (image / video / audio / doc / code / archive / generic), correctly handles empty-mime iOS files via extension fallback (HEIC, raw formats, etc.).
- **One-line installer** — `curl -fsSL .../install.sh | bash` installs Homebrew deps, clones, sets up wallet, funds via own faucet, runs setup-wallet, boots dev stack. ~3 minutes end-to-end.
- **FilBucket faucet service** — own calibration drip at `http://157.180.16.39:8002/drip`. 0.5 tFIL + 11 USDFC per drip, 3 drips per IP per 12h, backward-compatible store migration. Source: `github.com/Reiers/filbucket-faucet`.

### Changed

- `FILE_STATE_LABEL.hot_ready` renamed from "Ready" to "Saving" — matches the sidebar status chip terminology ("Ready" was misleading since the server is still chunking to SPs).
- Table column headers: no more uppercase-mono labels. Plain Inter 12px semibold (the AI-template look Nicklas flagged).
- Installer end-of-run banner trimmed — only shows `Web http://localhost:3010`, dropped API + Console lines.
- Package `@filbucket/shared` retains `.js` intra-package imports (standard nodenext) + Next.js web config adds `webpack.resolve.extensionAlias` to map `.js → [.ts, .tsx, .js]` for bundler interop. Both server tsc and Next dev typecheck clean.

### Fixed

- **Installer silently exited** after "Web env vars look good" because `PIDS=$(lsof | awk | sort)` returned non-zero under `set -o pipefail` → `set -e` killed the script. Added `|| true`.
- **Next dev serving 404 on `/`** even though compilation succeeded — root cause was watchpack EMFILE on macOS default ulimit. Installer now boots the dev stack with `WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=1` which sidesteps fsevents entirely.
- **`nohup pnpm dev` wedging** when invoked from `curl | bash` because inherited piped stdin confused Next. Installer redirects `< /dev/null`.
- **`setup-wallet` tx confirmation race** — Synapse SDK's `deposit()` and `approveService()` are fire-and-forget. Script now awaits `waitForTransactionReceipt` after both before reading state. Previously `assertWalletReady()` failed spuriously even though txs eventually confirmed.
- **Faucet rate-limit too tight** — was 1 drip per IP per 12h, one hiccup locked a new user out for half a day. Now 3 per IP per 12h with backward-compat migration of existing single-timestamp entries.
- **Faucet USDFC drip too small** — 5 USDFC drip couldn't cover the 10-USDFC FWSS deposit. Bumped to 11.
- **Bash integer math truncating balances** — `${FIL%.*}` treated 0.5 tFIL as "0". Added `gte()` awk helper for proper float comparisons; funding gates now use named constants `MIN_USDFC_FOR_SETUP=10` and `MIN_TFIL_FOR_GAS=0.1`.
- **`packages/shared/src/index.ts` .js imports** — Next 15 couldn't resolve the nodenext-style `./file-state.js`. Fixed via Next webpack `resolve.extensionAlias` (keeping nodenext server correctness).
- **Hydration warning** from `data-theme` attribute set by inline script before React hydrates. Added `suppressHydrationWarning` on `<html>` + `<body>`.
- **NEXT_PUBLIC_* env vars missing** because installer wrote them to workspace-root `.env` but Next.js only reads `.env*` from each pnpm package's own cwd. Installer now symlinks `apps/web/.env.local → ../../.env`.
- **FileDetailPanel rendering as transparent mess** — was using old `paper` / `paper-raised` / `line-strong` design tokens that don't exist in the new palette. Fully rebuilt.

### Schema

- No changes this pass.

---

## 2026-04-18 — Phase 1 first pass

### Added

- Premium web redesign: interactive bucket dropzone, new typography, refreshed palette.
- Folder uploads (drag + file picker).
- Inline previews: image, video (with scrubbing), audio, PDF, text.
- Real chunk-level progress bars during upload.
- Streaming chunked uploads — files >200 MiB are split automatically.
- Native macOS arm64 app (SwiftUI, AVKit, PDFKit).
- Share links with expiry, password, max-downloads, revoke.
- Delete / dismiss for failed and successful files.
- GitBook docs scaffold under `docs/`.
- README with screenshots and logo.

### Changed

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

- pnpm monorepo with `apps/web`, `apps/server`, `packages/shared`.
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
