# Delete a file

## From the UI

1. Hover over the file row in the library.
2. Click the small X that appears on the right.
3. Confirm.

The file is immediately removed from your library. MinIO object is deleted. Database row + pieces + events are cascade-deleted.

## What actually happens on-chain

Right now (Phase 1), we do a **soft delete** from FilBucket's perspective:

- Your file disappears from your library.
- The underlying storage deal on Filecoin is **not** immediately terminated.
- The dataset + rail continue paying the SP until the next settlement cycle.

In Phase 2, we'll add proper lifecycle cleanup: scheduled piece removal via FWSS → rail termination → rebate of any unclaimed lockup back to our ops wallet.

For now: delete is instant from your POV, but on-chain cleanup lags by up to 30 days. Your bytes are no longer reachable via FilBucket, but if someone knew the exact PieceCID and queried the SP directly, they could theoretically retrieve them until the SP does its garbage collection.

**If you need cryptographic deletion guarantees today**, the right answer is client-side encryption before upload, then throwing away the key. That's on the Phase 2 roadmap as "Private Vault."

## Failed uploads

Failed uploads can be dismissed with the same X button. This is a hard delete — nothing went on-chain, so there's nothing to clean up.

## API

```bash
curl -X DELETE http://localhost:4000/api/files/$FILE_ID \
  -H "X-Dev-User: $DEV_USER_ID"
# => 204
```

See [Files API](../api/files.md).

## Deleting all your files

Not exposed in the UI for safety. Do it via the API or by deleting the bucket (cascade). Phase 2 will have a proper "export + delete account" flow for GDPR compliance.
