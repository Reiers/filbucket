import type { CommitEventDTO, FileDTO, FilePieceDTO } from '@filbucket/shared'
import type { CommitEventRow, FilePieceRow, FileRow } from '../db/schema.js'

export function toFileDTO(row: FileRow): FileDTO {
  return {
    id: row.id,
    bucketId: row.bucketId,
    name: row.name,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toFilePieceDTO(row: FilePieceRow): FilePieceDTO {
  return {
    id: row.id,
    pieceCid: row.pieceCid,
    byteStart: row.byteStart,
    byteEnd: row.byteEnd,
    chunkIndex: row.chunkIndex,
    chunkTotal: row.chunkTotal,
    spProviderId: row.spProviderId,
    datasetId: row.datasetId,
    retrievalUrl: row.retrievalUrl,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toCommitEventDTO(row: CommitEventRow): CommitEventDTO {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  }
}
