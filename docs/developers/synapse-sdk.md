# The Synapse SDK path

How FilBucket talks to Filecoin Onchain Cloud.

## Stack

- [`@filoz/synapse-sdk`](https://github.com/FilOzone/synapse-sdk) (high-level)
- [`@filoz/synapse-core`](https://github.com/FilOzone/synapse-sdk) (low-level, imported directly only for `WarmStorageService`)
- [`viem`](https://viem.sh) for chain IO

Everything else is through the SDK.

## Client construction

```ts
import { calibration, Synapse } from '@filoz/synapse-sdk'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount(env.FILBUCKET_OPS_PK)

const synapse = Synapse.create({
  account,
  chain: calibration,                 // or `mainnet`
  transport: http(env.FILBUCKET_RPC_URL),
  source: 'filbucket-phase0',         // operator-attribution tag
})
```

## Upload

```ts
const result = await synapse.storage.upload(readableStream, {
  metadata: { Application: 'FilBucket' },
  callbacks: {
    onProgress(bytesUploaded) { /* emit chunk_bytes event */ }
  },
})
```

`result` shape:

```ts
{
  pieceCid: '...',
  size: 209715200,
  requestedCopies: 2,
  complete: true,
  copies: [
    { providerId: 4n, dataSetId: 13177n, pieceId: 0n, role: 'primary',   retrievalUrl: '...', isNewDataSet: true },
    { providerId: 2n, dataSetId: 13176n, pieceId: 0n, role: 'secondary', retrievalUrl: '...', isNewDataSet: true },
  ],
  failedAttempts: [],
}
```

Errors: `StoreError` (primary upload fully failed), `CommitError` (bytes stored on SP but all on-chain commits failed). Phase 0 marks the file failed on either.

## Reading proving state

`WarmStorageService.provenThisPeriod(dataSetId)` **reverts** on freshly-created datasets on calibration (exit 33, no meaningful revert reason). We bypass with a direct PDPVerifier read via viem:

```ts
const PDP_VERIFIER_CALIBRATION = '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C'
const PDP_VERIFIER_ABI = [{
  name: 'getNextChallengeEpoch',
  type: 'function', stateMutability: 'view',
  inputs: [{ name: 'id', type: 'uint256' }],
  outputs: [{ type: 'uint256' }],
}]

const epoch = await viemClient.readContract({
  address: PDP_VERIFIER_CALIBRATION,
  abi: PDP_VERIFIER_ABI,
  functionName: 'getNextChallengeEpoch',
  args: [dataSetId],
})
```

Snapshot at commit time, poll until it advances, flip file state to Secured.

## Rails + payments

```ts
// Balance
const bal = await synapse.payments.walletBalance()

// Deposit USDFC into Filecoin Pay (EIP-2612 permit one-shot)
await synapse.payments.depositWithPermitAndApproveOperator({ amount: parseUnits('10', 18) })

// Operator approval check
const approval = await synapse.payments.serviceApproval()
// { isApproved: true, rateAllowance, lockupAllowance, rateUsage, lockupUsage, maxLockupPeriod }
```

See `apps/server/src/scripts/setup-ops-wallet.ts` for the one-shot bootstrap.

## Dataset lookup

```ts
import { WarmStorageService } from '@filoz/synapse-sdk/warm-storage'

const ws = new WarmStorageService({ client: synapse.client })
const info = await ws.getDataSet({ dataSetId: 13177n })
// { providerId, pdpRailId, payer, payee, ... }
```

Used to upsert `dataset_rails` rows so we have a local index of active payment rails.

## Key addresses (calibration)

| Contract | Proxy address |
|---|---|
| PDPVerifier | `0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C` |
| FWSS | `0x02925630df557F957f70E112bA06e50965417CA0` |
| ServiceProviderRegistry | `0x839e5c9988e4e9977d40708d0094103c0839Ac9D` |
| USDFC | `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0` |

See `apps/server/src/chain/synapse.ts` for how we bind these.

## Gotchas we hit

- **Synapse SDK 0.40.x** is viem-first. Ignore older docs that show `{ signer }` or `{ privateKey }`.
- `synapse.warmStorage` is private on the `Synapse` class. Import `WarmStorageService` from `@filoz/synapse-sdk/warm-storage` and construct it directly.
- Upload `metadata` is dataset-level, `pieceMetadata` is per-piece.
- `UploadOptions.onProgress` lives under `callbacks: { onProgress }`, not at the top level.
- `dataSetId` args must be `bigint`.

## Future

- Aggregation of small files via a CAR builder on the client (Phase 2).
- Session keys so we don't hot-sign every upload with the root account.
- FilBeam CDN integration for cold retrieval.
