'use client'

import { type FileDTO } from '@filbucket/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { completeUpload, deleteFile, downloadUrl, initUpload, listFiles, putObject } from '../lib/api'
import { DEFAULT_BUCKET_ID, DEV_USER_ID } from '../lib/env'
import { FileDetailPanel } from '../components/FileDetailPanel'
import { BucketDropzone, type InFlightUpload } from '../components/BucketDropzone'
import { FileRow } from '../components/FileRow'
import { PreviewModal } from '../components/PreviewModal'
import { Sidebar } from '../components/Sidebar'
import { HelpTip } from '../components/HelpTip'
import { ThemeToggle } from '../components/ThemeToggle'
import type { NamedFile } from '../lib/files'

interface LocalUpload {
  displayName: string
  uploaded: number
  total: number
  fileId: string | null
}

export default function HomePage() {
  const [files, setFiles] = useState<FileDTO[]>([])
  const [uploading, setUploading] = useState<LocalUpload[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewFor, setPreviewFor] = useState<FileDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  // ⌘K / Ctrl-K focuses the search field. Esc while focused clears + blurs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const configOk = Boolean(DEV_USER_ID && DEFAULT_BUCKET_ID)

  const refresh = useCallback(async () => {
    if (!configOk) return
    try {
      setFiles(await listFiles(DEFAULT_BUCKET_ID))
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
    async (named: NamedFile) => {
      if (!configOk) return
      const { file, path } = named
      setUploading((s) => [...s, { displayName: path, uploaded: 0, total: file.size, fileId: null }])
      setError(null)
      try {
        const init = await initUpload({
          filename: path,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          bucketId: DEFAULT_BUCKET_ID,
        })
        setUploading((s) =>
          s.map((u) =>
            u.displayName === path && u.total === file.size && u.fileId == null
              ? { ...u, fileId: init.fileId }
              : u,
          ),
        )
        await putObject(init.uploadUrl, file, (uploaded, total) => {
          setUploading((s) =>
            s.map((u) => (u.fileId === init.fileId ? { ...u, uploaded, total } : u)),
          )
        })
        await completeUpload(init.fileId)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((s) => s.filter((u) => u.displayName !== path || u.total !== file.size))
      }
    },
    [configOk, refresh],
  )

  const onFiles = useCallback(
    (incoming: NamedFile[]) => {
      const MAX_CONCURRENT = 3
      let idx = 0
      const next = () => {
        while (idx < incoming.length) {
          const n = incoming[idx++]
          if (n == null) continue
          void upload(n).finally(next)
          if (idx % MAX_CONCURRENT === 0) break
        }
      }
      next()
    },
    [upload],
  )

  const localByFileId = useMemo(() => {
    const m = new Map<string, { uploaded: number; total: number }>()
    for (const u of uploading) if (u.fileId) m.set(u.fileId, { uploaded: u.uploaded, total: u.total })
    return m
  }, [uploading])

  const bucketUploads: InFlightUpload[] = useMemo(() => {
    const out: InFlightUpload[] = []
    const known = new Set<string>()
    for (const u of uploading) {
      if (u.fileId) known.add(u.fileId)
      out.push({
        displayName: u.displayName,
        uploaded: u.uploaded,
        total: u.total,
        phase: u.fileId == null ? 'starting' : u.uploaded < u.total ? 'xhr' : 'server',
      })
    }
    for (const f of files) {
      if (known.has(f.id)) continue
      if (f.state === 'hot_ready' && f.progress && f.progress.totalBytes > 0 && f.progress.totalUploaded < f.progress.totalBytes) {
        out.push({
          displayName: f.name,
          uploaded: f.progress.totalUploaded,
          total: f.progress.totalBytes,
          phase: 'server',
        })
      }
    }
    return out
  }, [uploading, files])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.name.toLowerCase().includes(q))
  }, [files, query])

  // Counts for sidebar badges.
  const counts = useMemo(() => {
    const c = { total: files.length, uploading: 0, ready: 0, secured: 0, failed: 0 }
    for (const f of files) {
      if (f.state === 'uploading') c.uploading++
      else if (f.state === 'hot_ready') c.ready++
      else if (f.state === 'pdp_committed') c.secured++
      else if (f.state === 'failed') c.failed++
    }
    return c
  }, [files])

  return (
    <div className="relative z-10 min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-[260px_1fr]">
        <Sidebar counts={counts} activeRoute="/" />

        <main className="flex flex-col px-8 pb-20 pt-8 lg:px-12">
          {/* Top bar */}
          <header className="mb-8 flex items-center gap-4">
            <div className="flex-1">
              <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">Bucket</h1>
              <p className="mt-1 text-[13px] text-ink-soft">
                {counts.total === 0
                  ? 'Your bucket is empty. Drop anything below to get started.'
                  : `${counts.total} ${counts.total === 1 ? 'item' : 'items'}${counts.uploading + counts.ready > 0 ? ` · ${counts.uploading + counts.ready} still saving` : ''}`}
              </p>
            </div>
            <SearchField value={query} onChange={setQuery} inputRef={searchRef} />
            <ThemeToggle />
          </header>

          {!configOk && (
            <div className="mb-6 rounded-tile border border-warn/20 bg-warn-fill px-5 py-4 text-[13px] text-warn">
              <strong className="font-semibold">Almost there.</strong> Missing{' '}
              <code className="font-mono">NEXT_PUBLIC_DEV_USER_ID</code>/
              <code className="font-mono">NEXT_PUBLIC_DEFAULT_BUCKET_ID</code>. Restart the dev stack.
            </div>
          )}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-tile border border-err/20 bg-err-fill px-5 py-4 text-[13px] text-err">
              <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
                <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 5h2v6H9V7Zm0 7h2v2H9v-2Z" />
              </svg>
              <span className="min-w-0 break-words">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold hover:bg-err/10"
              >
                Dismiss
              </button>
            </div>
          )}

          <BucketDropzone onFiles={onFiles} uploads={bucketUploads} />

          {/* Library */}
          <section className="mt-10 flex-1">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-[15px] font-semibold text-ink">
                {query ? 'Results' : 'Recent'}
              </h2>
              <span className="font-mono text-[11px] text-ink-mute">
                {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <div className="overflow-hidden rounded-tile bg-surface shadow-sm ring-1 ring-line/60">
                <div className="grid items-center gap-4 border-b border-line/60 bg-surface-sunk/40 px-4 py-2.5 text-[12px] font-semibold text-ink-soft grid-cols-[44px_minmax(0,1fr)_96px_140px_180px]">
                  <span />
                  <span>Name</span>
                  <span className="text-right">Size</span>
                  <span className="flex items-center justify-center gap-1.5">
                    Status
                    <HelpTip text="Uploading → Saving → Secured. Secured means your file is redundantly stored with on-chain verifiable proofs." />
                  </span>
                  <span className="text-right">Added</span>
                </div>
                <ul className="divide-y divide-line/40">
                  {filtered.map((f) => {
                    const local = localByFileId.get(f.id)
                    return (
                      <li key={f.id}>
                        <FileRow
                          file={f}
                          localUploaded={local?.uploaded}
                          localTotal={local?.total}
                          selected={selectedId === f.id}
                          onSelect={() => setSelectedId(f.id)}
                          onPreview={() => setPreviewFor(f)}
                          onDelete={async () => {
                            const verb =
                              f.state === 'failed'
                                ? 'Dismiss this failed upload?'
                                : `Delete "${f.name.split('/').pop()}"?`
                            if (!window.confirm(verb)) return
                            try {
                              await deleteFile(f.id)
                              if (selectedId === f.id) setSelectedId(null)
                              await refresh()
                            } catch (e) {
                              setError(e instanceof Error ? e.message : String(e))
                            }
                          }}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        </main>
      </div>

      {selectedId && (
        <FileDetailPanel
          fileId={selectedId}
          onClose={() => setSelectedId(null)}
          onPreview={(f) => setPreviewFor(f)}
        />
      )}

      {previewFor && (
        <PreviewModal
          src={downloadUrl(previewFor.id)}
          mimeType={previewFor.mimeType}
          name={previewFor.name}
          sizeBytes={previewFor.sizeBytes}
          onClose={() => setPreviewFor(null)}
        />
      )}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div className="group relative w-72">
      <svg
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
        fill="none"
      >
        <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('')
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder="Search your bucket"
        className="w-full rounded-pill bg-surface-sunk py-2 pl-9 pr-16 text-[13px] text-ink placeholder:text-ink-mute ring-1 ring-transparent transition-all duration-150 focus:bg-surface focus:outline-none focus:ring-sky-deep/30"
      />
      {!value && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-mute shadow-xs ring-1 ring-line">
          ⌘K
        </kbd>
      )}
    </div>
  )
}

function EmptyState({ query }: { query: string }) {
  if (query) {
    return (
      <div className="rounded-tile bg-surface px-8 py-12 text-center shadow-xs ring-1 ring-line/60">
        <p className="text-[15px] font-semibold text-ink">No matches for &ldquo;{query}&rdquo;</p>
        <p className="mt-1 text-[13px] text-ink-soft">Try a different name or clear the search.</p>
      </div>
    )
  }
  return (
    <div className="rounded-tile bg-surface px-8 py-14 text-center shadow-xs ring-1 ring-line/60">
      <div className="mx-auto mb-4 h-14 w-14 opacity-80">
        <img src="/brand/filbucket-mark.svg" alt="" className="h-full w-full" />
      </div>
      <p className="text-[15px] font-semibold text-ink">Your bucket is empty.</p>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        First drop, first file. Everything else comes easy from here.
      </p>
    </div>
  )
}
