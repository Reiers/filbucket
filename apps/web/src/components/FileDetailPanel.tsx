'use client'

import { type FileDetailDTO, type FileDTO, FILE_STATE_LABEL, type FileState } from '@filbucket/shared'
import { useEffect, useState } from 'react'
import { downloadUrl, getFile } from '../lib/api'
import { ShareModal } from './ShareModal'
import { FilePreview } from './FilePreview'
import { classifyPreview, fmtBytes } from '../lib/files'

export function FileDetailPanel({
  fileId,
  onClose,
  onPreview,
}: {
  fileId: string
  onClose: () => void
  /** Open the big preview modal from outside \u2014 optional. */
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

  const canPreview =
    data != null &&
    (data.state === 'hot_ready' || data.state === 'pdp_committed') &&
    classifyPreview(data.mimeType, data.name) !== 'none'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-paper-raised shadow-[-20px_0_60px_rgba(23,21,19,0.12)]"
      >
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
              File
            </p>
            <h2
              className="mt-1 font-serif text-2xl leading-tight text-ink"
              style={{ fontVariationSettings: '"SOFT" 100, "opsz" 110' }}
            >
              Details
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft transition-colors hover:border-line-strong hover:bg-paper"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-6">
          {err && (
            <div className="mb-6 rounded-xl border border-err/30 bg-err/5 px-4 py-3 text-sm text-err">
              {err}
            </div>
          )}

          {data && (
            <>
              {canPreview && (
                <div className="mb-6">
                  <FilePreview
                    src={downloadUrl(data.id)}
                    mimeType={data.mimeType}
                    name={data.name}
                    sizeBytes={data.sizeBytes}
                    maxHeight={260}
                    rounded="0.85rem"
                  />
                  {onPreview && classifyPreview(data.mimeType, data.name) !== 'audio' && (
                    <button
                      type="button"
                      onClick={() => onPreview({ ...data })}
                      className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink-mute underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-accent hover:decoration-accent"
                    >
                      Open full preview
                    </button>
                  )}
                </div>
              )}

              <div className="mb-8 break-all font-serif text-xl leading-snug text-ink">
                {data.name}
              </div>

              <dl className="space-y-5 text-sm">
                <Row label="Status" value={FILE_STATE_LABEL[data.state as FileState] ?? 'Unknown'} />
                <Row label="Size" value={fmtBytes(data.sizeBytes)} />
                <Row label="Type" value={data.mimeType || 'file'} />
                <Row label="Uploaded" value={new Date(data.createdAt).toLocaleString()} />
                <Row label="Updated" value={new Date(data.updatedAt).toLocaleString()} />
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={downloadUrl(data.id)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5"
                >
                  Download
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v14" />
                    <path d="m6 11 6 6 6-6" />
                    <path d="M4 21h16" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => setShowShare(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper-raised px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
                >
                  Share
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              </div>
              {showShare && (
                <ShareModal
                  fileId={data.id}
                  fileName={data.name}
                  onClose={() => setShowShare(false)}
                />
              )}

              {/* Internal-only technical details. Collapsed. */}
              <details className="mt-10 rounded-xl border border-line bg-paper p-4 text-xs text-ink-soft">
                <summary className="cursor-pointer font-mono uppercase tracking-wider text-ink-mute">
                  Technical details (dev only)
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-1 font-mono uppercase tracking-wider text-ink-mute">
                      Pieces
                    </div>
                    {data.pieces.length === 0 ? (
                      <div className="italic text-ink-mute">none yet</div>
                    ) : (
                      <ul className="space-y-1 font-mono">
                        {data.pieces.map((p) => (
                          <li key={p.id} className="break-all">
                            {p.pieceCid}
                            <span className="text-ink-mute">
                              {' '}
                              · ds={p.datasetId ?? '-'} · sp={p.spProviderId ?? '-'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 font-mono uppercase tracking-wider text-ink-mute">
                      Events
                    </div>
                    <ul className="space-y-1 font-mono">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line/60 pb-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  )
}
