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
