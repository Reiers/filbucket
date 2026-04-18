import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../env.js'

/**
 * Phase 0 dev auth: trust the X-Dev-User header if it matches DEV_USER_ID.
 *
 * DO NOT SHIP THIS. Phase 1 replaces it with email magic-link sessions.
 * This is loud on purpose — every request hits it.
 */
export function requireDevUser(req: FastifyRequest, reply: FastifyReply): string | null {
  const expected = env().DEV_USER_ID
  if (!expected) {
    reply.code(500).send({
      error: 'dev_user_not_configured',
      hint: 'Run `pnpm --filter @filbucket/server db:seed` and set DEV_USER_ID in .env',
    })
    return null
  }
  const header = req.headers['x-dev-user']
  const headerVal = Array.isArray(header) ? header[0] : header

  // Accept `?u=<devUserId>` as a fallback for link-based flows (download anchors,
  // share links in Phase 1, etc.) — still Phase-0 only.
  const query = (req.query as { u?: string } | undefined)?.u

  const provided = headerVal ?? query
  if (provided !== expected) {
    reply.code(401).send({ error: 'unauthorized', hint: 'Missing or bad X-Dev-User header' })
    return null
  }
  return expected
}
