/**
 * Mint USDFC by collateralizing tFIL into a Trove on Filecoin Calibration.
 *
 * Why this exists: the chainsafe USDFC drip faucet was deprecated, and the
 * official path requires opening a Liquity-style Trove via stg.usdfc.net
 * with a browser wallet. We have the ops PK and direct chain access, so we
 * can do it ourselves.
 *
 * Usage:
 *   pnpm --filter @filbucket/server mint-usdfc                 (default 220 USDFC)
 *   pnpm --filter @filbucket/server mint-usdfc -- --debt 500   (custom amount)
 *   pnpm --filter @filbucket/server mint-usdfc -- --icr 200    (custom ICR%)
 *
 * Constraints (live from contract):
 *   MIN_NET_DEBT      = 200 USDFC
 *   GAS_COMPENSATION  =  20 USDFC (locked, returned on close)
 *   MCR               = 110%      (we default to 200% for safety)
 *   borrowingFee      ≈ 0.55%
 *
 * Requires the wallet to NOT already have an open Trove. Re-running on a
 * wallet with an active Trove will revert (use addColl/withdrawDebt instead).
 */

import 'dotenv/config'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration } from 'viem/chains'

// ── Calibration deployment addresses (Secured-Finance/stablecoin-contracts) ──
const BORROWER_OPERATIONS = '0x9a01e0A43861627fA9805C4321131B89c1ba1D74' as Address
const TROVE_MANAGER       = '0x5719459B37bB156BFa54dfE997D0286062DCcC36' as Address
const SORTED_TROVES       = '0xB7ee07b4a2A6F02941C6682DF2754389cfDdde03' as Address
const PRICE_FEED          = '0xde054E1F2c94C11FEd5106F8f588fde9C3B30B87' as Address
const HINT_HELPERS        = '0x3BC3b89e7AAdCE9DB892bCC4cB60c2c347Fdcb0A' as Address
const USDFC_TOKEN         = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0' as Address

const RPC = 'https://api.calibration.node.glif.io/rpc/v1'

// ── Minimal ABIs ─────────────────────────────────────────────────────────────
const borrowerOpsAbi = [
  {
    name: 'openTrove',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_maxFee', type: 'uint256' },
      { name: '_debtTokenAmount', type: 'uint256' },
      { name: '_upperHint', type: 'address' },
      { name: '_lowerHint', type: 'address' },
    ],
    outputs: [],
  },
] as const

