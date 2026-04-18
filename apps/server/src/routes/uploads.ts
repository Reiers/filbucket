import { UploadCompleteParams, UploadInitRequest } from '@filbucket/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { buckets, commitEvents, files } from '../db/schema.js'
import { requireDevUser } from '../middleware/auth.js'
import { durabilityQ } from '../queue/queues.js'
import { objectExists, presignPut } from '../storage/s3.js'
import { toFileDTO } from './serializers.js'

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/uploads/init
  app.post('/api/uploads/init', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return

    const parsed = UploadInitRequest.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues })
      return
    }
    const body = parsed.data

    // Verify bucket belongs to user.
    const [bucket] = await db()
      .select({ id: buckets.id })
      .from(buckets)
      .where(and(eq(buckets.id, body.bucketId), eq(buckets.userId, userId)))
      .limit(1)
    if (!bucket) {
      reply.code(404).send({ error: 'bucket_not_found' })
      return
    }

    // Create file row (state=uploading). s3Key uses the generated UUID.
    const [row] = await db()
      .insert(files)
      .values({
        bucketId: body.bucketId,
        name: body.filename,
        sizeBytes: body.size,
        mimeType: body.mimeType,
        state: 'uploading',
      })
      .returning()
    if (!row) {
      reply.code(500).send({ error: 'file_insert_failed' })
      return
    }

    const s3Key = `hot/${row.id}`
    await db().update(files).set({ hotCacheKey: s3Key }).where(eq(files.id, row.id))

    const uploadUrl = await presignPut(s3Key, body.mimeType)

    reply.send({ fileId: row.id, uploadUrl, s3Key })
  })

  // POST /api/uploads/:fileId/complete
  app.post('/api/uploads/:fileId/complete', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return

    const parsed = UploadCompleteParams.safeParse(req.params)
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_params', issues: parsed.error.issues })
      return
    }

    const [row] = await db()
      .select()
      .from(files)
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(files.id, parsed.data.fileId), eq(buckets.userId, userId)))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'file_not_found' })
      return
    }
    const file = row.files
    if (file.hotCacheKey == null) {
      reply.code(409).send({ error: 'no_hot_cache_key' })
      return
    }

    // Verify the object actually exists in MinIO (prevents lying clients).
    const check = await objectExists(file.hotCacheKey)
    if (!check.exists) {
      reply.code(409).send({ error: 'object_not_found_in_hot_cache' })
      return
    }

    const [updated] = await db()
      .update(files)
      .set({ state: 'hot_ready', updatedAt: new Date() })
      .where(eq(files.id, file.id))
      .returning()
    if (!updated) {
      reply.code(500).send({ error: 'update_failed' })
      return
    }

    await db()
      .insert(commitEvents)
      .values({
        fileId: file.id,
        kind: 'upload_complete',
        payload: { sizeBytes: check.size ?? updated.sizeBytes },
      })

    // Fire-and-queue the durability job.
    await durabilityQ().add(
      'durability',
      { fileId: file.id },
      { jobId: `durability:${file.id}` },
    )

    reply.send(toFileDTO(updated))
  })
}
