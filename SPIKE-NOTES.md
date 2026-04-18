# FilBucket Phase 0 — Spike Notes

*Written by Capri, 2026-04-18. Ephemeral subagent run.*

## TL;DR

Monorepo scaffolded. Web + server + durability worker + watch-first-proof worker build and typecheck clean. Next step for Nicklas: fund the ops wallet on calibration, run `setup-wallet`, drop a file, watch it flow Uploading → Ready → Secured.

## What was built

```
filbucket/
├── apps/
│   ├── web/                 # Next.js 15 App Router, React 19 RC, Tailwind 3
│   │   └── src/{app, components, lib}
│   └── server/              # Fastify REST + BullMQ workers (two entrypoints)
│       ├── src/{chain, db, middleware, queue, routes, scripts, storage, workers}
│       └── drizzle/         # generated migration + snapshot
├── packages/
│   └── shared/              # @filbucket/shared — FileState enum, zod DTOs
├── infra/
│   └── docker-compose.yml   # Postgres 16 + Redis 7 + MinIO (+ bucket init)
├── .env.example
├── .gitignore               # .env, node_modules, .next, dist, coverage, *.tsbuildinfo
├── package.json             # pnpm workspaces root, `pnpm dev` runs web + server
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md                # Phase 0 "Running locally" appended
```

**LOC** (ts/tsx/css/json/mjs; excludes node_modules/.next/dist):
- `apps/web`: ~492
- `apps/server`: ~1,757
- `packages/shared`: ~167
- **Total**: ~2,416

**Build hygiene** (run from repo root):
- `pnpm -r typecheck` → clean
- `pnpm -r build` → clean (shared dist/, server dist/, web .next/)
- `pnpm -r lint` → clean (intentionally stubbed; Biome setup is a Phase 1 chore)

## What is real vs stubbed

### Real
- End-to-end contract from drag-drop to durability queue. Server receives `uploads/init`, hands back a **MinIO presigned PUT**, client PUTs bytes, server verifies object exists via `HeadObject`, flips state to `hot_ready`, enqueues a BullMQ job, and returns the file row.
- Durability worker streams bytes from MinIO, calls `synapse.storage.upload()` with `metadata: { Application: 'FilBucket' }`, records `file_pieces` (one per copy), upserts `dataset_rails`, and writes a `commit_events` audit trail (`upload_complete` → `store_ok` → `commit_ok`).
- Watch-first-proof worker polls the FWSS view contract `provenThisPeriod(dataSetId)` via `synapse.client.readContract`. On first proof, flips the file to `pdp_committed` and writes `first_proof_ok`. Re-enqueues at 1-min cadence for 30 min, then 30-min cadence up to 6 h, then gives up with a logged `fault`.
- `setup-ops-wallet.ts` — prints balances, deposits USDFC into Filecoin Pay (tries `depositWithPermitAndApproveOperator` first, falls back to plain `deposit`), runs `approveService` for 1 USDFC/epoch rate + 100 USDFC lockup + 30-day max lockup period. Idempotent.
- Startup assertions: `FILBUCKET_CHAIN === 'calibration'` (hard throw on anything else), Synapse client constructs, `walletBalance() > 0`, FWSS operator approval non-zero. The server logs a warning but stays up if the wallet isn't funded yet — the worker fails loudly instead. That's deliberate so `/healthz` remains useful.
- Web polls `/api/files?bucketId=...` every 3 s. Status badges use `FILE_STATE_LABEL` from shared — no crypto words visible in the primary UI.

