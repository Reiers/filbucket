---
description: The one-liner. Paste, answer a few prompts, go.
---

# One-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/Reiers/filbucket/main/install.sh | bash
```

That's it. Five-ish minutes from nothing to a fully-local FilBucket on macOS.

{% hint style="info" %}
When `get.filbucket.ai` is live, you'll be able to use `curl -fsSL https://get.filbucket.ai | bash`. Until then, the GitHub raw URL above is the canonical one.
{% endhint %}

## What it does

1. **Checks prerequisites.** Homebrew, Node 22+, pnpm, git. Refuses to run on non-macOS (Linux support is coming).
2. **Installs infra** via Homebrew: Postgres 16, Redis 7, MinIO, `mc`, librsvg. Skips anything already installed.
3. **Starts services** via `brew services`. Waits for Postgres to accept connections.
4. **Seeds Postgres**: creates the `filbucket` role and db if they don't exist.
5. **Creates the MinIO bucket** `filbucket-hot` with the dev credentials `filbucket / filbucketsecret`.
6. **Clones the repo** to `~/FilBucket` (or `$FILBUCKET_INSTALL_DIR`).
7. **`pnpm install`** the workspace.
8. **Offers to generate a fresh Filecoin calibration wallet.** Writes the PK to `.env` with chmod 600. Prints the address.
9. **Opens the tFIL faucet in your browser** with the address copied to your clipboard. Polls the chain until tFIL lands.
10. **Walks you through minting USDFC via the Trove app** ([stg.usdfc.net](https://stg.usdfc.net)). There is no plain USDFC drip faucet — you collateralize tFIL to borrow USDFC. Polls until USDFC lands.
11. **Runs Drizzle migrations** and seeds the dev user + default bucket.
12. **Auto-runs `setup-wallet`** (USDFC deposit into Filecoin Pay + FWSS operator approval).
13. **Prints the final command**: `pnpm dev`.

## Safety

- **No `sudo`.** Everything runs in your user shell.
- **No silent overwrites.** Asks before doing anything destructive.
- **Idempotent.** Re-run it any time. It skips what's already done and catches up the rest.
- **Writes only** to: `~/FilBucket/`, `~/.filbucket/`, and Homebrew's own prefix.
- **`.env` is chmod 600** with the ops PK.

## Options

| Env var | Default | Purpose |
|---|---|---|
| `FILBUCKET_YES=1` | — | Non-interactive mode. Answers yes to all prompts. |
| `FILBUCKET_INSTALL_DIR` | `~/FilBucket` | Where the repo gets cloned. |
| `FILBUCKET_MINIO_DIR` | `~/.filbucket/minio-data` | MinIO data directory. |
| `FILBUCKET_REPO_URL` | `https://github.com/Reiers/filbucket.git` | Override for forks / private repos. |
| `FILBUCKET_GIT_REF` | `main` | Branch/tag to check out. |
| `MINIO_ROOT_USER` | `filbucket` | MinIO root user for the service. |
| `MINIO_ROOT_PASSWORD` | `filbucketsecret` | MinIO root password. |
| `NO_COLOR` | — | Disable ANSI colors. |

## Manual install

If the installer isn't for you, the [quickstart](quickstart.md) walks through the same steps by hand.

## Linux / WSL

Coming in Phase 2. The core is portable (no Homebrew-only calls inside the app), but the installer itself is Homebrew-driven. Interim: use the manual [quickstart](quickstart.md).

## Troubleshooting

**"Homebrew not found"**
Install Homebrew first: `https://brew.sh`.

**"Postgres didn't come up in 10s"**
Something else is on port 5432 (often a stale Postgres from an old install). Run `brew services list`, stop the stray, re-run the installer.

**"Wallet already exists, keeping it"**
The installer never clobbers an existing `.env` PK. If you need a fresh one, delete `.env` first.

**"Node version too old"**
Let the installer add `node@22`, or manage it yourself with fnm/nvm.

**"The UI loads but the library is empty even though files exist on the server"**
You probably have a stale `NEXT_PUBLIC_DEV_USER_ID`. The installer writes these at seed time; if yours looks wrong, re-run `pnpm --filter @filbucket/server db:seed` and paste the new values into `.env`.
