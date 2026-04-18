---
description: REST API for programmatic access to FilBucket.
---

# API reference

FilBucket exposes a REST API for uploads, file management, and share links. This is the same API the web UI and macOS app use.

## Base URL

- **Dev (local)**: `http://localhost:4000`
- **Staging / production**: configured per deployment

## Conventions

- All request and response bodies are JSON unless otherwise noted.
- Timestamps are ISO-8601 UTC.
- IDs are UUID v4.
- Sizes are bytes (integer).
- Rates, lockups, prices are strings when >2^53 (bigint) and numbers otherwise.

## Authentication

Phase 0 / 1 uses a dev-only header:

```http
X-Dev-User: <uuid>
```

For link-based flows (download anchors), `?u=<uuid>` is also accepted as a query param fallback.

Phase 2 replaces both with session cookies + magic links. See [auth](auth.md).

## Sections

- [Auth](auth.md) — headers, query fallback, session model
- [Files](files.md) — list, detail, delete, download
- [Uploads](uploads.md) — init, complete, progress
- [Shares](shares.md) — create, list, revoke, public download
- [Errors](errors.md) — status codes, error shape, common causes

## Healthcheck

```http
GET /healthz
```

```json
{
  "ok": true,
  "chain": "calibration",
  "walletAddress": "0x4FEfA09B3f0FF6b1BA062dbE7938a16EdF9D3CFE"
}
```

Used for ops monitoring. No auth required.
