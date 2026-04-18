/**
 * Find and load the repo-root .env file.
 *
 * Why: pnpm runs scripts from `apps/server/`, so `dotenv/config` (which reads
 * cwd/.env) misses the `.env` that lives at the repo root. Dev works thanks to
 * a symlink, but a fresh `git clone` doesn't have that symlink, and the
 * installer's auto-recovery flow ends up calling these scripts with the wrong
 * cwd and a missing .env. Walk up from this file's location until we find one.
 *
 * Import this AT THE TOP of any script that reads process.env.* directly.
 */

import { config as dotenvConfig } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function findEnvFile(): string | null {
  // Start from this file's dir; walk up to filesystem root looking for .env.
  let dir: string
  try {
    dir = dirname(fileURLToPath(import.meta.url))
  } catch {
    // Fallback for CJS-loaded contexts.
    dir = __dirname
  }
  // Also try cwd as a parallel path; whichever finds .env first wins.
  const candidates = new Set<string>()
  let p = dir
  for (let i = 0; i < 8; i++) {
    candidates.add(p)
    p = dirname(p)
    if (p === '/' || !p) break
  }
  let cwd = process.cwd()
  for (let i = 0; i < 8; i++) {
    candidates.add(cwd)
    cwd = dirname(cwd)
    if (cwd === '/' || !cwd) break
  }
  for (const candidate of candidates) {
    const file = join(candidate, '.env')
    if (existsSync(file)) return resolve(file)
  }
  return null
}

const envFile = findEnvFile()
if (envFile) {
  dotenvConfig({ path: envFile })
}
