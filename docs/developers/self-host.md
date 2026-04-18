# Self-host guide

{% hint style="warning" %}
FilBucket is in Phase 1. Self-hosting works but hasn't been production-hardened. If you're running this for more than yourself, be prepared to read code.
{% endhint %}

## Minimum footprint

- 1× small VM (2 vCPU, 4 GB RAM is plenty for a single user)
- Postgres 16 (managed or local)
- Redis 7 (managed or local)
- S3-compat blob store for hot cache (MinIO self-hosted, or AWS S3)
- A Filecoin calibration or mainnet wallet funded with FIL + USDFC

## Recommended architecture

```
  ┌──────────────────────┐
  │   Caddy / Nginx      │  TLS + reverse proxy
  └────────┬─────────────┘
           │
           ├── :80 / :443 → web (Next.js)
           └── :80 / :443 → api (/api/* → Fastify)
              
  ┌──────────────────────┐
  │  FilBucket server    │  Fastify + durability worker (same process)
  └────────┬─────────────┘
           │
           ├─► Postgres
           ├─► Redis
           └─► S3 / MinIO (hot cache)
  ┌──────────────────────┐
  │  Filecoin Pay        │  USDFC
  │  + FWSS + PDPVerifier│
  └──────────────────────┘
```

## Deploy recipe (Hetzner / Ubuntu 24.04)

```bash
# 1. System deps
apt install -y postgresql-16 redis-server nginx
# MinIO (alternative: use AWS S3)
wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
chmod +x /usr/local/bin/minio

# 2. Node 22 via nvm or fnm
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 22 && fnm use 22
npm i -g pnpm@10

# 3. Clone and build
git clone https://github.com/Reiers/filbucket.git /opt/filbucket
cd /opt/filbucket
pnpm install
pnpm -r build

# 4. Postgres
sudo -u postgres createuser filbucket -P
sudo -u postgres createdb filbucket -O filbucket
pnpm --filter @filbucket/server db:push --force

# 5. MinIO
mkdir -p /var/lib/minio
MINIO_ROOT_USER=filbucket MINIO_ROOT_PASSWORD=change-me \
  minio server /var/lib/minio --address :9000 &

# 6. .env at /opt/filbucket/.env (see env-vars.md)

# 7. Ops wallet setup
pnpm --filter @filbucket/server setup-wallet

# 8. Systemd units
systemctl enable filbucket-api.service
systemctl enable filbucket-web.service
systemctl start filbucket-api filbucket-web

# 9. Caddy / nginx TLS front
```

Example systemd: see [env-vars](env-vars.md).

## Production checklist

- [ ] TLS in front of both web + api
- [ ] CORS restricted to your web origin
- [ ] Dev auth disabled (flip `DEV_AUTH_ENABLED=false`; Phase 2 requirement)
- [ ] Postgres daily backups (PITR-capable)
- [ ] MinIO replicated or S3 with versioning
- [ ] Ops wallet monitoring: FIL balance + USDFC balance + FilecoinPay deposit
- [ ] Alerting on durability worker errors, on PDP proof misses, on share rate-limit trips
- [ ] A sane quota per user (Phase 2 ships this; Phase 1 is trust-based)

## Operations tasks

- **Top up ops wallet**: monthly. Keep at least 60 days of USDFC runway above the FWSS lockup.
- **Prune share_accesses**: growing log; archive / truncate older than 90 days.
- **Rotate DB backups**: standard Postgres PITR discipline.
- **Upgrade Synapse SDK**: watch [FilOzone/synapse-sdk](https://github.com/FilOzone/synapse-sdk) for releases; we'll tag compatible versions in our release notes.

## Don't

- Don't expose MinIO directly to the internet.
- Don't share your `FILBUCKET_OPS_PK` anywhere.
- Don't run on mainnet without first running on calibration for at least a week.
