# What's a share link, really?

A share link is a signed, time-bounded URL that lets someone download a specific file from your library, without any account.

## Anatomy

```
https://filbucket.ai/s/SG4kv7vrRwhmXPyZZdLswE
                     │
                     └── 22-char URL-safe token
                         22 chars × log2(56 alphabet) ≈ 128 bits of entropy
                         Uniquely maps to one share row
```

The token is base62, with visually ambiguous characters (`0`, `O`, `1`, `I`, `l`) removed.

## What a share row carries

- Which file
- Created when
- Expires when (or never)
- Has a password? (argon2id hash)
- Max downloads? (hard cap)
- How many downloads used
- Revoked when (or null)

## Owner options at creation

| Option | Default | Notes |
|---|---|---|
| **Expiry** | 7 days | Presets: 1h, 24h, 7d, 30d, Never |
| **Password** | none | min 4 chars; stored as argon2id hash |
| **Max downloads** | unlimited | Useful for paid content |

## What recipients see

A minimal landing page with:

- The filename (clearly)
- The file size
- When it expires
- A password field if the share is protected
- A big Download button
- An inline preview if the file type allows (image / video / audio / PDF)

Recipients are never asked to log in, create an account, hold crypto, or "connect a wallet."

## Security

- **Rate limited**: 60 requests per minute per IP on the public share endpoint.
- **Expired / revoked / exhausted**: respond with clean HTTP 410s and distinct error codes.
- **Audit log**: every view, download attempt, password failure is recorded in `share_accesses` with IP + user agent. Useful for abuse response and compliance.
- **No caching of protected content**: password-protected shares set `Cache-Control: no-store` on the metadata response.
- **Download tokens** are presigned MinIO URLs with a short (5 min) expiry, minted per request.

## What share links can't do (yet)

- Require a specific email to access (Phase 2 — magic-link gated shares).
- Serve an audit summary to the owner via email ("your share got downloaded 3 times").
- Bulk share (share a whole folder as one link).

## Revocation

Any share can be revoked at any time from the owner's file detail panel. Revoked shares respond with `410 revoked` immediately; any existing presigned MinIO URLs in flight may complete (they're short-lived anyway).

## Programmatic creation

See [Shares API](../api/shares.md).
