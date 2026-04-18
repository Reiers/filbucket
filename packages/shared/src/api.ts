import { z } from 'zod'
import { FILE_STATE_VALUES } from './file-state.js'

// --- Zod schemas (wire contracts) ---

export const UploadInitRequest = z.object({
  filename: z.string().min(1).max(512),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(255),
  bucketId: z.string().uuid(),
})
export type UploadInitRequest = z.infer<typeof UploadInitRequest>

export const UploadInitResponse = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  s3Key: z.string(),
})
export type UploadInitResponse = z.infer<typeof UploadInitResponse>

export const UploadCompleteParams = z.object({
  fileId: z.string().uuid(),
})
export type UploadCompleteParams = z.infer<typeof UploadCompleteParams>

export const UploadProgress = z.object({
  chunkIndex: z.number().int().nonnegative(),
  chunkTotal: z.number().int().positive(),
  totalUploaded: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
})
export type UploadProgress = z.infer<typeof UploadProgress>

export const FileDTO = z.object({
  id: z.string().uuid(),
  bucketId: z.string().uuid(),
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string(),
  state: z.enum(FILE_STATE_VALUES as [string, ...string[]]),
  progress: UploadProgress.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FileDTO = z.infer<typeof FileDTO>

export const FilePieceDTO = z.object({
  id: z.string().uuid(),
  pieceCid: z.string(),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().nonnegative(),
  chunkIndex: z.number().int().nonnegative(),
  chunkTotal: z.number().int().positive(),
  spProviderId: z.string().nullable(),
  datasetId: z.string().nullable(),
  retrievalUrl: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string(),
})
export type FilePieceDTO = z.infer<typeof FilePieceDTO>

export const CommitEventDTO = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
})
export type CommitEventDTO = z.infer<typeof CommitEventDTO>

export const FileDetailDTO = FileDTO.extend({
  pieces: z.array(FilePieceDTO),
  events: z.array(CommitEventDTO),
})
export type FileDetailDTO = z.infer<typeof FileDetailDTO>

export const ListFilesQuery = z.object({
  bucketId: z.string().uuid(),
})
export type ListFilesQuery = z.infer<typeof ListFilesQuery>

export const ListFilesResponse = z.object({
  files: z.array(FileDTO),
})
export type ListFilesResponse = z.infer<typeof ListFilesResponse>

export const HealthzResponse = z.object({
  ok: z.boolean(),
  chain: z.string(),
  walletAddress: z.string().nullable(),
})
export type HealthzResponse = z.infer<typeof HealthzResponse>
