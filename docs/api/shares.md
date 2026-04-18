# Shares

Create, list, and revoke share links.

## Create

```http
POST /api/files/:id/shares
X-Dev-User: <uuid>
Content-Type: application/json

{
  "password": "hunter2",          // optional, min 4 chars
  "expiresInSeconds": 604800,     // optional, positive int
  "maxDownloads": 10              // optional, positive int
}
```

All three fields are optional. Empty body creates a default share (7-day default expiry is applied client-side by the UI, not server-side — omitting `expiresInSeconds` means "never expires").

**Response**:

```json
{
  "id": "<uuid>",
  "token": "SG4kv7vrRwhmXPyZZdLswE",
  "url": "/s/SG4kv7vrRwhmXPyZZdLswE",
  "hasPassword": true,
  "expiresAt": "2026-04-25T19:50:27.780Z",
  "maxDownloads": 10,
  "createdAt": "2026-04-18T19:50:27.781Z"
}
```

## List

```http
GET /api/files/:id/shares
X-Dev-User: <uuid>
```

Returns all shares for a file, newest first. Each includes current `downloadCount` + `revokedAt`.

## Revoke

```http
DELETE /api/shares/:id
X-Dev-User: <uuid>
```

Marks `revoked_at = now()`. Idempotent. Returns 204.

## Public: fetch metadata

```http
GET /api/shares/by-token/:token
```

No auth. Used by the public `/s/<token>` page.

**Response**:

```json
{
  "status": "active",        // "active" | "expired" | "revoked" | "exhausted"
  "hasPassword": true,
  "file": { "name": "...", "sizeBytes": 1234, "mimeType": "image/png" },
  "expiresAt": "...",
  "maxDownloads": 10,
  "downloadCount": 2
}
```

Rate-limited: 60 req/min/IP.

## Public: download

```http
GET /api/shares/:token/download?p=<password-if-any>
```

Validates:

1. Token exists
2. Not revoked (else 410 `revoked`)
3. Not expired (else 410 `expired`)
4. Not exhausted (else 410 `exhausted`)
5. Password correct (else 401 `password_required`)

If all checks pass: increments `download_count`, records audit event, returns **302** to a short-lived presigned MinIO GET URL.

Rate-limited: 60 req/min/IP.

## Audit log

Every interaction with a share (view, download, password_fail, expired, revoked) is recorded in the `share_accesses` table with IP + user agent + timestamp. Not yet exposed via API in Phase 1.

## Token format

- 22 characters
- Base62 minus confusable glyphs (`0`, `O`, `1`, `I`, `l`)
- ~128 bits of entropy
- URL-safe, case-sensitive
- Unique-indexed in Postgres

## Headers you should set on the recipient side

If you're building a custom client for the public share endpoints:

- `User-Agent`: so abuse events have context
- No cookies needed
- CORS is permissive (`origin: true`) for Phase 1 — tighten for prod
