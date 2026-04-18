# Environment variables

Complete list. See `.env.example` in the repo for the canonical template.

## Postgres

| Variable | Example | Required |
|---|---|---|
| `DATABASE_URL` | `postgres://filbucket:***@localhost:5432/filbucket` | ✅ |

## Redis

| Variable | Example | Required |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | ✅ |

## Hot cache (S3 / MinIO)

| Variable | Example | Required |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` (MinIO) or blank for AWS | ✅ |
| `S3_REGION` | `us-east-1` | ✅ |
| `S3_ACCESS_KEY` | `filbucket` | ✅ |
| `S3_SECRET_KEY` | `change-me` | ✅ |
| `S3_BUCKET` | `filbucket-hot` | ✅ |
| `S3_FORCE_PATH_STYLE` | `true` (MinIO), `false` (AWS) | ✅ |

## Filecoin chain

| Variable | Example | Required |
|---|---|---|
| `FILBUCKET_OPS_PK` | `0x...` (32 bytes hex, 0x-prefixed) | ✅ |
| `FILBUCKET_CHAIN` | `calibration` or `mainnet` | ✅ |
| `FILBUCKET_RPC_URL` | `https://api.calibration.node.glif.io/rpc/v1` | ✅ |
| `FILBUCKET_OPS_ADDRESS` | `0x4FEfA09B...` | informational (derived at boot) |

{% hint style="danger" %}
The ops PK is the single most sensitive secret in a FilBucket deployment. It controls your USDFC and can authorize uploads. Store it in a proper secret manager, not in plain .env, for anything that isn't a local dev box.
{% endhint %}

## Server

| Variable | Example | Required |
|---|---|---|
| `SERVER_PORT` | `4000` | default 4000 |
| `WEB_PORT` | `3010` | default 3000; set 3010 if Grafana is on 3000 |

## Dev auth (Phase 0 / 1)

| Variable | Example | Required |
|---|---|---|
| `DEV_USER_ID` | `<uuid from db:seed>` | ✅ |
| `NEXT_PUBLIC_DEV_USER_ID` | same as above | ✅ (web) |
| `NEXT_PUBLIC_DEFAULT_BUCKET_ID` | `<uuid from db:seed>` | ✅ (web) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | ✅ (web) |

## Dev conveniences

| Variable | Example | Default |
|---|---|---|
| `LOG_LEVEL` | `debug` | `info` |
| `PORT_DEBUG` | `true` | off |

## systemd example

`/etc/systemd/system/filbucket-api.service`:

```ini
[Unit]
Description=FilBucket API
After=network.target postgresql.service redis-server.service

[Service]
User=filbucket
WorkingDirectory=/opt/filbucket
EnvironmentFile=/opt/filbucket/.env
ExecStart=/usr/bin/env pnpm --filter @filbucket/server start
Restart=on-failure
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Secrets rotation

- **Ops PK**: rotate by generating a new key, funding it, running `setup-wallet` to re-deposit, then updating `.env` and restarting. Old key's USDFC can be withdrawn with the payments API.
- **S3 keys**: rotate via MinIO / AWS IAM; restart.
- **Postgres password**: pg_dump + restore + update DATABASE_URL.
- **Dev user id**: re-run `db:seed`, update `.env`.
