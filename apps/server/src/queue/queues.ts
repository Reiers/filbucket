import { Queue } from 'bullmq'
import { redis } from './redis.js'

export const DURABILITY_QUEUE = 'durability'
export const WATCH_FIRST_PROOF_QUEUE = 'watch-first-proof'

export interface DurabilityJobData {
  fileId: string
}

export interface WatchFirstProofJobData {
  fileId: string
  dataSetIds: string[] // stringified bigints
  startedAt: number // epoch ms of first enqueue
  // Initial nextChallengeEpoch per dataset captured at commit time.
  // We consider a proof landed when the dataset's nextChallengeEpoch has advanced
  // past this initial value (the SP called nextProvingPeriod after submitting a proof).
  initialNextChallengeEpoch?: Record<string, string> // dataSetId -> bigint as string
}

let durabilityQueue: Queue<DurabilityJobData> | null = null
let watchQueue: Queue<WatchFirstProofJobData> | null = null

export function durabilityQ(): Queue<DurabilityJobData> {
  if (durabilityQueue != null) return durabilityQueue
  durabilityQueue = new Queue<DurabilityJobData>(DURABILITY_QUEUE, {
    connection: redis(),
    defaultJobOptions: {
      // Phase 0: explicitly NO automatic retries. We log + move on.
      attempts: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  })
  return durabilityQueue
}

export function watchFirstProofQ(): Queue<WatchFirstProofJobData> {
  if (watchQueue != null) return watchQueue
  watchQueue = new Queue<WatchFirstProofJobData>(WATCH_FIRST_PROOF_QUEUE, {
    connection: redis(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  })
  return watchQueue
}
