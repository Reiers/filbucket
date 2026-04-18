import 'dotenv/config'
import { z } from 'zod'

// Re-export a carefully validated env object. Never log this.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('true'),

  FILBUCKET_OPS_PK: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'FILBUCKET_OPS_PK must be a 0x-prefixed 32-byte hex string')
    .optional(),
  FILBUCKET_CHAIN: z.literal('calibration'),
  FILBUCKET_RPC_URL: z.string().url(),
  FILBUCKET_OPS_ADDRESS: z.string().optional(),

  SERVER_PORT: z.coerce.number().int().default(4000),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEV_USER_ID: z.string().uuid().optional(),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function env(): Env {
  if (cached != null) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    // Summarize issues without dumping values.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')
    throw new Error(`Invalid environment:\n  ${issues}`)
  }
  cached = parsed.data
  return cached
}

/**
 * Hard rail: we refuse to even boot against mainnet while Phase 0 is live.
 * This is the single most important guard in the whole server.
 */
export function assertCalibrationOnly(): void {
  if (env().FILBUCKET_CHAIN !== 'calibration') {
    throw new Error(
      `FILBUCKET_CHAIN must equal "calibration" in Phase 0. Got: ${String(env().FILBUCKET_CHAIN)}`,
    )
  }
}
