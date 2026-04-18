'use client'

import { type FileDTO } from '@filbucket/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { completeUpload, deleteFile, downloadUrl, initUpload, listFiles, putObject } from '../lib/api'
import { DEFAULT_BUCKET_ID, DEV_USER_ID } from '../lib/env'
import { FileDetailPanel } from '../components/FileDetailPanel'
import { BucketDropzone, type InFlightUpload } from '../components/BucketDropzone'
import { FileRow } from '../components/FileRow'
import { PreviewModal } from '../components/PreviewModal'
import type { NamedFile } from '../lib/files'

interface LocalUpload {
  /** file.name + path used for display */
  displayName: string
  uploaded: number
  total: number
  /** matches FileDTO.id once init has returned */
  fileId: string | null
}

export default function HomePage() {
  const [files, setFiles] = useState<FileDTO[]>([])
  const [uploading, setUploading] = useState<LocalUpload[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewFor, setPreviewFor] = useState<FileDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    async (named: NamedFile) => {
      if (!configOk) return
      const { file, path } = named
      const key = `${path}\u0000${file.size}\u0000${file.lastModified}`
      setUploading((s) => [
        ...s,
        { displayName: path, uploaded: 0, total: file.size, fileId: null },
      ])
      setError(null)
      try {
        const init = await initUpload({
          filename: path, // folder-aware: server sees "sub/dir/file.ext" (max 512 chars)
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
            s.map((u) =>
              u.fileId === init.fileId ? { ...u, uploaded, total } : u,
            ),
          )
        })
        await completeUpload(init.fileId)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((s) => s.filter((u) => u.displayName !== path || u.total !== file.size))
        // Note: the key var intentionally unused here; the filter above is correct.
        void key
      }
    },
    [configOk, refresh],
  )

  const onFiles = useCallback(
    (incoming: NamedFile[]) => {
      // Kick off uploads in parallel but cap concurrency to 3 so we don't overwhelm
      // the browser's XHR pool on giant folder drops.
      const MAX_CONCURRENT = 3
      let idx = 0
      const next = () => {
        while (idx < incoming.length) {
          const n = incoming[idx++]
          if (n == null) continue
          void upload(n).finally(next)
          // Increment concurrency by letting this call queue up; the loop below will
          // break once we've fired MAX_CONCURRENT tasks from this tick.
          if ((idx % MAX_CONCURRENT) === 0) break
        }
      }
      next()
    },
    [upload],
  )

  // Build a lookup: fileId -> local upload bytes (used by FileRow for XHR progress).
  const localByFileId = useMemo(() => {
    const m = new Map<string, { uploaded: number; total: number }>()
    for (const u of uploading) {
      if (u.fileId != null) {
        m.set(u.fileId, { uploaded: u.uploaded, total: u.total })
      }
    }
    return m
  }, [uploading])

  // Feed the bucket dropzone a unified in-flight list. Combines:
  //  - local XHR uploads from `uploading` state (phase 'starting' or 'xhr')
  //  - server-side chunking from /api/files `progress` field (phase 'server')
  const bucketUploads: InFlightUpload[] = useMemo(() => {
    const out: InFlightUpload[] = []
    // First, anything the browser is actively PUT-ing to MinIO.
    const localFileIds = new Set<string>()
    for (const u of uploading) {
      if (u.fileId != null) localFileIds.add(u.fileId)
      out.push({
        displayName: u.displayName,
        uploaded: u.uploaded,
        total: u.total,
        phase: u.fileId == null ? 'starting' : u.uploaded < u.total ? 'xhr' : 'server',
      })
    }
    // Then server-side chunking for files that have progress but no local xhr.
    for (const f of files) {
      if (localFileIds.has(f.id)) continue
      if (f.state === 'hot_ready' && f.progress != null && f.progress.totalBytes > 0 && f.progress.totalUploaded < f.progress.totalBytes) {
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

  return (
    <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10">
      {/* Header */}
      <header className="mb-10 flex items-start gap-5">
        <img
          src="/brand/filbucket-mark.svg"
          alt=""
          width={56}
          height={56}
          className="mt-1 drop-shadow-[0_4px_12px_rgba(184,73,24,0.22)]"
        />
        <div className="min-w-0">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
            FilBucket
          </p>
          <h1
            className="font-serif text-[clamp(2.2rem,5.5vw,3.6rem)] font-medium leading-[1.04] tracking-tight text-ink"
            style={{ fontVariationSettings: '"SOFT" 100, "opsz" 144' }}
          >
            Your files,{' '}
            <em
              className="not-italic text-accent"
              style={{ fontVariationSettings: '"SOFT" 100, "opsz" 144' }}
            >
              kept safe
            </em>{' '}
            in the background.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Drop anything. It lands instantly, and we quietly secure it with redundant,
            verifiable storage. No wallets, no jargon.
          </p>
        </div>
      </header>

      {!configOk && (
        <div className="mb-6 rounded-xl border border-warn/30 bg-warn/5 px-5 py-4 text-sm text-warn">
          Missing <code className="font-mono">NEXT_PUBLIC_DEV_USER_ID</code> /{' '}
          <code className="font-mono">NEXT_PUBLIC_DEFAULT_BUCKET_ID</code>. Run the server
          seed, paste into <code>.env</code>, restart.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-xl border border-err/30 bg-err/5 px-5 py-4 text-sm text-err">
          {error}
        </div>
      )}

      {/* The bucket — now carries its own progress tray. */}
      <BucketDropzone onFiles={onFiles} uploads={bucketUploads} />

      {/* Library */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
            Library · {files.length} {files.length === 1 ? 'item' : 'items'}
          </h2>
        </div>

        {files.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-[0_1px_0_rgba(23,21,19,0.03),0_12px_24px_-18px_rgba(23,21,19,0.12)]">
            <div
              className="grid gap-3 border-b border-line bg-paper/80 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-mute"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 170px 80px 32px' }}
            >
              <span>Name</span>
              <span className="text-right">Size</span>
              <span>Status</span>
              <span className="text-right">Added</span>
              <span />
            </div>
            <ul className="divide-y divide-line/60">
              {files.map((f) => {
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
                            : `Delete “${f.name}”?`
                        if (!window.confirm(verb)) return
                        try {
                          await deleteFile(f.id)
                          if (selectedId === f.id) setSelectedId(null)
                          await refresh()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
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

      {/* Footer */}
      <footer className="mt-16 flex items-center justify-between border-t border-line pt-5 text-[11px] text-ink-mute">
        <p
          className="font-mono uppercase tracking-[0.22em]"
          title="Internal dev environment, running on Filecoin calibration testnet."
        >
          Dev · Calibration
        </p>
        <a
          href="#"
          className="group inline-flex items-center gap-2 opacity-70 transition-opacity hover:opacity-100"
          title="How your files stay safe"
        >
          <span className="font-mono uppercase tracking-wider">Stored on</span>
          <img src="/brand/filecoin.svg" alt="Filecoin" width={14} height={14} />
          <span className="font-sans text-[12px] font-medium text-ink-soft">Filecoin</span>
        </a>
      </footer>

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
    </main>
  )
}

function EmptyState() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-dashed border-line bg-paper-raised/50 px-8 py-14 text-center"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 40% 60% at 50% 100%, rgba(184, 73, 24, 0.08), transparent 70%)',
        }}
      />
      <div className="relative mx-auto mb-5 h-16 w-16 opacity-70">
        <img src="/brand/filbucket-mark.svg" alt="" className="h-full w-full" />
      </div>
      <p
        className="font-serif text-2xl italic text-ink-soft"
        style={{ fontVariationSettings: '"SOFT" 100, "opsz" 100' }}
      >
        An empty bucket, patiently waiting.
      </p>
      <p className="mt-2 text-[13px] text-ink-mute">
        Drop something in above. First it goes{' '}
        <span className="font-medium text-ink-soft">Ready</span>, then{' '}
        <span className="font-medium text-ok">Secured</span>.
      </p>
    </div>
  )
}
