/**
 * File helpers shared across components.
 * - fmtBytes / fmtBytesShort: consistent human byte strings
 * - fmtRate: bytes-per-second formatter
 * - walkEntry: recursive File extraction from DataTransferItem entries
 * - filesFromFileList: FileList + webkitRelativePath helper
 * - classifyPreview: mime/extension -> preview category
 */

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Short form, always one decimal in the biggest sane unit. */
export function fmtBytesShort(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)}KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`
  return `${(n / 1024 ** 3).toFixed(1)}GB`
}

export function fmtRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return ''
  return `${fmtBytesShort(bytesPerSec)}/s`
}

export function fmtRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const s = Math.max(1, Math.round((now - then) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/** A file paired with its (optional) relative path, for folder uploads. */
export interface NamedFile {
  file: File
  /** Relative path including filename, e.g. "photos/trip/IMG_001.jpg". */
  path: string
}

/**
 * Recursively walk a FileSystemEntry to collect files with relative paths.
 * Used with `DataTransferItemList.webkitGetAsEntry()` on drop.
 */
export async function walkEntry(
  entry: FileSystemEntry,
  basePath = '',
): Promise<NamedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    return new Promise<NamedFile[]>((resolve, reject) => {
      fileEntry.file(
        (file) => {
          const path = basePath ? `${basePath}/${file.name}` : file.name
          resolve([{ file, path }])
        },
        (err) => reject(err),
      )
    })
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    // readEntries only returns a batch at a time. Loop until empty.
    const all: FileSystemEntry[] = []
    await new Promise<void>((resolve, reject) => {
      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              resolve()
              return
            }
            for (const e of batch) all.push(e)
            readBatch()
          },
          (err) => reject(err),
        )
      }
      readBatch()
    })
    const nextBase = basePath ? `${basePath}/${entry.name}` : entry.name
    const nested = await Promise.all(all.map((e) => walkEntry(e, nextBase)))
    return nested.flat()
  }
  return []
}

/** Extract NamedFiles from a drop event, honoring folder semantics. */
export async function namedFilesFromDrop(
  dt: DataTransfer,
): Promise<NamedFile[]> {
  const items = dt.items
  const out: NamedFile[] = []
  if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === 'function') {
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item == null) continue
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      if (entry != null) entries.push(entry)
    }
    const walked = await Promise.all(entries.map((e) => walkEntry(e)))
    for (const arr of walked) out.push(...arr)
    if (out.length > 0) return out
  }
  // Fallback: plain file list (no folder structure).
  for (const f of Array.from(dt.files)) {
    out.push({ file: f, path: f.name })
  }
  return out
}

/** For `<input webkitdirectory>` or plain `<input multiple>`. */
export function namedFilesFromFileList(list: FileList | null): NamedFile[] {
  if (list == null) return []
  const out: NamedFile[] = []
  for (const f of Array.from(list)) {
    // webkitRelativePath is populated by webkitdirectory inputs.
    type WithRelPath = File & { webkitRelativePath?: string }
    const rel = (f as WithRelPath).webkitRelativePath
    const path = rel && rel.length > 0 ? rel : f.name
    out.push({ file: f, path })
  }
  return out
}

export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'none'

/** Classify a file for preview rendering purposes. */
export function classifyPreview(mimeType: string, name: string): PreviewKind {
  const lower = mimeType.toLowerCase()
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('video/')) return 'video'
  if (lower.startsWith('audio/')) return 'audio'
  if (lower === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (
    lower.startsWith('text/') ||
    ['md', 'markdown', 'txt', 'json', 'csv', 'log', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'sh', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'xml', 'py', 'go', 'rs', 'c', 'cpp', 'h'].includes(ext)
  ) {
    return 'text'
  }
  return 'none'
}

/** Split a display name into (folderPath, basename) for folder-aware rendering. */
export function splitPath(name: string): { dir: string | null; base: string } {
  const idx = name.lastIndexOf('/')
  if (idx < 0) return { dir: null, base: name }
  return { dir: name.slice(0, idx), base: name.slice(idx + 1) }
}

export function fileTypeEmoji(mime: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return '\uD83D\uDDBC'
  if (mime.startsWith('video/')) return '\uD83C\uDF9E'
  if (mime.startsWith('audio/')) return '\uD83C\uDFB5'
  if (ext === 'pdf') return '\uD83D\uDCC4'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return '\uD83D\uDDDC'
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return '\uD83D\uDCDD'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '\uD83D\uDCCA'
  return '\uD83D\uDCCE'
}
