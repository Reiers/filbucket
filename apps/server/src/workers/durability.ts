import { CommitError, StoreError } from '@filoz/synapse-sdk'
import { WarmStorageService } from '@filoz/synapse-sdk/warm-storage'
import { type Job, Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { synapse } from '../chain/synapse.js'
import { db } from '../db/client.js'
import { commitEvents, datasetRails, filePieces, files } from '../db/schema.js'
import {
  DURABILITY_QUEUE,
  type DurabilityJobData,
  type WatchFirstProofJobData,
  WATCH_FIRST_PROOF_QUEUE,
  watchFirstProofQ,
} from '../queue/queues.js'
import { redis } from '../queue/redis.js'
import { getObjectStream } from '../storage/s3.js'

/**
 * Collect a readable stream into a single Uint8Array.
 * We stream from MinIO to stay OOM-safe up to the file size; the final buffer
 * still fits in memory because Phase 0 caps uploads well under 200 MiB.
 * Phase 1 will switch to Synapse SDK's streaming upload when we chunk >200 MiB.
 */
async function collectBytes(source: AsyncIterable<Buffer | Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of source) {
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
    chunks.push(u8)
    total += u8.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function markFailed(fileId: string, reason: string, detail: unknown): Promise<void> {
  await db()
    .update(files)
    .set({ state: 'failed', updatedAt: new Date() })
    .where(eq(files.id, fileId))
  await db().insert(commitEvents).values({
    fileId,
    kind: 'fault',
    payload: { reason, detail: String(detail) },
  })
}

export function createDurabilityWorker(): Worker<DurabilityJobData> {
  return new Worker<DurabilityJobData>(
    DURABILITY_QUEUE,
    async (job: Job<DurabilityJobData>) => {
      const { fileId } = job.data
      const [file] = await db().select().from(files).where(eq(files.id, fileId)).limit(1)
      if (!file) {
        throw new Error(`durability: file not found: ${fileId}`)
      }
      if (file.hotCacheKey == null) {
        throw new Error(`durability: file has no hot_cache_key: ${fileId}`)
      }

      // 1. Stream from MinIO, collect into a buffer.
      const { stream } = await getObjectStream(file.hotCacheKey)
      const bytes = await collectBytes(stream as AsyncIterable<Buffer>)

      const s = synapse()

      // 2. Upload via Synapse (auto SP selection + multi-copy + pull + commit).
      try {
        const result = await s.storage.upload(bytes, {
          metadata: { Application: 'FilBucket' },
        })

        // Record store_ok event.
        await db().insert(commitEvents).values({
          fileId,
          kind: 'store_ok',
          payload: {
            pieceCid: String(result.pieceCid),
            size: result.size,
            requestedCopies: result.requestedCopies,
            complete: result.complete,
            copies: result.copies.map((c) => ({
              providerId: c.providerId.toString(),
              dataSetId: c.dataSetId.toString(),
              pieceId: c.pieceId.toString(),
              role: c.role,
              isNewDataSet: c.isNewDataSet,
            })),
            failedAttempts: result.failedAttempts.map((f) => ({
              providerId: f.providerId.toString(),
              role: f.role,
              error: f.error,
              explicit: f.explicit,
            })),
          },
        })

        // 3. Insert file_pieces rows (one per copy).
        const pieceCidStr = String(result.pieceCid)
        if (result.copies.length > 0) {
          await db()
            .insert(filePieces)
            .values(
              result.copies.map((c) => ({
                fileId,
                pieceCid: pieceCidStr,
                byteStart: 0,
                byteEnd: Math.max(0, Number(result.size) - 1),
                spProviderId: c.providerId.toString(),
                datasetId: c.dataSetId.toString(),
              })),
            )
        }

        // 4. Upsert dataset_rails per unique dataset.
        // We don't have the pdpRailId handed to us by upload(); look it up via warmStorage.getDataSet.
        const seen = new Set<string>()
        for (const c of result.copies) {
          const key = c.dataSetId.toString()
          if (seen.has(key)) continue
          seen.add(key)
          try {
            const ws = new WarmStorageService({ client: s.client })
            const info = await ws.getDataSet({ dataSetId: c.dataSetId })
            if (info != null) {
              await db()
                .insert(datasetRails)
                .values({
                  datasetId: key,
                  providerId: info.providerId.toString(),
                  railId: info.pdpRailId.toString(),
                  payer: info.payer,
                  payee: info.payee,
                  active: true,
                })
                .onConflictDoUpdate({
                  target: datasetRails.datasetId,
                  set: {
                    providerId: info.providerId.toString(),
                    railId: info.pdpRailId.toString(),
                    payer: info.payer,
                    payee: info.payee,
                    active: true,
                  },
                })
            }
          } catch (err) {
            // Non-fatal: rails row is a convenience index, not the source of truth.
            await db()
              .insert(commitEvents)
              .values({
                fileId,
                kind: 'fault',
                payload: { reason: 'rail_lookup_failed', dataSetId: key, detail: String(err) },
              })
          }
        }

        await db().insert(commitEvents).values({
          fileId,
          kind: 'commit_ok',
          payload: { pieceCid: pieceCidStr },
        })

        // Note: we intentionally DO NOT change file.state here. It stays hot_ready until first proof.

        // 5. Schedule the first-proof watcher (delayed 60s).
        const dataSetIds = [...new Set(result.copies.map((c) => c.dataSetId.toString()))]
        if (dataSetIds.length > 0) {
          await watchFirstProofQ().add(
            'watch-first-proof',
            {
              fileId,
              dataSetIds,
              startedAt: Date.now(),
            } satisfies WatchFirstProofJobData,
            { delay: 60_000, jobId: `watch:${fileId}:${Date.now()}` },
          )
        }
      } catch (err) {
        if (StoreError.is(err) || CommitError.is(err)) {
          await markFailed(fileId, err.name, err)
          // Do NOT rethrow — Phase 0 does not retry.
          return
        }
        await markFailed(fileId, 'unexpected_error', err)
        throw err
      }
    },
    {
      connection: redis(),
      concurrency: 2,
      autorun: true,
    },
  )
}

export function createWatchFirstProofWorker(): Worker<WatchFirstProofJobData> {
  const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6h hard ceiling
  const REPOLL_DELAY_MS = 60_000 // 1 min between polls
  const BACKOFF_AFTER_FIRST_WINDOW_MS = 30 * 60_000 // 30 min reenqueues after initial 30m window

  return new Worker<WatchFirstProofJobData>(
    WATCH_FIRST_PROOF_QUEUE,
    async (job: Job<WatchFirstProofJobData>) => {
      const { fileId, dataSetIds, startedAt } = job.data
      const age = Date.now() - startedAt

      if (age > MAX_AGE_MS) {
        await db()
          .insert(commitEvents)
          .values({
            fileId,
            kind: 'fault',
            payload: { reason: 'first_proof_timeout', ageMs: age, dataSetIds },
          })
        return
      }

      const s = synapse()

      // Query proven-this-period via viem client for each dataset. If ANY dataset has
      // proven_this_period=true we consider the file "Secured".
      // (Phase 0: we fire on first proof of any copy. Phase 1 tightens to all copies.)
      for (const idStr of dataSetIds) {
        try {
          const dataSetId = BigInt(idStr)
          // Contract view: provenThisPeriod(dataSetId) -> bool on the fwssView contract.
          const proven = await s.client.readContract({
            address: s.chain.contracts.fwssView.address,
            abi: s.chain.contracts.fwssView.abi,
            functionName: 'provenThisPeriod',
            args: [dataSetId],
          })
          if (proven === true) {
            await db()
              .update(files)
              .set({ state: 'pdp_committed', updatedAt: new Date() })
              .where(eq(files.id, fileId))
            await db()
              .insert(commitEvents)
              .values({
                fileId,
                kind: 'first_proof_ok',
                payload: { dataSetId: idStr, ageMs: age },
              })
            return
          }
        } catch (err) {
          // Swallow per-dataset errors; we will retry next poll.
          await db()
            .insert(commitEvents)
            .values({
              fileId,
              kind: 'fault',
              payload: { reason: 'proof_check_failed', dataSetId: idStr, detail: String(err) },
            })
        }
      }

      // Not proven yet — re-enqueue.
      const delay = age < 30 * 60_000 ? REPOLL_DELAY_MS : BACKOFF_AFTER_FIRST_WINDOW_MS
      await watchFirstProofQ().add(
        'watch-first-proof',
        { fileId, dataSetIds, startedAt },
        { delay, jobId: `watch:${fileId}:${Date.now()}` },
      )
    },
    {
      connection: redis(),
      concurrency: 4,
      autorun: true,
    },
  )
}

