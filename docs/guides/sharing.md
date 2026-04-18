# Share a file

## From the UI

1. Click the file in your library.
2. Click **Share** in the detail panel.
3. In the modal, set:
   - **Expires**: 1h, 24h, 7d, 30d, or Never.
   - **Password** (optional, min 4 chars).
   - **Max downloads** (optional).
4. Click **Create share link**.
5. The link is auto-copied to your clipboard.

That's it. The recipient opens the link, optionally enters the password, and downloads the file.

## What the recipient sees

A clean landing page with:

- The filename
- File size
- Expiry countdown
- A password field if needed
- A big **Download** button
- An inline preview if the file type supports it (image, video, audio, PDF)

No login, no wallet, no Web3 jargon. If they don't know what Filecoin is, they never have to learn.

## Managing shares

Existing share links appear below the create form in the modal:

- **Copy** — copy the URL again.
- **Revoke** — kill the link immediately. Any download-in-progress may complete (short-lived signed URLs); no new downloads possible.
- **Status** — `active`, `expired`, `revoked`, `exhausted`, `password protected`.
- **Download count** — how many times the link has been used.

## Security model

- **Tokens** are 22-char base62, ~128 bits of entropy. Unguessable.
- **Passwords** hashed with argon2id.
- **Rate-limited** to 60 req/min/IP on the public endpoint.
- **All access logged** to `share_accesses` with IP, user agent, kind (view / download / password_fail / expired / revoked).

## CLI / API

See [Shares API](../api/shares.md) for programmatic creation, listing, and revocation.

Quick example:

```bash
# Create a 7-day share with a password
curl -X POST http://localhost:4000/api/files/$FILE_ID/shares \
  -H "X-Dev-User: $DEV_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"expiresInSeconds": 604800, "password": "hunter2"}'

# => { "token": "...", "url": "/s/...", ... }
```

## What share links are NOT

- Cryptographic capabilities. They live in a central database; we can revoke them.
- Free forever. The underlying file must still be stored (paid) and in a retrievable state.
- Anonymous. We log access metadata (IP + UA) for abuse response.
