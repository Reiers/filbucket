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

function fmtRelative(iso: string): string {
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

function fileTypeIcon(mime: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return '🖼'
  if (mime.startsWith('video/')) return '🎞'
  if (mime.startsWith('audio/')) return '🎵'
  if (['pdf'].includes(ext)) return '📄'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return '🗜'
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  return '📎'
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

  const pickFiles = () => inputRef.current?.click()

  return (
    <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-24 pt-12 sm:px-10">
      {/* Header */}
      <header className="mb-10 flex items-start gap-5">
        <img
          src="/brand/filbucket-mark.svg"
          alt=""
          width={68}
          height={68}
          className="mt-1 drop-shadow-[0_2px_6px_rgba(26,24,23,0.18)]"
        />
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-mute">
            FilBucket · dev
          </p>
          <h1 className="font-serif text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] tracking-tight text-ink">
            Your files, <span className="italic text-accent">kept safe</span> in the background.
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-soft">
            Drop anything. It lands instantly, and we quietly secure it with redundant, verifiable
            storage. No wallets, no jargon.
          </p>
        </div>
      </header>

      {!configOk && (
        <div className="mb-6 rounded-xl border border-warn/30 bg-warn/5 px-5 py-4 text-sm text-warn">
          Missing <code className="font-mono">NEXT_PUBLIC_DEV_USER_ID</code> /
          <code className="ml-1 font-mono">NEXT_PUBLIC_DEFAULT_BUCKET_ID</code>. Run the server
          seed, paste into <code>.env</code>, restart.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-xl border border-err/30 bg-err/5 px-5 py-4 text-sm text-err">
          {error}
        </div>
      )}

      {/* Dropzone — slimmer than before */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`group relative mb-8 overflow-hidden rounded-xl border bg-paper-raised transition-all ${
          dragging
            ? 'border-accent shadow-[0_0_0_4px_var(--accent-soft)]'
            : 'border-line hover:border-line-strong'
        }`}
      >
        <span className="pointer-events-none absolute left-2.5 top-2.5 h-2 w-2 border-l border-t border-line-strong" />
        <span className="pointer-events-none absolute right-2.5 top-2.5 h-2 w-2 border-r border-t border-line-strong" />
        <span className="pointer-events-none absolute bottom-2.5 left-2.5 h-2 w-2 border-b border-l border-line-strong" />
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 h-2 w-2 border-b border-r border-line-strong" />

        <div className="flex items-center gap-5 px-6 py-8 text-center sm:text-left">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13" />
              <path d="m6 9 6-6 6 6" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-ink">Drop files to upload</p>
            <p className="mt-0.5 text-[13px] text-ink-mute">
              or{' '}
              <button
                type="button"
                onClick={pickFiles}
                className="font-medium text-accent underline decoration-accent/30 decoration-2 underline-offset-[5px] transition-colors hover:decoration-accent"
              >
                choose from your computer
              </button>
            </p>
          </div>
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
        </div>
        {uploading.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line bg-paper/60 px-6 py-2.5">
            {uploading.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-2 rounded-full bg-paper-raised px-2.5 py-0.5 font-mono text-[10px] text-ink-soft"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Library — Finder-compact */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
            Library · {files.length} {files.length === 1 ? 'item' : 'items'}
          </h2>
        </div>

        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-paper-raised/40 px-5 py-8 text-center">
            <p className="font-serif text-lg text-ink-soft">Nothing here yet.</p>
            <p className="mt-1 text-[13px] text-ink-mute">
              Drop a file above and watch it move from Ready to Secured.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-paper-raised">
            {/* Column header */}
            <div className="grid grid-cols-[1fr_80px_110px_72px_28px] gap-3 border-b border-line bg-paper/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-mute">
              <span>Name</span>
              <span className="text-right">Size</span>
              <span>Status</span>
              <span className="text-right">Added</span>
              <span />
            </div>
            <ul className="divide-y divide-line/60">
              {files.map((f) => (
                <li key={f.id}>
                  <div
                    className={`grid w-full grid-cols-[1fr_80px_110px_72px_28px] items-center gap-3 px-3 py-1 text-[13px] transition-colors hover:bg-paper ${
                      selectedId === f.id ? 'bg-accent-soft/50' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(f.id)}
                      className="flex min-w-0 items-center gap-2.5 truncate text-left focus:outline-none"
                    >
                      <span className="text-base leading-none">{fileTypeIcon(f.mimeType, f.name)}</span>
                      <span className="truncate text-ink">{f.name}</span>
                    </button>
                    <span className="text-right font-mono text-[11px] text-ink-mute">
                      {fmtBytes(f.sizeBytes)}
                    </span>
                    <span>
                      <StatusBadge state={f.state as FileState} />
                    </span>
                    <span className="text-right font-mono text-[11px] text-ink-mute">
                      {fmtRelative(f.createdAt)}
                    </span>
                    <span className="flex justify-end">
                      {f.state === 'failed' && (
                        <button
                          type="button"
                          title="Dismiss"
                          onClick={(e) => {
                            e.stopPropagation()
                            // Phase 0: no delete endpoint yet. Open detail for error context.
                            setSelectedId(f.id)
                          }}
                          className="rounded p-1 text-ink-mute hover:bg-err/10 hover:text-err"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Footer — Filecoin trust signal */}
      <footer className="mt-14 flex items-center justify-between border-t border-line pt-4 text-[11px] text-ink-mute">
        <p className="font-mono uppercase tracking-[0.22em]" title="Internal dev environment. Not production.">
          dev environment
        </p>
        <a
          href="#"
          className="group inline-flex items-center gap-2 opacity-70 transition-opacity hover:opacity-100"
          title="Files are durably stored on Filecoin."
        >
          <span className="font-mono uppercase tracking-wider">Stored on</span>
          <img
            src="/brand/filecoin.svg"
            alt="Filecoin"
            width={14}
            height={14}
            className="inline-block"
          />
          <span className="font-sans text-[12px] font-medium text-ink-soft">Filecoin</span>
        </a>
      </footer>

      {selectedId && (
        <FileDetailPanel fileId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </main>
  )
}

function StatusBadge({ state }: { state: FileState }) {
  const label = FILE_STATE_LABEL[state] ?? 'Unknown'
  const styles: Record<FileState, { dot: string; text: string }> = {
    uploading: { dot: 'bg-ink-mute animate-pulse', text: 'text-ink-soft' },
    hot_ready: { dot: 'bg-ink-soft', text: 'text-ink-soft' },
    pdp_committed: { dot: 'bg-ok', text: 'text-ok' },
    archived_cold: { dot: 'bg-ink-mute', text: 'text-ink-mute' },
    restore_from_cold: { dot: 'bg-warn animate-pulse', text: 'text-warn' },
    failed: { dot: 'bg-err', text: 'text-err' },
  }
  const s = styles[state] ?? styles.hot_ready
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  )
}
