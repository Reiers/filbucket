import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../env.js'
import * as schema from './schema.js'

const { Pool } = pg

let pool: pg.Pool | null = null
let dbInstance: NodePgDatabase<typeof schema> | null = null

export function pgPool(): pg.Pool {
  if (pool == null) {
    pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 })
  }
  return pool
}

export function db(): NodePgDatabase<typeof schema> {
  if (dbInstance == null) {
    dbInstance = drizzle(pgPool(), { schema, logger: false })
  }
  return dbInstance
}

export async function closeDb(): Promise<void> {
  if (pool != null) {
    await pool.end()
    pool = null
    dbInstance = null
  }
}
