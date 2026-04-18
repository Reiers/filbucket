import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// --- enums ---

export const fileStateEnum = pgEnum('file_state', [
  'uploading',
  'hot_ready',
  'pdp_committed',
  'archived_cold',
  'restore_from_cold',
  'failed',
])

export const commitEventKindEnum = pgEnum('commit_event_kind', [
  'upload_complete',
  'store_ok',
  'commit_ok',
  'first_proof_ok',
  'fault',
  'repair',
  'chunk_started',
  'chunk_bytes',
  'chunk_stored',
  'chunk_committed',
])

// --- tables ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const buckets = pgTable('buckets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const files = pgTable('files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bucketId: uuid('bucket_id')
    .notNull()
    .references(() => buckets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  mimeType: text('mime_type').notNull(),
  state: fileStateEnum('state').notNull().default('uploading'),
  hotCacheKey: text('hot_cache_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const filePieces = pgTable('file_pieces', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  pieceCid: text('piece_cid').notNull(),
  byteStart: bigint('byte_start', { mode: 'number' }).notNull(),
  byteEnd: bigint('byte_end', { mode: 'number' }).notNull(),
  // 0-indexed chunk position within the file. chunkTotal = total chunks.
  // For files ≤ one piece, chunkIndex=0 and chunkTotal=1.
  chunkIndex: integer('chunk_index').notNull().default(0),
  chunkTotal: integer('chunk_total').notNull().default(1),
  spProviderId: text('sp_provider_id'),
  datasetId: text('dataset_id'),
  // Retrieval URL for this copy on its SP. Needed for Phase 1 restore-from-cold.
  retrievalUrl: text('retrieval_url'),
  // 'primary' | 'secondary' — free-text for now, not an enum.
  role: text('role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const datasetRails = pgTable(
  'dataset_rails',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    datasetId: text('dataset_id').notNull(),
    providerId: text('provider_id').notNull(),
    railId: text('rail_id').notNull(),
    payer: text('payer').notNull(),
    payee: text('payee').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    datasetIdUnique: uniqueIndex('dataset_rails_dataset_id_unique').on(t.datasetId),
  }),
)

export const commitEvents = pgTable('commit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),
  kind: commitEventKindEnum('kind').notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    // Short URL-safe token, ~95 bits entropy. Indexed unique.
    token: text('token').notNull(),
    // argon2id hash of the share password, if any. Null = no password.
    passwordHash: text('password_hash'),
    // Null = never expires. Most shares will have one.
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Null = unlimited downloads.
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('shares_token_unique').on(t.token),
  }),
)

export const shareAccesses = pgTable('share_accesses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  shareId: uuid('share_id')
    .notNull()
    .references(() => shares.id, { onDelete: 'cascade' }),
  // 'view' (landed on /s page), 'download' (hit /download), 'password_fail', 'expired', 'revoked'
  kind: text('kind').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- relation-free row types for convenience ---

export type UserRow = typeof users.$inferSelect
export type BucketRow = typeof buckets.$inferSelect
export type FileRow = typeof files.$inferSelect
export type FilePieceRow = typeof filePieces.$inferSelect
export type DatasetRailRow = typeof datasetRails.$inferSelect
export type CommitEventRow = typeof commitEvents.$inferSelect
export type ShareRow = typeof shares.$inferSelect
export type ShareAccessRow = typeof shareAccesses.$inferSelect
