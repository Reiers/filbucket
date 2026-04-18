# Errors

FilBucket uses standard HTTP status codes. Error responses carry a stable `error` string + optional `hint` / `issues`.

## Shape

```json
{
  "error": "unauthorized",
  "hint": "Missing or bad X-Dev-User header"
}
```

or with zod validation issues:

```json
{
  "error": "invalid_body",
  "issues": [
    { "path": ["bucketId"], "message": "Invalid uuid", "code": "invalid_string" }
  ]
}
```

## Stable error codes

| HTTP | `error` | Meaning |
|---|---|---|
| 400 | `invalid_body` | Zod validation failed on a JSON body |
| 400 | `invalid_query` | Zod validation failed on a query string |
| 400 | `invalid_params` | Zod validation failed on path params |
| 400 | `FST_ERR_CTP_EMPTY_JSON_BODY` | You set `Content-Type: application/json` but sent no body; drop the header |
| 401 | `unauthorized` | Missing / bad dev auth |
| 401 | `password_required` | Public share requires password (or wrong password) |
| 404 | `not_found` | Catch-all |
| 404 | `file_not_found` | File id doesn't belong to this user |
| 404 | `bucket_not_found` | Bucket id doesn't belong to this user |
| 404 | `share_not_found` | Share id wrong |
| 409 | `no_hot_cache_key` | File row missing s3 key |
| 409 | `object_not_found_in_hot_cache` | You called complete without PUTing the bytes |
| 410 | `revoked` | Share was revoked |
| 410 | `expired` | Share past expiry |
| 410 | `exhausted` | Share hit max-downloads |
| 410 | `file_unavailable` | Underlying file is gone (e.g., owner deleted it) |
| 429 | `rate_limited` | Public share endpoint rate limit tripped |
| 500 | `dev_user_not_configured` | Server is mis-configured |
| 500 | `update_failed` / `insert_failed` | DB write didn't return the expected row; transient |

## Idempotency

All mutations are safe to retry. We don't yet use idempotency keys, but:

- `delete` returns 404 if the file is already gone (safe to retry)
- `complete` can be called again and will no-op if already completed
- `create share` always creates a new share row; duplicates are harmless

## When in doubt

- Check `/healthz` to confirm the server is up + wallet is configured
- Inspect server logs (pino JSON, level=info in dev)
- Reproduce with curl — strips away client weirdness

## Reporting

If you hit an error that isn't in this table, [open a GitHub issue](https://github.com/Reiers/filbucket/issues) with:

- HTTP status + `error` field
- Full response body
- The request you made (URL, method, body, headers minus auth)
- FilBucket version / commit sha

We triage quickly.
