import argon2 from 'argon2'
import { and, desc, eq, isNull, or, sql, gt } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { customAlphabet } from 'nanoid'
import { db } from '../db/client.js'
import { buckets, files, shareAccesses, shares } from '../db/schema.js'
import { requireDevUser } from '../middleware/auth.js'
import { presignGet } from '../storage/s3.js'
import { ShareCreateRequest } from '@filbucket/shared'

// URL-safe base62 token, 22 chars ≈ 130 bits of entropy. Way more than needed,
// but collision-resistant + not guessable. Customize alphabet to avoid
// confusable chars (0/O, 1/l/I).
const tokenGen = customAlphabet(
  '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ',
  22,
)

const VIEW = 'view'
const DOWNLOAD = 'download'
const PASSWORD_FAIL = 'password_fail'
const EXPIRED = 'expired'
const REVOKED = 'revoked'

/**
 * Log a share access event. Fire-and-forget; never blocks the response.
 */
function recordAccess(
  shareId: string,
  kind: string,
  req: FastifyRequest,
): void {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip
  const ua = (req.headers['user-agent'] as string | undefined) ?? null
  void db()
    .insert(shareAccesses)
    .values({ shareId, kind, ip, userAgent: ua })
    .catch(() => {
      // Swallow — audit log is advisory.
    })
}

function isExpired(expiresAt: Date | null): boolean {
  if (expiresAt == null) return false
  return expiresAt.getTime() < Date.now()
}

function isExhausted(maxDownloads: number | null, downloadCount: number): boolean {
  if (maxDownloads == null) return false
  return downloadCount >= maxDownloads
}

/**
 * Phase 0 simple in-memory token bucket per IP.
 * Bounds abuse on the public share endpoints. Phase 1 moves this to Redis.
 */
const rateLimits = new Map<string, { tokens: number; lastRefill: number }>()
const RATE_CAPACITY = 60 // requests
const RATE_REFILL_PER_SEC = 1 // tokens/sec
function rateLimitOk(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(ip) ?? { tokens: RATE_CAPACITY, lastRefill: now }
  const elapsedSec = (now - entry.lastRefill) / 1000
  entry.tokens = Math.min(RATE_CAPACITY, entry.tokens + elapsedSec * RATE_REFILL_PER_SEC)
  entry.lastRefill = now
  if (entry.tokens < 1) {
    rateLimits.set(ip, entry)
    return false
  }
  entry.tokens -= 1
  rateLimits.set(ip, entry)
  return true
}

function ipFrom(req: FastifyRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip
  )
}

async function hashPassword(pw: string): Promise<string> {
  // argon2id with sensible defaults. Tuning is a Phase 1 concern.
  return argon2.hash(pw, { type: argon2.argon2id })
}

