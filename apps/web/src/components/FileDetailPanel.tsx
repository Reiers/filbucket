'use client'

import { type FileDetailDTO, FILE_STATE_LABEL, type FileState } from '@filbucket/shared'
import { useEffect, useState } from 'react'
import { downloadUrl, getFile } from '../lib/api'

export function FileDetailPanel({
  fileId,
  onClose,
}: {
  fileId: string
  onClose: () => void
}) {
  const [data, setData] = useState<FileDetailDTO | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
    return () => {
      cancelled = true
    }
  }, [fileId])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">File details</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {err}
          </div>
        )}

        {data && (
          <>
            <dl className="mt-6 space-y-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt>
                <dd className="mt-1 break-all font-medium">{data.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="mt-1">{FILE_STATE_LABEL[data.state as FileState]}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Uploaded</dt>
                <dd className="mt-1">{new Date(data.createdAt).toLocaleString()}</dd>
              </div>
            </dl>

            <a
              href={downloadUrl(data.id)}
              className="mt-6 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Download
            </a>

            {/* Advanced/technical details — collapsed by default. NOT user-facing. */}
            <details className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-medium text-slate-600">
                Technical details (Phase 0 debug only)
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="font-semibold">Pieces</div>
                  {data.pieces.length === 0 ? (
                    <div className="text-slate-500">none yet</div>
                  ) : (
                    <ul className="mt-1 space-y-1 font-mono">
                      {data.pieces.map((p) => (
                        <li key={p.id} className="break-all">
                          {p.pieceCid} · ds={p.datasetId ?? '-'} · sp={p.spProviderId ?? '-'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-semibold">Events</div>
                  <ul className="mt-1 space-y-1 font-mono">
                    {data.events.map((e) => (
                      <li key={e.id} className="break-all">
                        {new Date(e.createdAt).toLocaleTimeString()} · {e.kind}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </>
        )}
      </aside>
    </div>
  )
}
