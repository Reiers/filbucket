# FilBucket

Dropbox-style file storage on Filecoin.

## Vision

FilBucket should feel like a normal, beautiful file product.
Not a crypto tool.
Not a protocol dashboard.
Not a pile of Web3 jargon.

The promise is simple:

**Upload, store, and share files simply, with Filecoin-grade durability underneath.**

Users should never need to think about:
- CIDs
- storage deals
- wallets
- miners
- retrieval markets
- on-chain anything

Those details belong inside the product, not in the user experience.

## Product Thesis

Most Filecoin products expose the plumbing.
That is why normal users do not adopt them.

FilBucket wins by doing the opposite:
- instant-feeling uploads
- human language for file state
- beautiful sharing
- calm, trustworthy UX
- Filecoin under the hood, invisible by default

This is not "access to Filecoin" as a product.
This is a real file-storage product powered by Filecoin.

## MVP

### Core user flows
- Upload files with drag-and-drop
- Organize files into folders or buckets
- Preview and download files
- Generate share links
- Control privacy, expiry, and optional password protection

### Reliability layer
- Hot storage / cache for immediate availability
- Background durability pipeline into Filecoin
- Human-readable file states:
  - Uploading
  - Ready
  - Secured
  - Archived
  - Restoring

### Authentication
- Email login
- Social login later if useful
- No wallet required

## UX Principles

### 1. Feel immediate
Uploads should feel done immediately, even if deeper durability work continues in the background.

### 2. Hide protocol complexity
No raw infrastructure language in the primary interface.

### 3. Make sharing delightful
A great share-link flow is table stakes.

### 4. Earn trust quietly
Show durability and integrity in plain language, not chain theater.

### 5. Be boring in the right way
This should feel more like Dropbox or Backblaze than a Web3 project.

## Positioning

### User-facing
- Simple file storage
- Durable backup
- Easy file sharing

### Infrastructure truth
- Filecoin-backed durability
- Retrieval acceleration via cache layer
- Optional future S3/API surface

## What FilBucket is not
- not a token product
- not a wallet product
- not an NFT file vault
- not a protocol explorer
- not a crypto-native UX experiment

## Possible wedge

Start with one sharp use case:
- large file sharing
- long-term archive storage
- dataset storage
- team dropbox for durable files

"Dropbox for Filecoin" is useful shorthand, but the actual wedge should be narrower and stronger.

## Near-Term Build Plan

1. Define the exact first wedge
2. Design the information architecture
3. Design the file-state model and storage pipeline
4. Build a simple upload + library + share-link MVP
5. Add Filecoin durability behind the scenes
6. Polish until it feels calm and obvious

## Initial concept

FilBucket should be:
- more normal than web3 products
- more trustworthy than hacker projects
- more elegant than infra dashboards

If it feels like crypto, it loses.
If it feels like a clean file product that quietly uses Filecoin well, it has a shot.

---

## Running locally (Phase 0 dev spike)

> Phase 0 targets **Filecoin calibration testnet only**. The server refuses to
> start against any other chain. See `ARCHITECTURE.md §13` for locked defaults.

### Prerequisites
- Node 22
- pnpm 10
- Docker (for Postgres + Redis + MinIO)

### 1. Install + start infra
```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
```
That brings up:
- Postgres 16 on `:5432` (user `filbucket`/`filbucket`, db `filbucket`)
- Redis 7 on `:6379`
- MinIO on `:9000` (console on `:9001`) with bucket `filbucket-hot` pre-created

### 2. Copy env + migrate the DB
```bash
cp .env.example .env
pnpm --filter @filbucket/server db:push
```

### 3. Seed a dev user + default bucket
```bash
pnpm --filter @filbucket/server db:seed
```
Copy the printed `DEV_USER_ID` and `NEXT_PUBLIC_DEFAULT_BUCKET_ID` into `.env`
(also mirror `NEXT_PUBLIC_DEV_USER_ID=<same>` and `NEXT_PUBLIC_API_URL=http://localhost:4000`
so the web app can reach the server). The web package reads `NEXT_PUBLIC_*` at build time.

### 4. Fund the ops wallet on calibration
You need tFIL (for gas) and USDFC (for rail payments).
1. Generate a private key and set `FILBUCKET_OPS_PK=0x...` in `.env`.
2. Grab tFIL: https://faucet.calibnet.chainsafe-fil.io/funds.html
3. Grab USDFC: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc
   (see also https://docs.secured.finance/usdfc-stablecoin/getting-started/getting-test-usdfc-on-testnet)

### 5. Deposit USDFC + approve FWSS as operator
```bash
pnpm --filter @filbucket/server setup-wallet
```
Idempotent. Prints balances + approval state. Safe to re-run.

### 6. Run it
```bash
pnpm dev
```
- Web at http://localhost:3000
- Server at http://localhost:4000
- Health check: `curl localhost:4000/healthz`

Drop a file in the dropzone. States progress **Uploading → Ready → Secured** as
the durability worker commits to Filecoin and the first proof is recorded.

### Phase 0 shortcuts (explicitly not production)
- **Auth**: a single seeded dev user; requests must carry `X-Dev-User: <DEV_USER_ID>`. Phase 1 replaces this with email magic-link.
- **Downloads**: `/api/files/:id/download` 302s straight to MinIO. The real cold-tier restore pipeline is Phase 1.
- **Retries**: the durability worker does NOT retry on `StoreError`/`CommitError`; the file flips to `failed` and we log. Phase 1 adds a proper retry policy.
- **Aggregation**: small-file CAR bundling is Phase 2.

### Contract addresses (calibration)
| Contract         | Address                                    |
|------------------|--------------------------------------------|
| PDPVerifier      | `0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C` |
| FWSS (proxy)     | `0x02925630df557F957f70E112bA06e50965417CA0` |
| USDFC            | `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0` |
| ServiceProviderRegistry | resolved via Synapse SDK `calibration` chain object |

RPC: `https://api.calibration.node.glif.io/rpc/v1`. Chain id: `314159`.

See `SPIKE-NOTES.md` for what is real vs stubbed and known gotchas.
