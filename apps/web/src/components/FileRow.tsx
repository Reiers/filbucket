'use client'

import { type FileDTO, FILE_STATE_LABEL, type FileState } from '@filbucket/shared'
import { useMemo } from 'react'
import { classifyPreview, fmtBytes, fmtBytesShort, fmtRate, fmtRelative, splitPath } from '../lib/files'
import { useRollingRate } from '../lib/useRollingRate'
import { downloadUrl } from '../lib/api'

/**
 * One row in the Library. Handles its own progress math and rate smoothing.
 *
 * Upload phases:
 *  - Local XHR phase:  `localUploaded` + `localTotal` are driven by the homepage state.
 *  - Server chunking:  `file.progress.totalUploaded / totalBytes` is set by the durability
 *                      worker's `chunk_bytes` events, surfaced via /api/files.
 */
export function FileRow({
  file,
  localUploaded,
  localTotal,
  selected,
  onSelect,
  onPreview,
  onDelete,
}: {
  file: FileDTO
  localUploaded?: number
  localTotal?: number
  selected: boolean
  onSelect: () => void
  onPreview: () => void
  onDelete: () => void
}) {
  const state = file.state as FileState
  const { dir, base } = splitPath(file.name)

  // Compute progress in a unified way.
  const { pct, label, phase } = useMemo(() => {
    if (state === 'uploading' && localTotal != null && localTotal > 0) {
      const up = localUploaded ?? 0
      const p = Math.min(100, (up / localTotal) * 100)
      return {
        pct: p,
        label: `${fmtBytesShort(up)} / ${fmtBytesShort(localTotal)} \u00b7 ${Math.round(p)}%`,
        phase: 'local' as const,
      }
    }
    if (state === 'hot_ready' && file.progress != null && file.progress.totalBytes > 0) {
      const p = Math.min(100, (file.progress.totalUploaded / file.progress.totalBytes) * 100)
      return {
        pct: p,
        label: `${fmtBytesShort(file.progress.totalUploaded)} / ${fmtBytesShort(file.progress.totalBytes)} \u00b7 ${Math.round(p)}%`,
        phase: 'server' as const,
      }
    }
    return { pct: 0, label: '', phase: 'none' as const }
  }, [state, localUploaded, localTotal, file.progress])

  const rateBytes =
    phase === 'local' ? localUploaded ?? 0 : phase === 'server' ? file.progress?.totalUploaded ?? 0 : 0
  const rate = useRollingRate(rateBytes)

  const showProgress = phase !== 'none' && pct < 100
  const previewKind = classifyPreview(file.mimeType, file.name)
  const canPreview =
    (state === 'hot_ready' || state === 'pdp_committed') &&
    previewKind !== 'none'

  // Thumbnail for image files only \u2014 the rest keep a textual icon.
  const thumbSrc =
    previewKind === 'image' && (state === 'hot_ready' || state === 'pdp_committed')
      ? downloadUrl(file.id)
      : null

  return (
    <div
      className={`group/row relative grid w-full items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-paper/70 ${
        selected ? 'bg-accent-soft/40' : ''
      }`}
      style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 170px 80px 32px' }}
    >
      {/* Thin progress line underneath the status column */}
      {showProgress && (
        <ProgressLine pct={pct} indeterminate={phase === 'server' && rate === 0} />
      )}

      {/* Name + thumb */}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 items-center gap-3 truncate text-left focus:outline-none"
      >
        <Thumb thumbSrc={thumbSrc} mimeType={file.mimeType} name={file.name} />
        <div className="min-w-0 flex-1">
          {dir != null && (
            <div className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-mute">
              {dir}
            </div>
          )}
          <div className="truncate text-ink">{base}</div>
        </div>
      </button>

      {/* Size */}
      <span className="text-right font-mono text-[11px] text-ink-mute">
        {fmtBytes(file.sizeBytes)}
      </span>

      {/* Status + live microlabel */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <StatusBadge state={state} />
          {canPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
              className="text-[10px] font-mono uppercase tracking-wider text-ink-mute underline decoration-line-strong decoration-1 underline-offset-[3px] transition-colors hover:text-accent hover:decoration-accent"
              title="Preview"
            >
              view
            </button>
          )}
        </div>
        {showProgress && (
          <span className="truncate font-mono text-[10px] text-ink-mute">
            {label}
            {rate > 0 ? ` \u00b7 ${fmtRate(rate)}` : ''}
          </span>
        )}
      </div>

      {/* Added */}
      <span className="text-right font-mono text-[11px] text-ink-mute">
        {fmtRelative(file.createdAt)}
      </span>

      {/* Delete */}
      <span className="flex justify-end">
        <button
          type="button"
          title={state === 'failed' ? 'Dismiss failed upload' : 'Delete'}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded p-1.5 text-ink-mute opacity-0 transition-opacity hover:bg-err/10 hover:text-err group-hover/row:opacity-100 focus:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </span>
    </div>
  )
}

function ProgressLine({ pct, indeterminate }: { pct: number; indeterminate: boolean }) {
  return (
    <span
      className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-line/60"
      aria-hidden
    >
      {indeterminate ? (
        <span className="indeterminate-bar relative block h-full w-full text-accent" />
      ) : (
        <span
          className="block h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      )}
    </span>
  )
}

function Thumb({
  thumbSrc,
  mimeType,
  name,
}: {
  thumbSrc: string | null
  mimeType: string
  name: string
}) {
  if (thumbSrc != null) {
    return (
      <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border border-line bg-paper-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </span>
    )
  }
  return (
    <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-line bg-paper text-base">
      {emojiFor(mimeType, name)}
    </span>
  )
}

function emojiFor(mime: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return '\uD83D\uDDBC'
  if (mime.startsWith('video/')) return '\uD83C\uDF9E'
  if (mime.startsWith('audio/')) return '\uD83C\uDFB5'
  if (ext === 'pdf') return '\uD83D\uDCC4'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return '\uD83D\uDDDC'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '\uD83D\uDCCA'
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return '\uD83D\uDCDD'
  return '\uD83D\uDCCE'
}

function StatusBadge({ state }: { state: FileState }) {
  const label = FILE_STATE_LABEL[state] ?? 'Unknown'
  const styles: Record<FileState, { dot: string; text: string }> = {
    uploading: { dot: 'bg-medallion animate-pulse', text: 'text-medallion' },
    hot_ready: { dot: 'bg-ink-soft', text: 'text-ink-soft' },
    pdp_committed: { dot: 'bg-ok', text: 'text-ok' },
    archived_cold: { dot: 'bg-ink-mute', text: 'text-ink-mute' },
    restore_from_cold: { dot: 'bg-warn animate-pulse', text: 'text-warn' },
    failed: { dot: 'bg-err', text: 'text-err' },
  }
  const s = styles[state] ?? styles.hot_ready
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  )
}