async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw)
  } catch {
    return false
  }
}

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // ---- Owner APIs (dev-auth gated) ------------------------------------------

  // POST /api/files/:id/shares — create a new share for a file.
  app.post('/api/files/:id/shares', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return
    const { id } = req.params as { id: string }

    const parsed = ShareCreateRequest.safeParse(req.body ?? {})
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues })
      return
    }

    // Verify file belongs to the user.
    const [row] = await db()
      .select({ id: files.id, state: files.state })
      .from(files)
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(files.id, id), eq(buckets.userId, userId)))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'file_not_found' })
      return
    }

    const token = tokenGen()
    const passwordHash =
      parsed.data.password != null && parsed.data.password.length > 0
        ? await hashPassword(parsed.data.password)
        : null

    let expiresAt: Date | null = null
    if (parsed.data.expiresInSeconds != null && parsed.data.expiresInSeconds > 0) {
      expiresAt = new Date(Date.now() + parsed.data.expiresInSeconds * 1000)
    }

    const [inserted] = await db()
      .insert(shares)
      .values({
        fileId: id,
        token,
        passwordHash,
        expiresAt,
        maxDownloads: parsed.data.maxDownloads ?? null,
      })
      .returning()
    if (!inserted) {
      reply.code(500).send({ error: 'insert_failed' })
      return
    }

    reply.send({
      id: inserted.id,
      token: inserted.token,
      url: `/s/${inserted.token}`,
      hasPassword: passwordHash != null,
      expiresAt: inserted.expiresAt?.toISOString() ?? null,
      maxDownloads: inserted.maxDownloads,
      createdAt: inserted.createdAt.toISOString(),
    })
  })

  // GET /api/files/:id/shares — list active shares for a file.
  app.get('/api/files/:id/shares', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return
    const { id } = req.params as { id: string }

    const [fileRow] = await db()
      .select({ id: files.id })
      .from(files)
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(files.id, id), eq(buckets.userId, userId)))
      .limit(1)
    if (!fileRow) {
      reply.code(404).send({ error: 'file_not_found' })
      return
    }

    const rows = await db()
      .select()
      .from(shares)
      .where(eq(shares.fileId, id))
      .orderBy(desc(shares.createdAt))

    reply.send({
      shares: rows.map((s) => ({
        id: s.id,
        token: s.token,
        url: `/s/${s.token}`,
        hasPassword: s.passwordHash != null,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        maxDownloads: s.maxDownloads,
        downloadCount: s.downloadCount,
        revokedAt: s.revokedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    })
  })

  // DELETE /api/shares/:id — revoke a share.
  app.delete('/api/shares/:id', async (req, reply) => {
    const userId = requireDevUser(req, reply)
    if (userId == null) return
    const { id } = req.params as { id: string }

    // Ownership check via join.
    const [row] = await db()
      .select({ id: shares.id })
      .from(shares)
      .innerJoin(files, eq(shares.fileId, files.id))
      .innerJoin(buckets, eq(files.bucketId, buckets.id))
      .where(and(eq(shares.id, id), eq(buckets.userId, userId)))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'share_not_found' })
      return
    }
    await db()
      .update(shares)
      .set({ revokedAt: new Date() })
      .where(eq(shares.id, id))
    reply.code(204).send()
  })

  // ---- Public share APIs (no dev auth) --------------------------------------

  // GET /api/shares/by-token/:token — used by the public /s/<token> page to
  // fetch share metadata without requiring auth.
  app.get('/api/shares/by-token/:token', async (req, reply) => {
    if (!rateLimitOk(ipFrom(req))) {
      reply.code(429).send({ error: 'rate_limited' })
      return
    }
    const { token } = req.params as { token: string }
    const [row] = await db()
      .select({
        id: shares.id,
        fileId: shares.fileId,
        passwordHash: shares.passwordHash,
        expiresAt: shares.expiresAt,
        maxDownloads: shares.maxDownloads,
        downloadCount: shares.downloadCount,
        revokedAt: shares.revokedAt,
      })
      .from(shares)
      .where(eq(shares.token, token))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'not_found' })
      return
    }

    // Load file metadata alongside.
    const [file] = await db()
      .select({ name: files.name, sizeBytes: files.sizeBytes, mimeType: files.mimeType })
      .from(files)
      .where(eq(files.id, row.fileId))
      .limit(1)

    const status =
      row.revokedAt != null
        ? 'revoked'
        : isExpired(row.expiresAt)
          ? 'expired'
          : isExhausted(row.maxDownloads, row.downloadCount)
            ? 'exhausted'
            : 'active'

    recordAccess(row.id, VIEW, req)

    reply.send({
      status,
      hasPassword: row.passwordHash != null,
      file: file
        ? { name: file.name, sizeBytes: file.sizeBytes, mimeType: file.mimeType }
        : null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      maxDownloads: row.maxDownloads,
      downloadCount: row.downloadCount,
    })
  })

  // GET /api/shares/:token/download — public download endpoint.
  // Browser anchor-compatible: accepts password via ?p= query param after
  // verification; Phase 1 moves to signed cookies.
  app.get('/api/shares/:token/download', async (req, reply) => {
    if (!rateLimitOk(ipFrom(req))) {
      reply.code(429).send({ error: 'rate_limited' })
      return
    }
    const { token } = req.params as { token: string }
    const { p } = (req.query as { p?: string }) ?? {}

    const [row] = await db()
      .select()
      .from(shares)
      .where(eq(shares.token, token))
      .limit(1)
    if (!row) {
      reply.code(404).send({ error: 'not_found' })
      return
    }
    if (row.revokedAt != null) {
      recordAccess(row.id, REVOKED, req)
      reply.code(410).send({ error: 'revoked' })
      return
    }
    if (isExpired(row.expiresAt)) {
      recordAccess(row.id, EXPIRED, req)
      reply.code(410).send({ error: 'expired' })
      return
    }
    if (isExhausted(row.maxDownloads, row.downloadCount)) {
      reply.code(410).send({ error: 'exhausted' })
      return
    }
    if (row.passwordHash != null) {
      if (p == null || !(await verifyPassword(row.passwordHash, p))) {
        recordAccess(row.id, PASSWORD_FAIL, req)
        reply.code(401).send({ error: 'password_required' })
        return
      }
    }

    // Increment download count (best-effort; race-safe via SQL).
    await db()
      .update(shares)
      .set({ downloadCount: sql`${shares.downloadCount} + 1` })
      .where(eq(shares.id, row.id))

    const [file] = await db()
      .select({ hotCacheKey: files.hotCacheKey })
      .from(files)
      .where(eq(files.id, row.fileId))
      .limit(1)
    if (!file?.hotCacheKey) {
      reply.code(410).send({ error: 'file_unavailable' })
      return
    }

    recordAccess(row.id, DOWNLOAD, req)
    const url = await presignGet(file.hotCacheKey, 300)
    reply.redirect(url, 302)
  })
}
