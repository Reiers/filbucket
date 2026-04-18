import { eq } from 'drizzle-orm'
import { closeDb, db } from '../db/client.js'
import { buckets, users } from '../db/schema.js'

async function main(): Promise<void> {
  const email = 'dev@filbucket.local'
  const bucketName = 'My Files'

  let userId: string
  const existing = await db().select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0 && existing[0]) {
    userId = existing[0].id
    console.log(`[seed] reusing user ${email} → ${userId}`)
  } else {
    const [row] = await db().insert(users).values({ email }).returning()
    if (!row) throw new Error('seed: user insert returned no rows')
    userId = row.id
    console.log(`[seed] created user ${email} → ${userId}`)
  }

  let bucketId: string
  const existingBuckets = await db().select().from(buckets).where(eq(buckets.userId, userId))
  if (existingBuckets.length > 0 && existingBuckets[0]) {
    bucketId = existingBuckets[0].id
    console.log(`[seed] reusing bucket ${existingBuckets[0].name} → ${bucketId}`)
  } else {
    const [b] = await db().insert(buckets).values({ userId, name: bucketName }).returning()
    if (!b) throw new Error('seed: bucket insert returned no rows')
    bucketId = b.id
    console.log(`[seed] created bucket ${bucketName} → ${bucketId}`)
  }

  console.log('\n────────────────────────────────────────')
  console.log('Paste these into .env (repo root):')
  console.log(`DEV_USER_ID=${userId}`)
  console.log(`NEXT_PUBLIC_DEFAULT_BUCKET_ID=${bucketId}`)
  console.log('────────────────────────────────────────\n')

  await closeDb()
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
