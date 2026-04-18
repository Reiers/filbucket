import { ListFilesQuery } from '@filbucket/shared'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { buckets, commitEvents, filePieces, files } from '../db/schema.js'
import { requireDevUser } from '../middleware/auth.js'
import { presignGet } from '../storage/s3.js'
import { toCommitEventDTO, toFileDTO, toFilePieceDTO } from './serializers.js'

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/files?bucketId=...
  app.get('/api/files', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return

    const parsed = ListFilesQuery.safeParse(req.query)
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues })
      return
    }

    // Bucket must belong to user.
    const [bucket] = await db()
      .select({ id: buckets.id })
      .from(buckets)
      .where(and(eq(buckets.id, parsed.data.bucketId), eq(buckets.userId, userId)))
      .limit(1)
    if (!bucket) {
      reply.code(404).send({ error: 'bucket_not_found' })
      return
    }

    const rows = await db()
      .select()
      .from(files)
      .where(eq(files.bucketId, parsed.data.bucketId))
      .orderBy(desc(files.createdAt))
    reply.send({ files: rows.map(toFileDTO) })
  })

  // GET /api/files/:id — file + pieces + events (debugging UI)
  app.get('/api/files/:id', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return
    const { id } = req.params as { id: string }

    const [row] = await db()
      .select()
      .from(files)
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(files.id, id), eq(buckets.userId, userId)))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'file_not_found' })
      return
    }
    const file = row.files
    const pieces = await db()
      .select()
      .from(filePieces)
      .where(eq(filePieces.fileId, file.id))
      .orderBy(asc(filePieces.byteStart))
    const events = await db()
      .select()
      .from(commitEvents)
      .where(eq(commitEvents.fileId, file.id))
      .orderBy(asc(commitEvents.createdAt))

    reply.send({
      ...toFileDTO(file),
      pieces: pieces.map(toFilePieceDTO),
      events: events.map(toCommitEventDTO),
    })
  })

  // GET /api/files/:id/download — Phase 0: direct MinIO 302 (Phase 1 wires the real restore path).
  app.get('/api/files/:id/download', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return
    const { id } = req.params as { id: string }

    const [row] = await db()
      .select()
      .from(files)
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(files.id, id), eq(buckets.userId, userId)))
      .limit(1)
    if (!row || row.files.hotCacheKey == null) {
      reply.code(404).send({ error: 'file_not_found' })
      return
    }

    const url = await presignGet(row.files.hotCacheKey)
    reply.redirect(url, 302)
  })
}
