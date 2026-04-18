import { Redis } from 'ioredis'
import { env } from '../env.js'

let client: Redis | null = null

export function redis(): Redis {
  if (client == null) {
    // BullMQ requires maxRetriesPerRequest = null for blocking ops.
    client = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null })
  }
  return client
}

export async function closeRedis(): Promise<void> {
  if (client != null) {
    await client.quit()
    client = null
  }
}
