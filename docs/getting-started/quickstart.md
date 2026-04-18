# Quickstart

Get FilBucket running locally in about 5 minutes.

{% hint style="warning" %}
Phase 0 / 1 runs against the **Filecoin Calibration testnet**. You need a calibration wallet funded with a little tFIL (for gas) and some USDFC (for the storage rail). Both are free.
{% endhint %}

## Prerequisites

- macOS, Linux, or WSL
- Node 22+ and pnpm 10
- Homebrew (or Docker) for Postgres, Redis, and MinIO
- A Filecoin calibration wallet (any ETH-compatible wallet works)

## 1 · Fund a calibration wallet

Generate a fresh keypair just for FilBucket:

```bash
# Prints a fresh 0x-prefixed 32-byte private key
openssl rand -hex 32 | awk '{print "0x"$1}'
```

Derive the address from the key (using the FilBucket helper):

```bash
cd filbucket/apps/server
node -e "require('viem/accounts').privateKeyToAccount(process.env.PK).address" \
  PK=0x...
```

Fund it:

1. **tFIL**: [faucet.calibnet.chainsafe-fil.io](https://faucet.calibnet.chainsafe-fil.io/funds.html). Paste your address, click Send Funds. You get 100 tFIL.
2. **USDFC**: there is no plain USDFC drip faucet. The official path is to mint USDFC by collateralizing tFIL via the Trove app at [stg.usdfc.net](https://stg.usdfc.net):
   - Connect a wallet (or import the PK you generated above into MetaMask).
   - Click “Trove” → “Open Trove”.
   - Deposit ~5 tFIL as collateral.
   - Borrow at least 5 USDFC (covers FilBucket Phase 0 dev with headroom).
   - Confirm the transaction.

You need ~10 tFIL for gas + the Trove collateral, and ~5–10 USDFC for the storage rail. Both faucets are intentionally rate-limited but normally hands-free in a real browser.

{% hint style="info" %}
The installer streamlines all of the above. See [installer](installer.md).
{% endhint %}

## 2 · Clone and install

```bash
git clone https://github.com/Reiers/filbucket.git
cd filbucket
pnpm install
```

## 3 · Start infra

On macOS:

```bash
brew services start postgresql@16
brew services start redis
minio server ~/minio-data --address :9000 --console-address :9001 &
```

On Linux / Docker:

```bash
docker compose -f infra/docker-compose.yml up -d
```

## 4 · Seed the database

```bash
createdb -U $USER filbucket
pnpm --filter @filbucket/server db:push --force
pnpm --filter @filbucket/server db:seed
# -> prints DEV_USER_ID and default bucket id
```

## 5 · Write `.env`

Create `.env` in the repo root:

```bash
# Postgres / Redis / MinIO
DATABASE_URL=postgres://filbucket:filbucket@localhost:5432/filbucket
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=filbucket
S3_SECRET_KEY=filbucketsecret
S3_BUCKET=filbucket-hot
S3_FORCE_PATH_STYLE=true

# Calibration
FILBUCKET_OPS_PK=0x...                       # from step 1
FILBUCKET_CHAIN=calibration
FILBUCKET_RPC_URL=https://api.calibration.node.glif.io/rpc/v1

# Dev auth (from step 4)
DEV_USER_ID=<uuid>
NEXT_PUBLIC_DEV_USER_ID=<same uuid>
NEXT_PUBLIC_DEFAULT_BUCKET_ID=<bucket uuid>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 6 · Wallet setup

```bash
pnpm --filter @filbucket/server setup-wallet
```

This deposits USDFC into Filecoin Pay and approves FWSS as operator. Idempotent.

## 7 · Run

```bash
pnpm dev
```

Web at **http://localhost:3010**, API at **http://localhost:4000**.

Drop a file into the bucket. Watch it go:

1. **Uploading** — bytes flowing from browser to our server
2. **Ready** — landed in hot cache (10-30s)
3. **Secured** — replicated to storage providers, first PDP proof confirmed (~5-15 min on calibration)

## Troubleshooting

- **"Wallet not funded"** — re-run the faucets, wait a minute, try `setup-wallet` again
- **"Port 3010 already in use"** — Grafana is probably on 3000 and something else on 3010; bump `WEB_PORT` in `.env`
- **"Nothing happens on drop"** — hard-refresh the browser; `NEXT_PUBLIC_*` vars are bundled at build time
- **PDP proof never lands** — proving windows are ~90 min out on fresh datasets. Patience.

## Next

- [Upload your first file](../guides/first-upload.md)
- [Create a share link](../guides/sharing.md)
- [Install the Mac app](install-mac.md)
