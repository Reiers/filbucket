---
description: The one-liner. Paste it, watch the ASCII bucket, go.
---

# One-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/Reiers/filbucket/main/install.sh | bash
```

That's it. About **3 minutes** from nothing to a fully-local FilBucket on macOS with a funded calibration wallet, approved FWSS operator, and the web app open in your browser.

{% hint style="info" %}
When `get.filbucket.ai` is live, this shortens to `curl -fsSL https://get.filbucket.ai | bash`. Until then, the GitHub raw URL above is the canonical one.
{% endhint %}

## What it does

1. **Checks prerequisites.** Homebrew, Node 22+, pnpm, git. Refuses to run on non-macOS (Linux support lands in Phase 2).
2. **Installs infra** via Homebrew: Postgres 16, Redis 7, MinIO, `mc`, librsvg. Skips anything already installed.
3. **Starts services** via `brew services`. Waits for Postgres to accept connections.
4. **Seeds Postgres** — creates the `filbucket` role and database if they don't exist.
5. **Creates the MinIO bucket** `filbucket-hot` with the dev credentials `filbucket / filbucketsecret`.
6. **Clones the repo** to `~/FilBucket` (or `$FILBUCKET_INSTALL_DIR`).
7. **`pnpm install`** the workspace.
8. **Offers to generate a fresh Filecoin calibration wallet.** Writes the PK to `.env` with chmod 600. Prints the address. Symlinks `apps/web/.env.local → ../../.env` so Next.js picks up the build-time `NEXT_PUBLIC_*` variables.
9. **Drips tFIL + USDFC from the FilBucket faucet** — our own calibration faucet at `http://157.180.16.39:8002/drip`. Each call sends 0.5 tFIL + 11 USDFC. Rate-limited to 3 drips per IP per 12 hours. Polls the chain until the drip lands (~30–60s).
10. **Runs `setup-wallet`** — deposits 10 USDFC into Filecoin Pay, calls `approveService` on FWSS with a 100-USDFC lockup allowance, **waits for both transactions to confirm** before reading state (Filecoin tipset latency is ~30s, synapse-sdk returns right after broadcast).
11. **Runs Drizzle migrations** and seeds the dev user + default bucket.
12. **Boots the dev stack** with `WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=1` so Next's file-watcher sidesteps macOS fsevents limits. Starts both web (`:3010`) and API (`:4000`) in one background process tracked by `~/.filbucket/dev.pid`.
13. **Waits for the web to respond** and opens `http://localhost:3010` in your default browser.

## Safety

- **No `sudo`.** Everything runs in your user shell.
- **No silent overwrites.** Asks before doing anything destructive.
- **Idempotent.** Re-run it any time. It skips what's already done and catches up the rest.
- **Writes only to**: `~/FilBucket/`, `~/.filbucket/`, and Homebrew's own prefix.
- **`.env` is chmod 600** with the ops PK.
- **Zombie-proof port clearing.** Before launching, kills any stray node process listening on `:3010` or `:4000` that the pidfile missed (e.g. from a previous manual `pnpm dev`).

## Options

| Env var | Default | Purpose |
|---|---|---|
| `FILBUCKET_YES=1` | — | Non-interactive mode. Answers yes to all prompts. |
| `FILBUCKET_INSTALL_DIR` | `~/FilBucket` | Where the repo gets cloned. |
| `FILBUCKET_MINIO_DIR` | `~/.filbucket/minio-data` | MinIO data directory. |
| `FILBUCKET_REPO_URL` | `https://github.com/Reiers/filbucket.git` | Override for forks / private repos. |
| `FILBUCKET_GIT_REF` | `main` | Branch/tag to check out. |
| `FILBUCKET_FAUCET_URL` | `http://157.180.16.39:8002` | Point the faucet drip elsewhere. |
| `FILBUCKET_FAUCET_TIMEOUT` | `600` | Seconds to poll for tFIL after a drip. |
| `MINIO_ROOT_USER` | `filbucket` | MinIO root user for the service. |
| `MINIO_ROOT_PASSWORD` | `filbucketsecret` | MinIO root password. |
| `NO_COLOR` | — | Disable ANSI colors. |

## Trove fallback (if the faucet is unreachable)

If our faucet is down (for example we've paused it for upgrades) and you already have a wallet with **≥200 tFIL**, the installer falls back to minting USDFC via a Liquity-style Trove: deposits ~150 tFIL of collateral, borrows 220 USDFC. Single tx, ~90s, no browser, no MetaMask. You need the tFIL first — grab it from the [ChainSafe faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html).

## Manual install

If the installer isn't for you, the [quickstart](quickstart.md) walks through the same steps by hand.

## Linux / WSL

Coming in Phase 2. The core is fully portable (no Homebrew-only calls inside the app), but the installer itself is Homebrew-driven. In the meantime: use the manual [quickstart](quickstart.md).

## Troubleshooting

**"Homebrew not found"**
Install Homebrew first: `https://brew.sh`.

**"Postgres didn't come up in 10s"**
Something else is on port 5432 (often a stale Postgres from an old install). Run `brew services list`, stop the stray, re-run the installer.

**"Wallet already exists, keeping it"**
The installer never clobbers an existing `.env` PK. If you want a fresh wallet, delete `.env` first.

**"Faucet declined — all 3 drips used"**
You've hit the 3-drip-per-IP 12-hour window. Either wait it out, or use a different network. If you just need to retry something, the chain state is still good — your wallet keeps whatever it already has.

**"Need at least 200 tFIL to mint USDFC via Trove"**
Faucet is unavailable and your wallet isn't rich enough for the Trove fallback. Grab 200 tFIL from the [ChainSafe faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html) and re-run the installer — it's idempotent and will pick up where it left off.

**"The UI loads but shows 'Missing NEXT\_PUBLIC\_DEV\_USER\_ID'"**
The `apps/web/.env.local` symlink is missing or broken. The installer creates this; if you messed with `.env` by hand, run `ln -sf ../../.env apps/web/.env.local` from the repo root and restart `pnpm dev`.

**"Node version too old"**
Let the installer add `node@22`, or manage it yourself with fnm/nvm.
