import cors from '@fastify/cors'
import Fastify from 'fastify'
import { assertWalletReady, opsWalletAddress, synapse } from './chain/synapse.js'
import { closeDb } from './db/client.js'
import { assertCalibrationOnly, env } from './env.js'
import { closeRedis } from './queue/redis.js'
import { fileRoutes } from './routes/files.js'
import { shareRoutes } from './routes/shares.js'
import { uploadRoutes } from './routes/uploads.js'

async function main(): Promise<void> {
  assertCalibrationOnly()
  // Warm the Synapse client early so config errors surface before we bind a port.
  synapse()

  const app = Fastify({
    logger: {
      level: 'info',
      // Redact any headers that might accidentally carry secrets.
      redact: ['req.headers.authorization', 'req.headers["x-dev-user"]'],
    },
    bodyLimit: 10 * 1024 * 1024, // 10 MiB — we only carry metadata here; bytes go direct to MinIO.
  })

  await app.register(cors, { origin: true })

  app.get('/healthz', async () => ({
    ok: true,
    chain: env().FILBUCKET_CHAIN,
    walletAddress: opsWalletAddress(),
  }))

  await uploadRoutes(app)
  await fileRoutes(app)
  await shareRoutes(app)

  // Fire the wallet assertion in the background — we want the server up even if the wallet
  // isn't funded yet, so Nicklas can hit /healthz and figure out what's wrong.
  void (async () => {
    try {
      await assertWalletReady()
      app.log.info({ wallet: opsWalletAddress() }, 'ops wallet ready')
    } catch (err) {
      app.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'ops wallet NOT ready — uploads will fail in the durability worker',
      )
    }
  })()

  const port = env().SERVER_PORT
  await app.listen({ host: '0.0.0.0', port })
  app.log.info(`FilBucket server listening on :${port}`)

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
      await closeRedis()
      await closeDb()
    } finally {
      process.exit(0)
    }
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  // Never log the PK; env() throws on bad config with redacted messages.
  console.error('fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