### Stubbed / Phase-0 shortcuts
- **Auth** is an `X-Dev-User` header match. There is one seeded user. Phase 1 replaces with email magic-link.
- **Download** (`GET /api/files/:id/download`) 302s directly to a MinIO presigned URL. The real cold-tier restore pipeline (pull from SP → hot cache → stream to user) is Phase 1.
- **No chunking or aggregation.** Files upload in one shot; worker collects the S3 stream into a `Uint8Array` before calling `storage.upload`. That caps Phase 0 at ~200 MiB (Synapse SDK's single-piece max) and is comfortably RAM-bounded for the spike. Chunking + small-file CAR aggregation are in the Phase 1/2 TODO.
- **No retry policy** on the durability worker. Explicit `attempts: 1`. On `StoreError`/`CommitError` we flip to `failed`, log a `fault` event, and move on. Phase 1 adds exponential backoff + SP exclusion.
- **No chain-watcher service** yet. First-proof detection is pull-based via the workers. Phase 1 adds a long-lived viem `watchContractEvent` subscriber for `PDPVerifier.PossessionProven` (+ fault / repair events).
- **No encryption, no virus scan, no Stripe, no share links.** Those are Phase 1+.
- **Lint is a no-op.** Biome config is Phase 1 polish so the spike doesn't sink on stylistic churn.

## Synapse SDK quirks I hit

1. **The older task brief was slightly wrong about `UploadResult.copies`.** In `@filoz/synapse-sdk@0.40.3` each copy is `{ providerId: bigint, dataSetId: bigint, pieceId: bigint, role: 'primary'|'secondary', retrievalUrl: string, isNewDataSet: boolean }` — there is no `rail` field on the copy. Rail lookup is a separate call to `WarmStorageService.getDataSet({ dataSetId })`, which returns `{ pdpRailId, cacheMissRailId, cdnRailId, payer, payee, serviceProvider, providerId, ... }`. The worker persists `pdpRailId` into `dataset_rails.rail_id`.
2. **`synapse.warmStorage` is NOT a public getter.** The `Synapse` class keeps `_warmStorageService` private. To call WarmStorage functions I instantiate `new WarmStorageService({ client: synapse.client })` from the `@filoz/synapse-sdk/warm-storage` subpath export. Works fine; just not obvious from the docs.
3. **`Synapse.create({ chain: 'calibration' })` does not exist.** `chain` takes a full viem `Chain` object. Import `calibration` from `@filoz/synapse-sdk` and pass it directly: `Synapse.create({ account, chain: calibration, transport: http(rpc), source: 'filbucket-phase0' })`.
4. **`source` is required.** The `SynapseOptions` type declares `source: string | null`. I set it to `'filbucket-phase0'` so SPs can see us in their logs.
5. **`formatUnits` from the SDK is NOT viem-style.** It takes `(value, { decimals, digits, compact, ... })` — options bag, not a number. I hit this in `setup-ops-wallet.ts` and fixed it.
6. **No `nextChallengeEpoch` on `getDataSet`.** The brief suggested polling that field; the actual FWSS view struct is `{ pdpRailId, cacheMissRailId, cdnRailId, payer, payee, serviceProvider, commissionBps, clientDataSetId, pdpEndEpoch, providerId, dataSetId }`. For first-proof detection I instead read the FWSS view contract's `provenThisPeriod(dataSetId) -> bool` via `synapse.client.readContract({ address: chain.contracts.fwssView.address, abi: chain.contracts.fwssView.abi, functionName: 'provenThisPeriod', args: [dataSetId] })`. `provingDeadline(dataSetId)` is also available if we want to compute time-until-next-window.
7. **Errors use `.is()` static type guards.** `if (StoreError.is(err))` / `if (CommitError.is(err))` — cleaner than `instanceof` across ESM bundles.
8. **`serviceApproval()` return type is under-documented.** I read `rateAllowance` and `lockupAllowance` via a narrow cast. If the shape changes upstream this is where it'll surface first.

## Next.js 15 / React 19 gotchas

1. React 19 RC pinning is pickier than 18. The initial `19.0.0-rc-69d4b800-...` I guessed at did not match `next@15.0.3`'s peer range; I updated to `19.0.0-rc-66855b96-20241106` and peer warnings went away.
2. `transpilePackages: ['@filbucket/shared']` is required in `next.config.mjs` because we import the workspace package from web. Without it, Next tries to read ESM-only `.js` output and the App Router's bundler chokes.
3. I kept Server Components out of the hot path: `src/app/page.tsx` is `'use client'` because polling + dropzone state are all client-side. Phase 1 moves listing to an RSC and upload to an action + `Suspense`.
4. I did NOT wire `next lint` because eslint-config-next pulls in a surprising number of peer deps that drag the install. Phase 1 swaps to Biome (matches Synapse SDK's own setup).

## Next-step checklist for Nicklas

1. `cp .env.example .env` (repo root).
2. `pnpm install`
3. `docker compose -f infra/docker-compose.yml up -d` — verify MinIO console at http://localhost:9001 (user `filbucket`, pass `filbucketsecret`); bucket `filbucket-hot` should exist.
4. `pnpm --filter @filbucket/server db:push` — applies the generated migration.
5. `pnpm --filter @filbucket/server db:seed` — prints `DEV_USER_ID` and `NEXT_PUBLIC_DEFAULT_BUCKET_ID`. Paste into `.env` and ALSO add `NEXT_PUBLIC_DEV_USER_ID=<same-value>` and `NEXT_PUBLIC_API_URL=http://localhost:4000` so the web app can talk to the server.
6. Generate a calibration key (any `openssl rand -hex 32` gives you a usable PK; prefix with `0x`). Set `FILBUCKET_OPS_PK=0x...` in `.env`. **Do not paste into chat.**
7. Fund it:
   - tFIL: https://faucet.calibnet.chainsafe-fil.io/funds.html
   - USDFC: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc
8. `pnpm --filter @filbucket/server setup-wallet` — deposits 10 USDFC, approves FWSS as operator. Re-run any time.
9. `pnpm dev` — web on :3000, server on :4000 (server runs both API and both workers in one process-group).
10. Open http://localhost:3000 → drop a small file (< 100 MiB to stay safe). Watch it flip Uploading → Ready quickly, then Secured once the first PDP proof lands (usually a few minutes on calibration).
11. If something stalls, tail the worker log — every transition writes a row to `commit_events` which you can inspect via `GET /api/files/:id` (the web side panel's "Technical details" section also shows it).

## Unresolved / flagged for Nicklas + me

1. **How do we want to present "Secured" latency to the user?** First PDP proof on calibration can take 5–30 minutes depending on SP. The UI says "Ready" instantly and silently upgrades to "Secured". That's correct per ARCHITECTURE §3 — but do we want a subtle progress indicator while it's pending? I deliberately left it pure-silent for Phase 0; revisit in Phase 1 design.
2. **File-size ceiling.** I cap uploads in-memory (the worker does `collectBytes`). Effective ceiling is ~200 MiB per file for Phase 0 (Synapse single-piece max). If Nicklas wants to test 500 MiB+ now, we need to move to the Synapse SDK's streaming upload signature, which I skipped for complexity. ETA: 2–3 hours.
3. **Rail monitoring.** `dataset_rails` table exists but nothing reads it yet. Phase 1 needs a balance watcher ("ops wallet USDFC lockup runway < 30 days → alert Nicklas"). Not blocking the spike.
4. **Download path.** Currently 302 → MinIO. Once a file is `archived_cold` we have to rehydrate via the SP's retrieval URL (stored in each `UploadResult.copies[].retrievalUrl`, which I am NOT currently persisting — should I?). Flagging this as the first real architectural choice in Phase 1.
5. **The `WarmStorageService` + `provenThisPeriod` path.** My first-proof detection is correct but somewhat indirect. If the Synapse team exposes a higher-level `synapse.onFirstProof(dataSetId, cb)` helper later, we should swap to it.
6. **Commit granularity.** I committed in big checkpoints (see git log) rather than per-file micro-commits. Happy to re-slice if you prefer a denser history on the feature branch.

If I hit a blocker I couldn't route around, it would be here. I didn't hit one; this spike is ready for your hands.

---

## Path B — Streaming + chunked uploads (2026-04-18 21:45)

The original scaffold buffered the whole file into a `Uint8Array` before
`storage.upload`. That capped uploads at roughly 200 MiB / whatever RAM the
worker has. Path B replaces that with:

- **Chunked upload**: files > 200 MiB are split into ≤200 MiB pieces
  (`MAX_PIECE_BYTES` in `durability.ts`). Each chunk is its own Synapse
  `storage.upload()` call, which produces its own `file_pieces` rows (one per
  copy per chunk).
- **Streaming**: each chunk is pulled from MinIO via byte-range `Range` header
  (`getObjectChunkStream`) and fed straight to Synapse as a Web `ReadableStream`
  via `Readable.toWeb()`. The worker never buffers a full chunk in memory.
- **Dataset reuse**: Synapse SDK's default provider-selection already picks the
  same SP + dataset as prior pieces when metadata matches. Verified on a
  300 MB test: both chunks landed in dataset 13175, so one payment rail per
  file, not one per chunk. Good.
- **Per-chunk progress**: worker's `callbacks.onProgress` emits `chunk_bytes`
  commit events every 4 MiB (`PROGRESS_EVENT_STRIDE_BYTES`), with
  `totalUploaded`/`totalBytes` so the UI can render a live bar.
- **Browser upload progress**: `putObject()` switched from `fetch` to `XHR`
  because `fetch` doesn't expose `upload.progress` in browsers. Same final
  result, with a real progress bar.
- **Retrieval URL persisted**: `file_pieces.retrieval_url` column populated
  from Synapse's `CopyResult.retrievalUrl`. Needed for Phase 1 restore-from-cold.
- **Schema**: `file_pieces` gained `chunk_index`, `chunk_total`, `retrieval_url`,
  `role`. Enum `commit_event_kind` gained `chunk_started`, `chunk_bytes`,
  `chunk_stored`, `chunk_committed` for debugging the upload pipeline.

**Verified end-to-end on calibration:**
- 10 MB file: single chunk, 2 SP copies, ~2 min to `commit_ok`.
- 300 MB file: 2 chunks (200+100 MiB), 2 SP copies each = 4 `file_pieces` rows,
  same dataset for both chunks, ~5 min total to `commit_ok`.

**Open items left over for Phase 1:**
- Download path is still direct-MinIO. For a multi-chunk file this already
  works because MinIO serves the whole object. The *cold restore* path
  (rehydrate from SP pieces when hot cache is evicted) has to stream chunks
  back in byte-range order — not built yet.
- Chunk-level retry: if chunk 2 of 3 fails, the whole file is marked `failed`.
  Should become "retry just the missing chunks" in Phase 1.
- Aggregation for < 1 MiB files into shared CAR bundles — separate from Path B.


---

## macOS app — `apps/mac/` (Phase 0)

Native SwiftUI client. SwiftPM only (no Xcode project). Talks to the same
backend the web app uses. Lives at `apps/mac/`.

### What works

- `swift build` clean. `swift test` passes (4 smoke tests).
- `Scripts/package_app.sh` produces `FilBucket.app` (arm64, macOS 14+,
  bundle id `ai.filbucket.desktop`, adhoc-signed by default).
- `Scripts/build_icon.sh` converts `apps/web/public/brand/filbucket-mark.svg`
  → `Icon.icns` via `rsvg-convert + sips + iconutil`.
- App launches, window opens, shows the FilBucket sidebar library + hero
  dropzone, polls `/api/files` every 3 s, displays the same human state
  badges as the web (Uploading / Ready / Secured / Archived / Restoring /
  Failed).
- Drag-and-drop for files + folders (recursive walk, paths preserved as
  `folder/sub/file.ext` in the upload filename).
- Real progress bars on uploads (URLSession `didSendBodyData` → live bytes).
- Inline previews: image (NSImage), video/audio (AVKit), PDF (PDFKit), text.
- Share-link sheet: expiry presets (1h/24h/7d/30d/never), optional
  password (≥4 chars), max-downloads cap. URL is copied to clipboard on
  create.
- Settings panel (`⌘,`) for server URL / dev user ID / default bucket ID,
  persisted in `UserDefaults`.
- Offline banner driven by `/healthz` polling every 5 s.
- Brand match: warm-paper background (`#f7f4ee`), burnt-sienna accent
  (`#b54a17`), serif headings, geometric sans body, `.regularMaterial`
  on sidebar + toolbar.

### LOC

- Swift sources: 1,865 lines across 13 `Sources/` files + 1 test file.
- Total inc. scripts + README + Package.swift: ~2,500.

### Run / build

```
cd apps/mac
brew install librsvg              # one-time, for the icon pipeline only
Scripts/build_icon.sh             # generates Icon.icns from brand SVG
swift test                        # 4 smoke tests, ~0.01s
Scripts/compile_and_run.sh        # kill, package, launch
```

### What's stubbed / known limitations

- **Adhoc signature** — packaged app is signed with `-` not a real cert.
  `setup_dev_signing.sh` creates a self-signed cert in the login keychain
  but it has to be manually trusted in Keychain Access ("Always Trust →
  Code Signing") before `codesign` will pick it up. Once trusted, set
  `APP_IDENTITY="FilBucket Development"` and re-run `package_app.sh`.
  Without that, the app launches fine via `open` (verified) but
  `spctl --assess` rejects it — that's expected for adhoc signatures.
- **No magic-link auth.** Dev `X-Dev-User` header only. Settings panel
  exposes the dev user ID for switching identities locally. Real auth is
  Phase 2.
- **No Sparkle auto-update.** Phase 2.
- **No notarization.** Phase 2.
- **No menu-bar / status-item mode.** Main window only — by design.
- **Folder uploads** join the relative path with `/` into the filename.
  Server stores it verbatim. If/when the server adds a real `path` field
  on `/api/uploads/init`, the mac client should be updated to send it
  separately so the web sidebar can render folder hierarchy properly.
- **Error reporting** is minimal — failures show in the in-flight row's
  status label and a `print(...)` to stderr. No global toast/error sink yet.

### Top 3 followups

1. **Real Developer ID + notarization** so the app launches cleanly when
   downloaded from a release page (and `spctl --assess` is happy).
   `Scripts/sign-and-notarize.sh` is already wired up; just needs an Apple
   Developer account and `notarytool` profile.
2. **Magic-link auth flow** so the app can run against a non-dev user.
   Should mirror whatever the web lands; in the meantime the dev header
   path is the same as the web's.
3. **Surface upload errors visibly.** Today a failed upload sticks in the
   in-flight section but there's no banner / toast / modal. A small global
   error sink + a "Retry" button on the failed row would close the loop.


---

## Phase 1 redesign (2026-04-18, late evening)

Subagent run. The directive: take the Phase 0 "works but boring" web app and push
it to premium / Awwwards-adjacent. What landed:

### What was shipped

- **Premium typography.** Replaced Instrument Serif + Inter + JetBrains Mono with
  **Fraunces** (variable, SOFT + opsz axes wired in for the hero) + **Plus Jakarta
  Sans** for body + JetBrains Mono for microlabels. Fraunces is doing the heavy
  lifting on the hero line and on file-detail headers; its soft/opsz axes make the
  italic feel hand-lettered instead of Google-Fonts-default.
- **Interactive bucket dropzone** (`BucketDropzone.tsx`). Giant blue SVG that matches
  the brand mark exactly (same Filecoin-blue gradient, same italic 'f' in negative
  space). Three visual states: idle (breathe + shimmer), drag (lid lifts off + tilts,
  dark mouth exposed, splash particles rise), filling (soft ping ripples + rotating
  prompt copy). `dragenter/dragover/dragleave/drop` listeners attached to `window`
  so a user can drop anywhere on the page and still get the bucket visual feedback.
  Dev-only: `#debug-drag` / `#debug-fill` in the URL forces a state for screenshots.
- **Folder upload.** Works via drag-drop (recursive
  `DataTransferItemList.webkitGetAsEntry` walk) AND via a second button
  `<input webkitdirectory>`. Relative paths are preserved.
- **Real chunk-level progress** (`FileRow.tsx` + `useRollingRate.ts`). New row
  layout: thumbnail | name (with optional folder-path prefix) | size | status chip +
  microlabel | added | delete. A 2px progress line sits absolutely-positioned under
  the whole row. Microlabel shows `"4.2MB / 10MB · 42% · 380KB/s"` with the bytes/sec
  computed over a rolling 3-second window. During the server-side chunking phase the
  bar goes indeterminate (sliding gradient) when no samples have arrived yet, then
  becomes determinate once the server emits a `chunk_bytes` event.
- **Inline previews** (`FilePreview.tsx` + `PreviewModal.tsx`). Image thumbnails
  inline in the library rows. VIEW links open a full-screen modal with backdrop blur
  + ESC to close. Native `<video>` / `<audio>` (MinIO's presigned URL supports Range,
  so scrubbing Just Works). PDF first-page render via `pdfjs-dist` (lazy-imported,
  worker pulled from the package URL). Text files: Range-request the first 4KB and
  show first 20 lines monospace. Same preview component is reused on the share page
  so recipients see the content before downloading.
- **Share page redesign.** Soft radial gradient backdrop, the bucket mark sitting
  faintly in the bottom-right as a watermark, preview inline above the filename,
  Fraunces-set filename at `clamp(1.5rem, 3.5vw, 2.25rem)`. Password UI is still there
  when needed. "Stored on Filecoin" footer microlabel unchanged.
- **Copy audit.** All `Phase 0 · Calibration testnet` eng-strings gone. Footer
  microlabel is now simply `Dev · Calibration` (bucket env marker). Only one Filecoin
  mention remains, in the footer row next to the mark. No CIDs / rails / pieces /
  wallets / epochs in user-facing copy.
- **Motion hygiene.** All keyframes + transitions honor `prefers-reduced-motion`
  via the global reset in `globals.css`.
- **Empty state** for the Library: faded bucket mark + Fraunces italic "An empty
  bucket, patiently waiting." + a friendly pointer to the Ready→Secured flow. No
  stock-empty-state shrug guy.

### Design decisions made on the fly

- **Folder paths in `name`, not a new DB column.** The server already accepts
  `filename` up to 512 chars via `UploadInitRequest`. Embedding the relative path
  (`brand/2026/colors.txt`) directly in `name` avoids a schema migration + keeps
  `FileDTO` unchanged. The UI splits on the last `/` so the folder prefix is rendered
  as a monospace caption above the basename, flat-list-style. A proper `path` column
  is a follow-up when folders become first-class groupable entities.
- **Brand mark is now blue.** Nicklas had updated `filbucket-mark.svg` to a
  Filecoin-blue silhouette with italic-'f' negative space sometime before this run.
  The big `BucketArt` component was originally drawn in the old sienna palette;
  I reshaped it to match the new brand (same gradient, same geometry) so the big
  hero bucket reads as a scaled-up version of the small mark in the header.
- **Fraunces over Clash Display / Migra.** Fraunces is on Google Fonts (OFL), ships
  variable with SOFT + opsz axes, and plays nicely with `next/font`. Clash Display
  and Migra would have pulled us off Google Fonts onto Fontshare/paid SaaS. Fraunces
  hits "editorial / premium / hand-lettered" without the license headache.
- **No framer-motion animations after all.** It's installed, but every motion I
  needed ended up expressible as CSS keyframes + transition. Framer is still in the
  deps for future interactions (scroll-triggered reveals, etc.) without re-adding.
- **JSX escape bug.** Early iteration used `\u00b7` and `\u2026` as literal source
  in JSX text nodes — which JSX renders verbatim instead of evaluating. Swept the
  entire `apps/web/src` for those and replaced with actual Unicode chars (`·`, `…`,
  `←`). Lesson: backslash-escapes only work in quoted strings / template literals,
  not bare JSX text.

### Stubbed / not done

- **FilStream-level video streaming.** Phase 0 ships native `<video>` against the
  hot-cache URL. Works great for MP4/WebM because MinIO supports Range. True HLS/DASH
  transcoding (like the filstream repo does client-side via ffmpeg.wasm) is a Phase 2
  follow-up if/when we care about sub-GB latency on 4K content. Noted in this file
  because we may want it for the "durable large-file sharing" wedge.
- **Share modal screenshot.** Couldn't get a two-step automated click sequence
  through capture-website, so `09-share-modal.png` is intentionally missing from
  design-previews. The modal itself has been polished (Fraunces on the filename +
  stronger drop shadow) and builds clean.
- **Upload error UX.** If a user drops 40 files and two fail, there's still only a
  thin red banner at the top of the page. Failed rows show in the library but have
  no "Retry" affordance yet. Follow-up.
- **Concurrency cap on bulk drops.** Currently hardcoded to 3 parallel uploads for
  folder drops (in `page.tsx::onFiles`). That's a taste decision; an adaptive cap
  based on connection speed would be nicer later.

### Build status

- `pnpm -r typecheck` → clean
- `pnpm -r build` → clean, web bundle 126 kB First Load JS on `/`, 105 kB on `/s/[token]`
- Hot-reload worked for all edits except when I nuked `.next/` mid-session (don't do
  that — took a full `next dev` restart to recover).

### Design previews

Dropped into `design-previews/`:
- `01-home-idle.png` — hero + bucket + library empty-state (earlier render, has a
  u00b7 bug I later fixed)
- `02-library-mixed.png` — populated library with folder path, mixed file states
  (READY, SECURED, FAILED), image thumbnails, VIEW links
- `03-library-files.png` — above-the-fold only
- `04-share-page.png` — what a recipient sees; image preview + big filename
- `05-home-after-lid-fix.png` — post-layout fix, clean idle bucket
- `06-home-final.png` — final idle state
- `07-preview-image.png` — full-screen image preview modal with backdrop blur
- `08-bucket-drag.png` — **the signature moment**: lid lifted, mouth open, splash
  particles, "Let go, we've got it." copy

### Self-critique

Two rounds via the vision tool. Final verdict from the critic on the drag state:
> "Polished, thoughtful UX with a playful microinteraction that enhances usability
> rather than distracting from it — the lid animation provides clear affordance
> feedback during the exact moment users need reassurance."

Verdict: the lid-off interaction is the signature moment we were after. Not a gimmick.

### Top 3 follow-ups

1. **Proper folder grouping.** Right now folder paths live in the filename and the
   library is flat. Group rows by common folder prefix into collapsible sections
   (e.g. a `brand/2026/*` group), with an aggregate size + status rollup. Adds a
   real `path` column to `files`.
2. **Upload error surface.** Failed rows need a "Retry" button wired to re-run init
   + PUT + complete with the same `File` handle (keep the File alive in a ref). Plus
   a toast stack for transient network errors instead of one shared banner.
3. **Smart video preview.** For now native `<video>` is fine. When a user uploads a
   4K MOV, though, we should either transcode to H.264/VP9 server-side on ingest or
   use ffmpeg.wasm on the share page to do HLS chunks client-side (filstream model).
   This is the obvious Phase 2 win for the WeTransfer-killer wedge.
