<div align="center">
  <img src="apps/web/public/brand/filbucket-mark.svg" alt="FilBucket" width="96" height="96" />

  <h1>FilBucket</h1>

  <p><strong>Your bucket, in the cloud.</strong> Drop files, share them, sleep well — FilBucket quietly makes every file verifiably durable on Filecoin. No wallets, no CIDs, no crypto words in your way.</p>

  <p>
    <a href="#install-in-one-line"><img src="https://img.shields.io/badge/install-curl%20%7C%20bash-0071e3?style=flat-square" alt="installer" /></a>
    <a href="./docs/README.md"><img src="https://img.shields.io/badge/docs-read-1d1d1f?style=flat-square" alt="docs" /></a>
    <a href="#status"><img src="https://img.shields.io/badge/phase-2%20mainnet%20beta-6b4cd9?style=flat-square" alt="phase 2" /></a>
    <a href="#license"><img src="https://img.shields.io/badge/license-MIT-1d1d1f?style=flat-square" alt="license" /></a>
    <img src="https://img.shields.io/github/last-commit/Reiers/filbucket?style=flat-square&color=1d1d1f" alt="last commit" />
    <img src="https://img.shields.io/github/stars/Reiers/filbucket?style=flat-square&color=0071e3" alt="stars" />
  </p>
</div>

---

## Install in one line

```bash
curl -fsSL https://raw.githubusercontent.com/Reiers/filbucket/main/install.sh | bash
```

That one line installs every local dependency (Postgres, Redis, MinIO) via Homebrew, clones the repo, generates a Filecoin calibration wallet, drips tFIL + USDFC from the built-in faucet, runs the one-time Filecoin Pay deposit + FWSS approval, seeds the database, and boots the web + API. Total time: ~3 minutes. When it's done, your browser opens `http://localhost:3010`.

When `get.filbucket.ai` is live this becomes `curl -fsSL https://get.filbucket.ai | bash`.

<details>
<summary>What the installer actually does</summary>

1. Verifies Homebrew, Node 22+, pnpm 10, and git are present.
2. `brew install postgresql@16 redis minio minio-mc librsvg` (skips anything already installed).
3. Starts those services, creates the `filbucket` Postgres role + DB, creates the `filbucket-hot` MinIO bucket.
4. Clones `github.com/Reiers/filbucket` into `~/FilBucket`, runs `pnpm install`.
5. Offers to generate a fresh calibration ops wallet and writes `.env` at the repo root. Symlinks `apps/web/.env.local → ../../.env` so Next.js picks up the `NEXT_PUBLIC_*` variables.
6. Hits the FilBucket faucet (`http://157.180.16.39:8002/drip`) — 3 drips per IP per 12 hours — and polls the chain until the drip lands (~30–60s). Each drip sends 0.5 tFIL + 11 USDFC.
7. Runs `setup-wallet`: deposits 10 USDFC into Filecoin Pay, calls `approveService` on FWSS with a 100-USDFC lockup allowance, waits for both transactions to confirm.
8. Runs Drizzle migrations + seed, symlinks the web env, starts the dev stack with `WATCHPACK_POLLING=true` so Next's file-watcher doesn't blow past macOS's default file descriptor limit.
9. Waits for `http://localhost:3010` to respond, opens it in your default browser.

No `sudo`, no silent writes outside `~/FilBucket`, `~/.filbucket/`, and Homebrew's own prefix. Idempotent — re-running skips anything already set up. `FILBUCKET_YES=1` for non-interactive CI.
</details>

---

## Screenshots

<div align="center">
  <img src="design-previews/01-home-light.png" alt="FilBucket — light mode" width="860" />
  <br/><sub><b>Bucket (light)</b> — iCloud-inspired layout. Sidebar, hero drop tile with animated bucket, pastel file rows, live status pills.</sub>
</div>
<br/>
<div align="center">
  <img src="design-previews/02-home-dark.png" alt="FilBucket — dark mode" width="860" />
  <br/><sub><b>Bucket (dark)</b> — full dark theme. Apple-style deep grey canvas, boosted pastel accents, frosted glass sidebar.</sub>
</div>
<br/>
<div align="center">
  <table>
    <tr>
      <td width="50%"><img src="design-previews/05-detail-light.png" alt="File details" /><br/><sub><b>File details</b> — rounded sheet with status pill, Download + Share, meta grid, collapsible dev-technical section for pieces + events.</sub></td>
      <td width="50%"><img src="design-previews/03-shared-light.png" alt="Shared" /><br/><sub><b>Shared</b> — sidebar nav routes to a themed coming-soon for each upcoming surface (Shared, Recents, Trash).</sub></td>
    </tr>
  </table>
</div>

---

## What FilBucket is

FilBucket is a **file product** that happens to run on Filecoin. It's aimed at the Dropbox-adjacent user, not the protocol tourist:

