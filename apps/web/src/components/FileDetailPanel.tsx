'use client'

import { type FileDetailDTO, type FileDTO, FILE_STATE_LABEL, type FileState } from '@filbucket/shared'
import { useEffect, useState } from 'react'
import { downloadUrl, getFile } from '../lib/api'
import { ShareModal } from './ShareModal'
import { FilePreview } from './FilePreview'
import { classifyPreview, fmtBytes } from '../lib/files'

/**
 * Right-slide sheet showing full file detail.
 * iCloud style: frosted glass card, rounded, soft shadow. Click outside to close.
 */
export function FileDetailPanel({
  fileId,
  onClose,
  onPreview,
}: {
  fileId: string
  onClose: () => void
  onPreview?: (f: FileDTO) => void
}) {
  const [data, setData] = useState<FileDetailDTO | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const row = await getFile(fileId)
        if (!cancelled) setData(row)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      }
    }
    void run()
    const t = setInterval(run, 3000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [fileId])

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canPreview =
    data != null &&
    (data.state === 'hot_ready' || data.state === 'pdp_committed') &&
    classifyPreview(data.mimeType, data.name) !== 'none'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/20 backdrop-blur-[3px] fb-animate-fade-in"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="fb-animate-sheet-up relative my-3 mr-3 flex h-[calc(100vh-1.5rem)] w-full max-w-[420px] flex-col overflow-hidden rounded-tile-lg bg-surface shadow-xl ring-1 ring-line/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/60 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
            File details
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-all duration-150 ease-spring hover:scale-[1.08] hover:bg-surface-sunk hover:text-ink active:scale-95"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {err && (
            <div className="mb-6 rounded-tile border border-err/20 bg-err-fill px-4 py-3 text-[13px] text-err">
              {err}
            </div>
          )}

          {!data && !err && (
            <div className="space-y-3 py-6">
              <div className="fb-shimmer h-32 rounded-tile bg-surface-sunk" />
              <div className="fb-shimmer h-5 w-3/4 rounded-full bg-surface-sunk" />
              <div className="fb-shimmer h-4 w-1/2 rounded-full bg-surface-sunk" />
            </div>
          )}

          {data && (
            <>
              {canPreview && (
                <div className="mb-6 overflow-hidden rounded-tile bg-surface-sunk">
                  <FilePreview
                    src={downloadUrl(data.id)}
                    mimeType={data.mimeType}
                    name={data.name}
                    sizeBytes={data.sizeBytes}
                    maxHeight={280}
                    rounded="0.75rem"
                  />
                  {onPreview && classifyPreview(data.mimeType, data.name) !== 'audio' && (
                    <button
                      type="button"
                      onClick={() => onPreview({ ...data })}
                      className="w-full border-t border-line/60 py-2 text-[12px] font-semibold text-sky-deep transition-colors hover:bg-sky-fill/40"
                    >
                      Open full preview
                    </button>
                  )}
                </div>
              )}

              {/* File name + type chip */}
              <div className="mb-6">
                <h2 className="break-words text-[20px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">
                  {(data.name.split('/').pop() ?? data.name)}
                </h2>
                {data.name.includes('/') && (
                  <p className="mt-1 font-mono text-[11px] text-ink-mute">
                    in {data.name.split('/').slice(0, -1).join('/')}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="mb-7 flex flex-wrap gap-2">
                <a
                  href={downloadUrl(data.id)}
                  download
                  className="inline-flex items-center gap-2 rounded-pill bg-sky-deep px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 ease-spring hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                    <path d="M10 4v10M6 10l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 16h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setShowShare(true)}
                  className="inline-flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-sm ring-1 ring-line transition-all duration-200 ease-spring hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                    <path d="M10 4v8M7 7l3-3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 14v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Share
                </button>
              </div>

              {/* Meta grid */}
              <dl className="overflow-hidden rounded-tile bg-surface-sunk/60 ring-1 ring-line/40">
                <MetaRow
                  label="Status"
                  value={<StatusChip state={data.state as FileState} />}
                />
                <MetaRow label="Size" value={<span className="font-mono text-[13px] text-ink">{fmtBytes(data.sizeBytes)}</span>} />
                <MetaRow label="Kind" value={<span className="truncate text-[13px] text-ink">{humanKind(data.mimeType)}</span>} />
                <MetaRow
                  label="Added"
                  value={<span className="text-[13px] text-ink">{new Date(data.createdAt).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}</span>}
                />
                {data.updatedAt !== data.createdAt && (
                  <MetaRow
                    label="Updated"
                    value={<span className="text-[13px] text-ink">{new Date(data.updatedAt).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}</span>}
                  />
                )}
              </dl>

              {showShare && (
                <ShareModal
                  fileId={data.id}
                  fileName={data.name}
                  onClose={() => setShowShare(false)}
                />
              )}

              {/* Dev-only technical details. Collapsed by default. */}
              <details className="mt-6 rounded-tile bg-surface-sunk/40 text-[12px]">
                <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                  Dev · technical
                </summary>
                <div className="space-y-4 border-t border-line/40 px-4 py-4 text-ink-soft">
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
                      Pieces
                    </div>
                    {data.pieces.length === 0 ? (
                      <div className="italic text-ink-mute">none yet</div>
                    ) : (
                      <ul className="space-y-1 font-mono text-[11px]">
                        {data.pieces.map((p) => (
                          <li key={p.id} className="break-all">
                            {p.pieceCid}
                            <span className="text-ink-mute">
                              {' · '}ds={p.datasetId ?? '-'}{' · '}sp={p.spProviderId ?? '-'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
                      Events
                    </div>
                    <ul className="space-y-1 font-mono text-[11px]">
                      {data.events.map((e) => (
                        <li key={e.id}>
                          <span className="text-ink-mute">
                            {new Date(e.createdAt).toLocaleTimeString()}
                          </span>{' '}
                          {e.kind}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/40 px-4 py-3 last:border-b-0">
      <dt className="text-[12px] font-medium text-ink-mute">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  )
}

function StatusChip({ state }: { state: FileState }) {
  const palettes = {
    uploading:         { bg: 'bg-sky-fill', fg: 'text-sky-deep', dot: 'bg-sky-deep' },
    hot_ready:         { bg: 'bg-lavender-fill', fg: 'text-lavender-deep', dot: 'bg-lavender-deep' },
    pdp_committed:     { bg: 'bg-mint-fill', fg: 'text-mint-deep', dot: 'bg-mint-deep' },
    archived_cold:     { bg: 'bg-surface-sunk', fg: 'text-ink-soft', dot: 'bg-ink-mute' },
    restore_from_cold: { bg: 'bg-sunflower-fill', fg: 'text-sunflower-deep', dot: 'bg-sunflower-deep' },
    failed:            { bg: 'bg-err-fill', fg: 'text-err', dot: 'bg-err' },
  }[state] ?? { bg: 'bg-surface-sunk', fg: 'text-ink-soft', dot: 'bg-ink-mute' }

  const label = state === 'pdp_committed' ? 'Secured' : FILE_STATE_LABEL[state] ?? 'Unknown'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${palettes.bg} ${palettes.fg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${palettes.dot}`} />
      {label}
    </span>
  )
}

function humanKind(mime: string): string {
  if (!mime) return 'File'
  if (mime === 'application/pdf') return 'PDF Document'
  if (mime.startsWith('image/')) return `Image · ${mime.split('/')[1]?.toUpperCase()}`
  if (mime.startsWith('video/')) return `Video · ${mime.split('/')[1]?.toUpperCase()}`
  if (mime.startsWith('audio/')) return `Audio · ${mime.split('/')[1]?.toUpperCase()}`
  if (mime.startsWith('text/')) return `Text · ${mime.split('/')[1] ?? ''}`
  const last = mime.split('/').pop()
  return last ? last.toUpperCase() : 'File'
}
