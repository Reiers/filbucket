/**
 * One-shot ops wallet setup for Phase 0.
 *
 * Safe to re-run. Idempotent on approvals (approveService replaces the prior value).
 * Prints balances + post-setup state. Never logs the PK.
 *
 * Usage: pnpm --filter @filbucket/server setup-wallet
 */
import { formatUnits, parseUnits } from '@filoz/synapse-sdk'
import { assertWalletReady, opsWalletAddress, synapse } from '../chain/synapse.js'
import { env } from '../env.js'

// Phase 0 defaults — conservative, easy to raise later.
const PHASE0_DEPOSIT_USDFC = '10' // 10 USDFC into Filecoin Pay
const PHASE0_RATE_ALLOWANCE_USDFC_PER_EPOCH = '1' // 1 USDFC/epoch cap (very generous for tests)
const PHASE0_LOCKUP_ALLOWANCE_USDFC = '100' // 100 USDFC lockup headroom
const EPOCH_SECONDS = 30n
const DAYS_30_EPOCHS = (30n * 24n * 60n * 60n) / EPOCH_SECONDS // 86_400 epochs

function fmt(amount: bigint, decimals = 18): string {
  return formatUnits(amount, { decimals })
}

async function main(): Promise<void> {
  if (env().FILBUCKET_CHAIN !== 'calibration') {
    throw new Error('setup-ops-wallet refuses to run outside calibration. Check FILBUCKET_CHAIN.')
  }
  const s = synapse()
  const addr = opsWalletAddress()
  if (!addr) throw new Error('FILBUCKET_OPS_PK is not set.')

  console.log('─ ops wallet setup ─────────────────────────────')
  console.log(`address: ${addr}`)
  console.log(`chain:   ${s.chain.name} (id ${s.chain.id})`)

  // 1. Native + token wallet balances.
  const nativeBalance = await s.client.getBalance({ address: addr as `0x${string}` })
  console.log(`tFIL balance: ${fmt(nativeBalance)} (wallet)`)

  const tokenWalletBalance = await s.payments.walletBalance()
  console.log(`USDFC wallet balance:    ${fmt(tokenWalletBalance)}`)

  const filecoinPayBalance = await s.payments.balance()
  console.log(`USDFC in Filecoin Pay:   ${fmt(filecoinPayBalance)}`)

  // 2. Deposit if needed.
  const targetDeposit = parseUnits(PHASE0_DEPOSIT_USDFC, 18)
  if (filecoinPayBalance < targetDeposit) {
    const delta = targetDeposit - filecoinPayBalance
    if (tokenWalletBalance < delta) {
      console.warn(
        `! wallet USDFC (${fmt(tokenWalletBalance)}) < needed top-up (${fmt(delta)}). ` +
          'Grab more from https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc',
      )
    } else {
      console.log(`depositing ${fmt(delta)} USDFC into Filecoin Pay…`)
      // Try the one-shot permit+approve path first; fall back to plain deposit on failure.
      // We MUST wait for receipts — the synapse-sdk methods return as soon as
      // the tx is broadcast, but Filecoin Calibration takes ~30s to include
      // a tipset. Reading state before then sees pre-tx values and the post-
      // setup assertWalletReady() check fails spuriously.
      try {
        const hash = await s.payments.depositWithPermitAndApproveOperator({
          amount: delta,
          rateAllowance: parseUnits(PHASE0_RATE_ALLOWANCE_USDFC_PER_EPOCH, 18),
          lockupAllowance: parseUnits(PHASE0_LOCKUP_ALLOWANCE_USDFC, 18),
          maxLockupPeriod: DAYS_30_EPOCHS,
        })
        console.log(`  depositWithPermitAndApproveOperator tx: ${hash}`)
        console.log('  waiting for inclusion (~30-60s on calibration)…')
        await s.client.waitForTransactionReceipt({ hash, timeout: 180_000 })
        console.log('  confirmed.')
      } catch (err) {
        console.warn(
          `  permit-based deposit failed (${err instanceof Error ? err.message : String(err)}); falling back to plain deposit + approveService.`,
        )
        const depositHash = await s.payments.deposit({ amount: delta })
        console.log(`  deposit tx: ${depositHash}`)
        await s.client.waitForTransactionReceipt({ hash: depositHash, timeout: 180_000 })
        console.log('  deposit confirmed.')
      }
    }
  } else {
    console.log(`deposit target (${fmt(targetDeposit)}) already met.`)
  }

  // 3. Ensure FWSS operator approval.
  const current = await s.payments.serviceApproval()
  const currentRate = (current as unknown as { rateAllowance?: bigint }).rateAllowance ?? 0n
  const currentLockup = (current as unknown as { lockupAllowance?: bigint }).lockupAllowance ?? 0n
  const desiredRate = parseUnits(PHASE0_RATE_ALLOWANCE_USDFC_PER_EPOCH, 18)
  const desiredLockup = parseUnits(PHASE0_LOCKUP_ALLOWANCE_USDFC, 18)
  if (currentRate < desiredRate || currentLockup < desiredLockup) {
    console.log('refreshing FWSS operator approval…')
    const hash = await s.payments.approveService({
      rateAllowance: desiredRate,
      lockupAllowance: desiredLockup,
      maxLockupPeriod: DAYS_30_EPOCHS,
    })
    console.log(`  approveService tx: ${hash}`)
    console.log('  waiting for inclusion (~30-60s on calibration)…')
    await s.client.waitForTransactionReceipt({ hash, timeout: 180_000 })
    console.log('  confirmed.')
  } else {
    console.log(
      `FWSS approval already sufficient (rate=${fmt(currentRate)}, lockup=${fmt(currentLockup)}).`,
    )
  }

  // 4. Print final state.
  const finalPay = await s.payments.balance()
  const finalApproval = await s.payments.serviceApproval()
  console.log('─ post-setup state ─────────────────────────────')
  console.log(`USDFC in Filecoin Pay: ${fmt(finalPay)}`)
  console.log(`operator approval:     ${JSON.stringify(finalApproval, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  )}`)
  console.log('────────────────────────────────────────────────')

  // Final guard: the server/worker will refuse to accept uploads unless this passes.
  await assertWalletReady()
  console.log('OK — ops wallet is ready for uploads.')
}

main().catch((err) => {
  console.error('[setup-ops-wallet] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
