import type {
  FileDTO,
  FileDetailDTO,
  ListFilesResponse,
  UploadInitResponse,
} from '@filbucket/shared'
import { DEV_USER_ID, PUBLIC_API_URL } from './env'

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Dev-User': DEV_USER_ID,
  }
}

function authHeaders(): Record<string, string> {
  return {
    'X-Dev-User': DEV_USER_ID,
  }
}

export async function listFiles(bucketId: string): Promise<FileDTO[]> {
  const url = new URL('/api/files', PUBLIC_API_URL)
  url.searchParams.set('bucketId', bucketId)
  const res = await fetch(url.toString(), { headers: authHeaders(), cache: 'no-store' })

  if (!res.ok) throw new Error(`listFiles failed: ${res.status}`)
  const json = (await res.json()) as ListFilesResponse
  return json.files as FileDTO[]
}

export async function getFile(id: string): Promise<FileDetailDTO> {
  const res = await fetch(`${PUBLIC_API_URL}/api/files/${id}`, {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`)
  return (await res.json()) as FileDetailDTO
}

export async function initUpload(params: {
  filename: string
  size: number
  mimeType: string
  bucketId: string
}): Promise<UploadInitResponse> {
  const res = await fetch(`${PUBLIC_API_URL}/api/uploads/init`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`initUpload failed: ${res.status}`)
  return (await res.json()) as UploadInitResponse
}

export async function putObject(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!res.ok) throw new Error(`PUT to MinIO failed: ${res.status}`)
}

export async function completeUpload(fileId: string): Promise<FileDTO> {
  const res = await fetch(`${PUBLIC_API_URL}/api/uploads/${fileId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`completeUpload failed: ${res.status}`)
  return (await res.json()) as FileDTO
}

export function downloadUrl(id: string): string {
  return `${PUBLIC_API_URL}/api/files/${id}/download`
}