- 📦 **Real product, not a dashboard.** If it feels like crypto, we lose.
- ⚡ **Instant uploads** to local hot cache. Durability runs async in the background.
- 🔐 **Verifiably durable** — every file is stored across multiple storage providers with continuous on-chain PDP proofs.
- 💸 **Fiat billing, USDFC underneath.** Users never hold crypto, never see a wallet, never sign a transaction.
- 🔗 **Beautiful sharing** — signed links with expiry, password, download limits, revoke anytime.
- 🍎 **Native Mac app** — SwiftUI, drag-drop for files + folders, AVKit previews.
- 🌓 **Light + dark mode** with system preference detection.
- 📁 **Folder uploads, streaming, inline previews** — images, video (with scrubbing), audio, PDF, text.

Everything on the plumbing side (PDP, Filecoin Pay, FWSS, Synapse SDK, USDFC, storage providers) stays invisible unless a user clicks **"How your files stay safe"**.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          FilBucket UI                            │
│     Next.js 15 web · Native macOS arm64 · S3-compat API (soon)   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────┐
│                        FilBucket Backend                         │
│          Fastify · Postgres · Redis · BullMQ · MinIO             │
│                                                                  │
│   Upload  ─►  Hot cache  ─►  Durability worker  ─►  PDP watcher  │
└────────────────────────────────┬─────────────────────────────────┘
                                 │  Synapse SDK · viem
┌────────────────────────────────▼─────────────────────────────────┐
│                Filecoin Onchain Cloud (shared)                   │
│                                                                  │
│   PDPVerifier   FilecoinPay   FWSS   ServiceProviderRegistry     │
│                                                                  │
│   Curio SPs (selected via endorsed set, multi-copy by default)   │
└──────────────────────────────────────────────────────────────────┘
```

- **No SP of our own**: we consume the Filecoin Onchain Cloud; we don't run storage providers.
- **No user wallets**: FilBucket is the payer on every rail. Users pay fiat (or nothing, on free tier).
- **No new contracts**: we use FWSS + Filecoin Pay + PDPVerifier as-is through the Synapse SDK.

Full design: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Internal vocabulary + UI-facing language rules: [`GLOSSARY.md`](./GLOSSARY.md).

---

## Features

|  |  |
|---|---|
| 📤 **Instant uploads** | Hot cache landing in seconds, durability runs async |
| 🪣 **Interactive bucket** | Drag files onto an animated SVG bucket — lid lifts, water rises |
| 📁 **Folder uploads** | Drag a folder, preserve structure end-to-end |
| 🎞 **Inline previews** | Images, video (with scrubbing), audio, PDF, text, markdown |
| 📊 **Live progress** | Per-chunk, per-SP progress events streaming into the UI |
| 🔗 **Share links** | Expiry presets, password, download limits, revoke |
| 🗑 **Delete & dismiss** | Every file, every state — nothing is stuck |
| 🌓 **Light + dark mode** | System preference on first load, remembered per-device |
| 🍎 **macOS native** | SwiftUI drag-drop, AVKit previews, menu bar (coming) |
| 🔐 **Audited access log** | Every share view + download recorded with IP hash |
| 🧾 **Verifiable durability** | PDP proofs every proving period, rail repair on fault |

---

## File states

Under the hood FilBucket tracks five states. In the UI you only ever see three human words:

| Internal | UI label | Color | Meaning |
|---|---|---|---|
| `uploading` | **Uploading** | Sky | Client is PUTting bytes to hot cache |
| `hot_ready` | **Saving** | Lavender | In hot cache, durability worker chunking to SPs |
| `pdp_committed` | **Secured** | Mint | On-chain PDP commit done, first proof observed |
| `archived_cold` | **Archived** | Neutral | Hot cache evicted, still retrievable from SPs |
| `restore_from_cold` | **Restoring** | Sunflower | Re-hydrating to hot cache for a download |
| `failed` | **Failed** | Rose | Upload or commit failed — dismiss + retry |

---

## Repo layout

```
filbucket/
├── apps/
│   ├── web/            Next.js 15 · Inter + IBM Plex Mono · Tailwind
│   ├── server/         Fastify + BullMQ workers · Drizzle ORM
│   └── mac/            Native macOS arm64 (SwiftUI, SwiftPM)
├── packages/
│   └── shared/         TS types + Zod schemas, TS-source module
├── docs/               GitBook-ready documentation
├── infra/
│   └── docker-compose.yml
├── install.sh          The one-liner
├── ARCHITECTURE.md     Full design
├── GLOSSARY.md         Internal terms + UI translation rules
├── SPIKE-NOTES.md      Phase 0/1 dev journal
└── TODO.md             Execution queue
```

---

## Pricing (target)

| Tier | Storage | Price |
|---|---|---|
| Free | 10 GB | $0 |
| Personal | 500 GB | $10 / mo |
| Team | 2 TB | $25 / mo |

Unit economics: **$2.50/TiB/mo/copy** (FOC list price) × 2 copies + CDN + ops ≈ 60% gross margin at $10 / 500 GB.

---

## Stack

**Web** — Next.js 15, React 19, Tailwind 3, **Inter** (400–800) + **IBM Plex Mono** for microcopy, full dark mode driven by `data-theme` + `prefers-color-scheme`.

**Backend** — Node 22, TypeScript, Fastify, Drizzle ORM, Postgres 16, BullMQ on Redis 7, MinIO (S3-compatible) for hot cache.

**Chain** — `@filoz/synapse-sdk`, `@filoz/synapse-core`, `viem`, `argon2`. Calibration testnet through Phase 0 + 1 — **mainnet migration starting now (Phase 2)**.

**macOS** — SwiftUI, SwiftPM (no Xcode project), AVKit, PDFKit.

**Faucet** — Lives at `https://github.com/Reiers/filbucket-faucet`. Drips 0.5 tFIL + 11 USDFC per call, 3 drips per IP per 12h.

