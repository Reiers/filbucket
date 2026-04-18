import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'node:stream'
import { env } from '../env.js'

let client: S3Client | null = null

export function s3(): S3Client {
  if (client != null) return client
  const e = env()
  client = new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: e.S3_ACCESS_KEY,
      secretAccessKey: e.S3_SECRET_KEY,
    },
  })
  return client
}

export const s3Bucket = (): string => env().S3_BUCKET

export async function presignPut(key: string, mimeType: string, expiresIn = 900): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: key,
    ContentType: mimeType,
  })
  return getSignedUrl(s3(), cmd, { expiresIn })
}

export async function presignGet(key: string, expiresIn = 900): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: s3Bucket(), Key: key })
  return getSignedUrl(s3(), cmd, { expiresIn })
}

export async function objectExists(key: string): Promise<{ exists: boolean; size: number | null }> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: key }))
    return { exists: true, size: typeof res.ContentLength === 'number' ? res.ContentLength : null }
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || status === 403) return { exists: false, size: null }
    throw err
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }))
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    // 404 is fine — already gone.
    if (status === 404) return
    throw err
  }
}

export async function getObjectStream(key: string): Promise<{ stream: Readable; size: number }> {
  const res = await s3().send(new GetObjectCommand({ Bucket: s3Bucket(), Key: key }))
  if (res.Body == null) {
    throw new Error(`S3 object has no body: ${key}`)
  }
  return {
    stream: res.Body as Readable,
    size: typeof res.ContentLength === 'number' ? res.ContentLength : -1,
  }
}

/**
 * Stream a byte range [start..end] (inclusive) from an S3 object.
 * Used by the chunked durability worker to feed Synapse one piece at a time
 * without ever buffering the full file.
 */
export async function getObjectChunkStream(
  key: string,
  start: number,
  end: number,
): Promise<{ stream: Readable; size: number }> {
  const res = await s3().send(
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Range: `bytes=${start}-${end}`,
    }),
  )
  if (res.Body == null) {
    throw new Error(`S3 object has no body: ${key} (range ${start}-${end})`)
  }
  return {
    stream: res.Body as Readable,
    size: typeof res.ContentLength === 'number' ? res.ContentLength : end - start + 1,
  }
}
