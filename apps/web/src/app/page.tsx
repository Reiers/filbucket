'use client'

import { type FileDTO, FILE_STATE_LABEL, type FileState } from '@filbucket/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { completeUpload, initUpload, listFiles, putObject } from '../lib/api'
import { DEFAULT_BUCKET_ID, DEV_USER_ID } from '../lib/env'
import { FileDetailPanel } from '../components/FileDetailPanel'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default function HomePage() {
  const [files, setFiles] = useState<FileDTO[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const configOk = Boolean(DEV_USER_ID && DEFAULT_BUCKET_ID)

  const refresh = useCallback(async () => {
    if (!configOk) return
    try {
      const rows = await listFiles(DEFAULT_BUCKET_ID)
      setFiles(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [configOk])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 3000)
    return () => clearInterval(id)
  }, [refresh])

  const upload = useCallback(
    async (file: File) => {
      if (!configOk) return
      setUploading((s) => [...s, file.name])
      setError(null)
      try {
        const init = await initUpload({
          filename: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          bucketId: DEFAULT_BUCKET_ID,
        })
        await putObject(init.uploadUrl, file)
        await completeUpload(init.fileId)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((s) => s.filter((n) => n !== file.name))
      }
    },
    [configOk, refresh],
  )

  const onDrop = useCallback(
    (evt: React.DragEvent<HTMLDivElement>) => {
      evt.preventDefault()
      setDragging(false)
      const dropped = Array.from(evt.dataTransfer.files)
      for (const f of dropped) void upload(f)
    },
    [upload],
  )

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">FilBucket</h1>
      </header>

      {!configOk && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set <code className="font-mono">NEXT_PUBLIC_DEV_USER_ID</code> and{' '}
          <code className="font-mono">NEXT_PUBLIC_DEFAULT_BUCKET_ID</code> in{' '}
          <code>.env.local</code> (see README). Run the server seed script to get these values.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mb-8 cursor-pointer rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? 'border-slate-900 bg-white' : 'border-slate-300 bg-white/60'
        }`}
      >
        <p className="text-sm text-slate-600">
          Drop files here, or click to choose.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            for (const f of picked) void upload(f)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
        {uploading.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Uploading: {uploading.join(', ')}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">Size</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {files.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No files yet.
                </td>
              </tr>
            )}
            {files.map((f) => (
              <tr
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium text-slate-900">{f.name}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {fmtBytes(f.sizeBytes)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge state={f.state as FileState} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <FileDetailPanel fileId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </main>
  )
}

function StatusBadge({ state }: { state: FileState }) {
  const label = FILE_STATE_LABEL[state] ?? 'Unknown'
  const tone: Record<FileState, string> = {
    uploading: 'bg-slate-100 text-slate-700',
    hot_ready: 'bg-sky-100 text-sky-800',
    pdp_committed: 'bg-emerald-100 text-emerald-800',
    archived_cold: 'bg-slate-200 text-slate-700',
    restore_from_cold: 'bg-amber-100 text-amber-800',
    failed: 'bg-rose-100 text-rose-800',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone[state] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {label}
    </span>
  )
}