---

## Manual setup (if you don't want the one-liner)

<details>
<summary>Step-by-step</summary>

```bash
# 1. Prerequisites
brew install node@22 pnpm postgresql@16 redis minio minio-mc librsvg
brew services start postgresql@16 redis

# 2. Clone + install
git clone https://github.com/Reiers/filbucket.git
cd filbucket
pnpm install

# 3. Local MinIO
minio server ~/minio-data --address :9000 --console-address :9001 &
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/filbucket-hot

# 4. Postgres DB + role
createuser -s filbucket
createdb -O filbucket filbucket
pnpm --filter @filbucket/server db:push --force

# 5. .env at the repo root — minimum:
cat > .env <<EOF
FILBUCKET_OPS_PK=0x<your funded calibration private key>
FILBUCKET_OPS_ADDRESS=0x<address of that key>
FILBUCKET_CHAIN=calibration
FILBUCKET_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
DATABASE_URL=postgres://filbucket:filbucket@localhost:5432/filbucket
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=filbucket-hot
S3_FORCE_PATH_STYLE=true
SERVER_PORT=4000
WEB_PORT=3010
PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
EOF

ln -s ../../.env apps/web/.env.local

# 6. Seed dev user + default bucket — prints the IDs to paste back into .env
pnpm --filter @filbucket/server db:seed

# ↑ paste the printed DEV_USER_ID + NEXT_PUBLIC_DEV_USER_ID + NEXT_PUBLIC_DEFAULT_BUCKET_ID
#   into .env, then:

# 7. One-shot wallet setup (needs a wallet with ≥100 tFIL + ≥10 USDFC on calibration)
pnpm --filter @filbucket/server setup-wallet

# 8. Boot
pnpm dev
```

Need tFIL + USDFC? Calibration faucets:

- tFIL — [faucet.calibnet.chainsafe-fil.io](https://faucet.calibnet.chainsafe-fil.io/funds.html) (100 tFIL per click)
- USDFC — [forest-explorer.chainsafe.dev/faucet/calibnet_usdfc](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc)
- Built-in FilBucket faucet — `POST http://157.180.16.39:8002/drip` with `{"address":"0x…"}`
</details>

---

## Mac app

```bash
cd apps/mac
./Scripts/compile_and_run.sh
```

Builds a signed `.app` bundle and launches it. Point it at your local server via the Settings sheet if the defaults don't match. Notarization + Sparkle auto-update land in Phase 2.

---

## Status

- **Phase 0** ✅ — Scaffold, calibration upload, PDP commit, first-proof watcher, share links.
- **Phase 1** ✅ — Full dashboard redesign (iCloud-style), folder uploads, inline previews, native Mac app, dark mode, real docs.
- **Phase 2** 🚧 **(now)** — Calibration validated end-to-end. Starting migration to **Filecoin mainnet**, Stripe billing, email + magic-link auth, aggregation for small files, private beta.
- **Phase 3** — Team buckets, S3-compatible API, Private Vault (user-held keys), iOS app, SOC 2 readiness.

Full roadmap with dates in [`docs/operations/roadmap.md`](./docs/operations/roadmap.md) and [`ARCHITECTURE §11`](./ARCHITECTURE.md#11-roadmap).

---

## Documentation

📚 **In-repo docs** under [`docs/`](./docs/) — GitBook-ready (Git Sync via `.gitbook.yaml`); `docs.filbucket.ai` publishes once the GitBook side is wired.

Key reads:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — product + infra design
- [`GLOSSARY.md`](./GLOSSARY.md) — internal vocabulary, UI-facing language rules
- [`docs/operations/roadmap.md`](./docs/operations/roadmap.md) — what's done, what's next, dates
- [`docs/operations/changelog.md`](./docs/operations/changelog.md) — every meaningful change
- [`SPIKE-NOTES.md`](./SPIKE-NOTES.md) — dev journal with real findings (Synapse SDK quirks, chain gotchas, decisions)

---

## Contributing

FilBucket is developed in the open. PRs welcome once the Phase 2 API freezes. For now:

- File issues with reproduction steps
- Suggest features via GitHub Discussions
- Follow [@filbucket](https://x.com/filbucket) for updates

---

## License

MIT © 2026 FilBucket · Built on [Filecoin](https://filecoin.io).

<div align="center">
  <sub>Files stay safe because <img src="apps/web/public/brand/filecoin.svg" width="12" height="12" alt="" /> Filecoin never forgets.</sub>
</div>
