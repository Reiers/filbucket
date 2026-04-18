import { CommitError, StoreError } from '@filoz/synapse-sdk'
import { WarmStorageService } from '@filoz/synapse-sdk/warm-storage'
import { type Job, Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { createPublicClient, http as viemHttp } from 'viem'
import { filecoinCalibration } from 'viem/chains'
import { synapse } from '../chain/synapse.js'
import { env } from '../env.js'
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

// PDPVerifier proxy on calibration. Used for reading challenge-epoch state directly
// because FWSS view's provenThisPeriod() reverts on freshly-created datasets.
const PDP_VERIFIER_CALIBRATION = '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C' as const
const PDP_VERIFIER_ABI = [
  {
    name: 'getNextChallengeEpoch',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'dataSetLive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const

let readClient: ReturnType<typeof createPublicClient> | null = null
function chainReader(): ReturnType<typeof createPublicClient> {
  if (readClient != null) return readClient
  readClient = createPublicClient({
    chain: filecoinCalibration,
    transport: viemHttp(env().FILBUCKET_RPC_URL),
  })
  return readClient
}

async function readNextChallengeEpoch(dataSetId: bigint): Promise<bigint | null> {
  try {
    const v = (await chainReader().readContract({
      address: PDP_VERIFIER_CALIBRATION,
      abi: PDP_VERIFIER_ABI,
      functionName: 'getNextChallengeEpoch',
      args: [dataSetId],
    })) as bigint
    return v
  } catch {
    return null
  }
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

        // Note: we intentionally DO NOT change file.state here. It stays hot_ready until first proof.

        // 5. Snapshot each dataset's current nextChallengeEpoch so the watcher can
        // detect it advancing (SP submitted a proof + called nextProvingPeriod).
        const dataSetIds = [...new Set(result.copies.map((c) => c.dataSetId.toString()))]
        const initialNextChallengeEpoch: Record<string, string> = {}
        for (const idStr of dataSetIds) {
          const epoch = await readNextChallengeEpoch(BigInt(idStr))
          if (epoch != null) initialNextChallengeEpoch[idStr] = epoch.toString()
        }

        await db().insert(commitEvents).values({
          fileId,
          kind: 'commit_ok',
          payload: {
            pieceCid: pieceCidStr,
            initialNextChallengeEpoch,
          },
        })

        if (dataSetIds.length > 0) {
          await watchFirstProofQ().add(
            'watch-first-proof',
            {
              fileId,
              dataSetIds,
              startedAt: Date.now(),
              initialNextChallengeEpoch,
            } satisfies WatchFirstProofJobData,
            // Wait 5 min before first poll — first challenge epoch on a brand-new
            // dataset is typically ~180 blocks (90 min) out, no point hammering early.
            { delay: 5 * 60_000, jobId: `watch:${fileId}:${Date.now()}` },
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
  const REPOLL_DELAY_MS = 2 * 60_000 // 2 min between polls (calibration epoch = 30s)
  const BACKOFF_AFTER_FIRST_WINDOW_MS = 10 * 60_000 // 10 min reenqueues after initial proving window

  return new Worker<WatchFirstProofJobData>(
    WATCH_FIRST_PROOF_QUEUE,
    async (job: Job<WatchFirstProofJobData>) => {
      const { fileId, dataSetIds, startedAt, initialNextChallengeEpoch } = job.data
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

      // Signal: nextChallengeEpoch has advanced past the value we snapshotted at
      // commit time. That means the SP submitted a proof + called nextProvingPeriod.
      // Falls back to "epoch became non-zero" if we couldn't snapshot initially.
      let proofLandedOn: string | null = null
      let proofLandedInitial: string | null = null
      let proofLandedNow: string | null = null

      for (const idStr of dataSetIds) {
        const dataSetId = BigInt(idStr)
        const current = await readNextChallengeEpoch(dataSetId)
        if (current == null) continue // chain unreachable or dataset reverted — retry next poll

        const initialStr = initialNextChallengeEpoch?.[idStr]
        if (initialStr != null) {
          // Normal path: compare against snapshot.
          const initial = BigInt(initialStr)
          if (current > initial) {
            proofLandedOn = idStr
            proofLandedInitial = initialStr
            proofLandedNow = current.toString()
            break
          }
        } else if (current > 0n) {
          // Fallback path for legacy jobs that didn't snapshot: any non-zero is
          // "there is at least a scheduled challenge", not proof of delivery, but
          // best we can do.
          proofLandedOn = idStr
          proofLandedNow = current.toString()
          break
        }
      }

      if (proofLandedOn != null) {
        await db()
          .update(files)
          .set({ state: 'pdp_committed', updatedAt: new Date() })
          .where(eq(files.id, fileId))
        await db()
          .insert(commitEvents)
          .values({
            fileId,
            kind: 'first_proof_ok',
            payload: {
              dataSetId: proofLandedOn,
              initialNextChallengeEpoch: proofLandedInitial,
              currentNextChallengeEpoch: proofLandedNow,
              ageMs: age,
            },
          })
        return
      }

      // Not yet — re-enqueue.
      const delay = age < 30 * 60_000 ? REPOLL_DELAY_MS : BACKOFF_AFTER_FIRST_WINDOW_MS
      await watchFirstProofQ().add(
        'watch-first-proof',
        { fileId, dataSetIds, startedAt, initialNextChallengeEpoch },
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

