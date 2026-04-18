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
import { Readable } from 'node:stream'
import { getObjectStream, getObjectChunkStream } from '../storage/s3.js'

/**
 * Max bytes per Filecoin piece / Synapse upload call.
 * Synapse SDK accepts up to 200 MiB per upload; we leave a little headroom.
 */
const MAX_PIECE_BYTES = 200 * 1024 * 1024 // 200 MiB

/** How often the worker writes a chunk_bytes progress event (bytes). */
const PROGRESS_EVENT_STRIDE_BYTES = 4 * 1024 * 1024 // 4 MiB

/**
 * Plan how to chunk a file. Returns an array of [byteStart, byteEnd] inclusive ranges.
 * Files <= MAX_PIECE_BYTES produce a single chunk with chunkIndex=0, chunkTotal=1.
 */
function planChunks(sizeBytes: number): { start: number; end: number }[] {
  if (sizeBytes <= 0) return [{ start: 0, end: 0 }]
  const out: { start: number; end: number }[] = []
  let offset = 0
  while (offset < sizeBytes) {
    const end = Math.min(offset + MAX_PIECE_BYTES, sizeBytes) - 1
    out.push({ start: offset, end })
    offset = end + 1
  }
  return out
}

/**
 * Convert a Node Readable into a Web ReadableStream (what Synapse SDK wants).
 * Synapse's UploadPieceStreamingData accepts either Web or Node ReadableStream, but
 * mixing stream types across library boundaries gets spooky; normalize to Web here.
 */
function toWebStream(node: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>
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

      const totalSize = Number(file.sizeBytes)
      const chunks = planChunks(totalSize)
      const chunkTotal = chunks.length
      const s = synapse()

      try {
        const allCopyDataSets = new Set<string>()
        let bytesDoneGlobal = 0

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const ck = chunks[chunkIndex]
          if (ck == null) throw new Error('planChunks returned an empty range')
          const chunkSize = ck.end - ck.start + 1

          await db().insert(commitEvents).values({
            fileId,
            kind: 'chunk_started',
            payload: { chunkIndex, chunkTotal, start: ck.start, end: ck.end, size: chunkSize },
          })

          // Stream this chunk's byte range from MinIO directly into Synapse.
          const nodeStream =
            chunks.length === 1
              ? (await getObjectStream(file.hotCacheKey)).stream
              : (await getObjectChunkStream(file.hotCacheKey, ck.start, ck.end)).stream
          const webStream = toWebStream(nodeStream)

          // Per-chunk progress: emit chunk_bytes every PROGRESS_EVENT_STRIDE_BYTES.
          let bytesThisChunk = 0
          let nextProgressMark = PROGRESS_EVENT_STRIDE_BYTES
          const onProgress = (bytesUploaded: number): void => {
            bytesThisChunk = bytesUploaded
            const totalUploaded = bytesDoneGlobal + bytesThisChunk
            if (bytesThisChunk >= nextProgressMark || bytesThisChunk >= chunkSize) {
              nextProgressMark = bytesThisChunk + PROGRESS_EVENT_STRIDE_BYTES
              // Fire-and-forget; we don't await inside the progress callback.
              void db()
                .insert(commitEvents)
                .values({
                  fileId,
                  kind: 'chunk_bytes',
                  payload: {
                    chunkIndex,
                    chunkTotal,
                    bytes: bytesThisChunk,
                    totalBytes: totalSize,
                    totalUploaded,
                  },
                })
                .catch(() => {
                  // Swallow — progress events are advisory, not critical.
                })
            }
          }

          // Synapse SDK accepts a Web ReadableStream directly.
          // It returns UploadResult with copies[] and failedAttempts[].
          const result = await s.storage.upload(webStream, {
            metadata: { Application: 'FilBucket' },
            callbacks: { onProgress },
          })

          bytesDoneGlobal += chunkSize

          // Record per-chunk store_ok event (kept as store_ok so existing UI keeps working).
          await db().insert(commitEvents).values({
            fileId,
            kind: 'store_ok',
            payload: {
              chunkIndex,
              chunkTotal,
              pieceCid: String(result.pieceCid),
              size: result.size,
              requestedCopies: result.requestedCopies,
              complete: result.complete,
              copies: result.copies.map((c) => ({
                providerId: c.providerId.toString(),
                dataSetId: c.dataSetId.toString(),
                pieceId: c.pieceId.toString(),
                role: c.role,
                retrievalUrl: c.retrievalUrl,
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

          // Insert one file_pieces row per copy for this chunk.
          const pieceCidStr = String(result.pieceCid)
          if (result.copies.length > 0) {
            await db()
              .insert(filePieces)
              .values(
                result.copies.map((c) => ({
                  fileId,
                  pieceCid: pieceCidStr,
                  byteStart: ck.start,
                  byteEnd: ck.end,
                  chunkIndex,
                  chunkTotal,
                  spProviderId: c.providerId.toString(),
                  datasetId: c.dataSetId.toString(),
                  retrievalUrl: c.retrievalUrl,
                  role: c.role,
                })),
              )
          }

          // Upsert dataset_rails for each new dataset we've touched this chunk.
          for (const c of result.copies) {
            const key = c.dataSetId.toString()
            allCopyDataSets.add(key)
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
              await db()
                .insert(commitEvents)
                .values({
                  fileId,
                  kind: 'fault',
                  payload: {
                    reason: 'rail_lookup_failed',
                    dataSetId: key,
                    chunkIndex,
                    detail: String(err),
                  },
                })
            }
          }

          await db().insert(commitEvents).values({
            fileId,
            kind: 'chunk_committed',
            payload: { chunkIndex, chunkTotal, pieceCid: pieceCidStr },
          })
        }

        // Note: we intentionally DO NOT change file.state here. It stays hot_ready
        // until first proof on at least one dataset.

        // Snapshot each dataset's current nextChallengeEpoch for the watcher.
        const dataSetIds = [...allCopyDataSets]
        const initialNextChallengeEpoch: Record<string, string> = {}
        for (const idStr of dataSetIds) {
          const epoch = await readNextChallengeEpoch(BigInt(idStr))
          if (epoch != null) initialNextChallengeEpoch[idStr] = epoch.toString()
        }

        await db().insert(commitEvents).values({
          fileId,
          kind: 'commit_ok',
          payload: {
            chunkTotal,
            totalBytes: totalSize,
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

