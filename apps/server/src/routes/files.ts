import { ListFilesQuery } from '@filbucket/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { buckets, commitEvents, filePieces, files } from '../db/schema.js'
import { requireDevUser } from '../middleware/auth.js'
import { deleteObject, presignGet } from '../storage/s3.js'
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

    // Look up the most recent chunk_bytes progress event per file (if any)
    // so the UI can render a live progress bar on in-flight uploads.
    const fileIds = rows.map((r) => r.id)
    const progressByFile = new Map<
      string,
      { chunkIndex: number; chunkTotal: number; totalUploaded: number; totalBytes: number }
    >()
    if (fileIds.length > 0) {
      // Per-file DISTINCT-ON over chunk_bytes events sorted by createdAt DESC.
      const events = await db().execute(
        sql`
          SELECT DISTINCT ON (file_id) file_id, payload, created_at
          FROM commit_events
          WHERE kind = 'chunk_bytes' AND file_id IN (${sql.join(
            fileIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          ORDER BY file_id, created_at DESC
        `,
      )
      for (const row of events.rows as Array<{
        file_id: string
        payload: unknown
      }>) {
        const p = row.payload as {
          chunkIndex?: number
          chunkTotal?: number
          totalUploaded?: number
          totalBytes?: number
        } | null
        if (
          p != null &&
          typeof p.chunkIndex === 'number' &&
          typeof p.chunkTotal === 'number' &&
          typeof p.totalUploaded === 'number' &&
          typeof p.totalBytes === 'number'
        ) {
          progressByFile.set(row.file_id, {
            chunkIndex: p.chunkIndex,
            chunkTotal: p.chunkTotal,
            totalUploaded: p.totalUploaded,
            totalBytes: p.totalBytes,
          })
        }
      }
    }

    reply.send({
      files: rows.map((r) => {
        const base = toFileDTO(r)
        // Only expose progress while the upload is actually in flight.
        if (r.state === 'hot_ready' && progressByFile.has(r.id)) {
          return { ...base, progress: progressByFile.get(r.id) }
        }
        return base
      }),
    })
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
  //
  // Browser anchors can't send custom headers, so auth here also accepts `?u=<devUserId>`
  // via the middleware. Phase 1 swaps this for short-lived signed tokens.
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

  // DELETE /api/files/:id — Phase 0: hard-delete.
  //
  // Removes DB row (CASCADE drops file_pieces + commit_events), plus the MinIO object.
  // Does NOT on-chain-delete the PDP dataset yet — that's a Phase 1 concern once we have
  // a proper lifecycle (scheduled removal via FWSS). Phase 0 this is fine because rails
  // are untouched by dropping our local metadata.
  app.delete('/api/files/:id', async (req, reply) => {
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

    // Delete DB row first so a retry after partial failure can still find it gone.
    await db().delete(files).where(eq(files.id, file.id))

    // Best-effort delete from MinIO hot cache.
    if (file.hotCacheKey != null) {
      try {
        await deleteObject(file.hotCacheKey)
      } catch (err) {
        req.log.warn({ err, key: file.hotCacheKey }, 'minio delete failed (ignored)')
      }
    }

    reply.code(204).send()
  })
}
