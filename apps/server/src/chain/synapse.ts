import { calibration, Synapse } from '@filoz/synapse-sdk'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { assertCalibrationOnly, env } from '../env.js'

let synapseInstance: Synapse | null = null
let walletAddress: string | null = null

/**
 * Returns a memoized Synapse client wired to calibration.
 * Throws if FILBUCKET_OPS_PK is not set or FILBUCKET_CHAIN != "calibration".
 * Never logs the PK.
 */
export function synapse(): Synapse {
  assertCalibrationOnly()
  if (synapseInstance != null) return synapseInstance

  const pk = env().FILBUCKET_OPS_PK
  if (!pk) {
    throw new Error(
      'FILBUCKET_OPS_PK is not set. Generate a key, fund it on calibration, and export it.',
    )
  }
  const account = privateKeyToAccount(pk as `0x${string}`)
  walletAddress = account.address

  synapseInstance = Synapse.create({
    account,
    chain: calibration,
    transport: http(env().FILBUCKET_RPC_URL),
    source: 'filbucket-phase0',
  })
  return synapseInstance
}

export function opsWalletAddress(): string | null {
  if (walletAddress != null) return walletAddress
  const pk = env().FILBUCKET_OPS_PK
  if (!pk) return null
  walletAddress = privateKeyToAccount(pk as `0x${string}`).address
  return walletAddress
}

/**
 * Startup assertion. Run once at server + worker boot.
 * Verifies Synapse + wallet funding + FWSS operator approval before we accept uploads.
 */
export async function assertWalletReady(): Promise<void> {
  const s = synapse()
  const balance = await s.payments.walletBalance()
  if (balance <= 0n) {
    throw new Error(
      `Ops wallet ${opsWalletAddress()} has zero native balance on calibration. Fund it with tFIL from https://faucet.calibnet.chainsafe-fil.io/funds.html`,
    )
  }
  const approval = await s.payments.serviceApproval()
  // serviceApproval returns an object with rateAllowance / lockupAllowance — both must be > 0 for uploads.
  const rateAllowance = (approval as unknown as { rateAllowance?: bigint }).rateAllowance ?? 0n
  const lockupAllowance = (approval as unknown as { lockupAllowance?: bigint }).lockupAllowance ?? 0n
  if (rateAllowance === 0n || lockupAllowance === 0n) {
    throw new Error(
      `FWSS operator is not approved for ops wallet ${opsWalletAddress()}. ` +
        'Run: pnpm --filter @filbucket/server setup-wallet',
    )
  }
}
