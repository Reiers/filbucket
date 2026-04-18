# Authentication

## Dev auth (Phase 0 / 1)

The only live auth mechanism today. A single shared dev user id that all local development clients send:

```http
X-Dev-User: 9c391d6b-ec8c-42df-b910-9e553d82934e
```

The server checks `env.DEV_USER_ID` and returns 401 on mismatch.

### Query fallback

Browser anchors can't send custom headers, so endpoints that exist to be opened via `<a href>` (like download and share links) also accept `?u=<uuid>`:

```
GET /api/files/:id/download?u=9c391d6b-ec8c-42df-b910-9e553d82934e
```

{% hint style="danger" %}
Phase 0 / 1 dev auth is **not secure for anything beyond a local dev server**. Do not expose a FilBucket server with Phase 1 auth to the public internet. Phase 2 fixes this with real sessions.
{% endhint %}

## Real auth (Phase 2, in progress)

The plan:

- Email + magic link (Postmark or Resend).
- Short-lived signed cookies (HTTP-only, SameSite=Lax, 30 day rolling).
- Per-device session list with revoke.
- Shares become their own rotating capability tokens.

## Public endpoints (no auth)

Some endpoints are deliberately public:

- `GET /healthz`
- `GET /api/shares/by-token/:token` (metadata)
- `GET /api/shares/:token/download` (the actual download, validated by token)

These are rate-limited per-IP (60 req/min) and audited.
