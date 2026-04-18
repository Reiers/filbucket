import { assertWalletReady, synapse } from './chain/synapse.js'
import { closeDb } from './db/client.js'
import { assertCalibrationOnly } from './env.js'
import { closeRedis } from './queue/redis.js'
import { createDurabilityWorker, createWatchFirstProofWorker } from './workers/durability.js'

async function main(): Promise<void> {
  assertCalibrationOnly()
  synapse()

  // Wallet assertion runs in worker too — if the wallet isn't ready, uploads will definitely fail.
  try {
    await assertWalletReady()
    console.log('[worker] ops wallet OK')
  } catch (err) {
    console.error(
      '[worker] ops wallet NOT ready:',
      err instanceof Error ? err.message : err,
    )
    // Keep the worker up; jobs will fail loudly, which is the signal we want.
  }

  const w1 = createDurabilityWorker()
  const w2 = createWatchFirstProofWorker()

  w1.on('completed', (job) => console.log(`[durability] ${job.id} completed`))
  w1.on('failed', (job, err) =>
    console.error(`[durability] ${job?.id ?? '<?>'} failed:`, err.message),
  )
  w2.on('completed', (job) => console.log(`[watch-first-proof] ${job.id} completed`))
  w2.on('failed', (job, err) =>
    console.error(`[watch-first-proof] ${job?.id ?? '<?>'} failed:`, err.message),
  )

  console.log('[worker] durability + watch-first-proof workers running')

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] shutting down (${signal})`)
    await w1.close()
    await w2.close()
    await closeRedis()
    await closeDb()
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[worker] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