const troveManagerAbi = [
  {
    name: 'getBorrowingFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getTroveStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_borrower', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'MIN_NET_DEBT',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'GAS_COMPENSATION',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

const sortedTrovesAbi = [
  {
    name: 'getSize',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getFirst',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const

const priceFeedAbi = [
  {
    name: 'lastGoodPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

const hintHelpersAbi = [
  {
    name: 'getApproxHint',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_CR', type: 'uint256' },
      { name: '_numTrials', type: 'uint256' },
      { name: '_inputRandomSeed', type: 'uint256' },
    ],
    outputs: [
      { name: 'hintAddress', type: 'address' },
      { name: 'diff', type: 'uint256' },
      { name: 'latestRandomSeed', type: 'uint256' },
    ],
  },
] as const

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ── Args ─────────────────────────────────────────────────────────────────────
function parseArgs(): { debtUSDFC: number; icrPct: number } {
  const args = process.argv.slice(2)
  let debt = 220
  let icr = 200
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--debt' && args[i + 1]) {
      debt = Number(args[++i])
    } else if (args[i] === '--icr' && args[i + 1]) {
      icr = Number(args[++i])
    }
  }
  if (!Number.isFinite(debt) || debt < 200) {
    throw new Error('--debt must be ≥ 200 USDFC (protocol minimum)')
  }
  if (!Number.isFinite(icr) || icr < 120) {
    throw new Error('--icr must be ≥ 120 (we recommend 180+)')
  }
  return { debtUSDFC: debt, icrPct: icr }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const pk = process.env.FILBUCKET_OPS_PK
  if (!pk) throw new Error('FILBUCKET_OPS_PK not set in .env')
  const account = privateKeyToAccount(pk as `0x${string}`)

  const { debtUSDFC, icrPct } = parseArgs()

  console.log('─ mint-usdfc ──────────────────────────────────')
  console.log('wallet:    ', account.address)
  console.log('debt:      ', debtUSDFC, 'USDFC')
  console.log('target ICR:', icrPct + '%')

  const pub = createPublicClient({
    chain: filecoinCalibration,
    transport: http(RPC),
  })
  const wallet = createWalletClient({
    chain: filecoinCalibration,
    transport: http(RPC),
    account,
  })

  // 1. Confirm no Trove already open (status: 0=nonExistent, 1=active, 2=closedByOwner, 3=closedByLiquidation, 4=closedByRedemption).
  const status = (await pub.readContract({
    address: TROVE_MANAGER,
    abi: troveManagerAbi,
    functionName: 'getTroveStatus',
    args: [account.address],
  })) as bigint
  if (status === 1n) {
    console.error('Wallet already has an active Trove. Use the Trove app to manage it.')
    process.exit(1)
  }

  // 2. Read live constants + price.
  const [minNetDebt, gasComp, price] = await Promise.all([
    pub.readContract({ address: TROVE_MANAGER, abi: troveManagerAbi, functionName: 'MIN_NET_DEBT' }) as Promise<bigint>,
    pub.readContract({ address: TROVE_MANAGER, abi: troveManagerAbi, functionName: 'GAS_COMPENSATION' }) as Promise<bigint>,
    pub.readContract({ address: PRICE_FEED, abi: priceFeedAbi, functionName: 'lastGoodPrice' }) as Promise<bigint>,
  ])
  console.log('MIN_NET_DEBT:    ', formatUnits(minNetDebt, 18))
  console.log('GAS_COMPENSATION:', formatUnits(gasComp, 18))
  console.log('Price (FIL/USD): ', formatUnits(price, 18))

  // 3. Compute amounts.
  // _debtTokenAmount in openTrove() = the amount of NEW debt token you want minted to you.
  // The protocol then adds GAS_COMPENSATION + borrowingFee internally.
  // We want the user-visible mint to be `debtUSDFC`, so request that as the param.
  const requestedMint = parseUnits(String(debtUSDFC), 18)
  if (requestedMint < minNetDebt) {
    console.error(`Requested debt ${debtUSDFC} < MIN_NET_DEBT ${formatUnits(minNetDebt, 18)}`)
    process.exit(1)
  }

  // 4. Compute the required collateral.
  // Total debt the trove will carry = requestedMint + borrowingFee + gasComp.
  const borrowingFee = (await pub.readContract({
    address: TROVE_MANAGER,
    abi: troveManagerAbi,
    functionName: 'getBorrowingFee',
    args: [requestedMint],
  })) as bigint
  const totalDebt = requestedMint + borrowingFee + gasComp
  console.log('Borrowing fee:   ', formatUnits(borrowingFee, 18), 'USDFC')
  console.log('Total debt:      ', formatUnits(totalDebt, 18), 'USDFC')

  // ICR = collateral_value_in_USD / total_debt_in_USDFC ≥ icrPct/100
  // collateral_FIL = totalDebt * (icrPct/100) / price
  // Use bigint math: we add a 1% buffer to absorb price tick / fee rounding.
  const icrBps = BigInt(icrPct * 100) // basis points
  // collateral (in 18-dec FIL units) = totalDebt * icrBps / 10000 * 1e18 / price
  // since both totalDebt and price are 18-dec, the ratio is dimensionless.
  const collateral = (totalDebt * icrBps * 10n ** 18n) / (10000n * price)
  const collateralWithBuffer = (collateral * 101n) / 100n
  console.log('Collateral:      ', formatEther(collateralWithBuffer), 'tFIL')

  // 5. Check we have enough tFIL.
  const balance = await pub.getBalance({ address: account.address })
  console.log('Wallet balance:  ', formatEther(balance), 'tFIL')
  // Reserve a couple FIL for gas (Filecoin tx gas is non-trivial).
  const gasReserve = parseEther('5')
  if (balance < collateralWithBuffer + gasReserve) {
    console.error(
      `Need at least ${formatEther(collateralWithBuffer + gasReserve)} tFIL ` +
        `(${formatEther(collateralWithBuffer)} collateral + ${formatEther(gasReserve)} gas reserve). Top up the wallet first.`,
    )
    process.exit(1)
  }

  // 6. Compute hints. For a single-position list (or any list), the SDK
  //    pattern is: getApproxHint(NICR, ~15*sqrt(numTroves) trials, randomSeed)
  //    then walk via SortedTroves.findInsertPosition for the precise pair.
  //    For our scale (typically one big trove on calibration), passing the
  //    head of the list is good enough — Liquity-style protocols accept
  //    any starting hint and walk to the right place.
  const numTroves = (await pub.readContract({
    address: SORTED_TROVES,
    abi: sortedTrovesAbi,
    functionName: 'getSize',
  })) as bigint
  console.log('Existing Troves: ', numTroves.toString())
  let upperHint: Address = '0x0000000000000000000000000000000000000000'
  let lowerHint: Address = '0x0000000000000000000000000000000000000000'
  if (numTroves > 0n) {
    // Use approxHint if there's anyone in the list.
    // NICR (Nominal ICR) = collateral * 1e20 / debt (in token units)
    const NICR = (collateralWithBuffer * 10n ** 20n) / totalDebt
    const trials = 15n * BigInt(Math.ceil(Math.sqrt(Number(numTroves))))
    const seed = BigInt(Date.now())
    const [hint] = (await pub.readContract({
      address: HINT_HELPERS,
      abi: hintHelpersAbi,
      functionName: 'getApproxHint',
      args: [NICR, trials, seed],
    })) as [Address, bigint, bigint]
    upperHint = hint
    lowerHint = hint
    console.log('Using hint:      ', hint)
  } else {
    console.log('Empty Trove list — using zero hints.')
  }

  // 7. maxFee: the user's maximum acceptable borrowing fee. Set generously to
  //    avoid reverts if the rate ticks up between estimate and inclusion.
  //    1% (1e16 / 1e18) is the safe ceiling — the actual fee will be ~0.55%.
  const maxFee = parseUnits('0.01', 18)

  // 8. Send the openTrove transaction.
  console.log('\nSubmitting openTrove tx…')
  const hash = await wallet.writeContract({
    address: BORROWER_OPERATIONS,
    abi: borrowerOpsAbi,
    functionName: 'openTrove',
    args: [maxFee, requestedMint, upperHint, lowerHint],
    value: collateralWithBuffer,
    chain: filecoinCalibration,
  })
  console.log('tx:', hash)
  console.log('Waiting for confirmation (calibration ~30s/block)…')

  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 })
  if (receipt.status !== 'success') {
    console.error('Trove open reverted. status:', receipt.status)
    process.exit(1)
  }
  console.log('Mined in block', receipt.blockNumber, 'gasUsed', receipt.gasUsed)

  // 9. Confirm by reading the new USDFC balance.
  const usdfcBalance = (await pub.readContract({
    address: USDFC_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint
  console.log('\n✓ USDFC minted. Balance:', formatUnits(usdfcBalance, 18), 'USDFC')
}

main().catch((err) => {
  console.error('mint-usdfc failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
