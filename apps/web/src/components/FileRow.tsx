'use client'

import { type FileDTO, FILE_STATE_LABEL } from '@filbucket/shared'
import { useMemo } from 'react'
import { classifyPreview, fmtBytes, fmtRelative } from '../lib/files'
import { useRollingRate } from '../lib/useRollingRate'
import { downloadUrl } from '../lib/api'

/**
 * iCloud Drive-style file row.
 * - Pastel square icon sized to file type.
 * - Name + path prefix (if folder-uploaded).
 * - Soft state pill on the right.
 * - Hover reveals a trailing action cluster (preview, download, delete).
 * - Selected row gets the full pastel-fill treatment (no blue-bar).
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
  // Unified progress:
  //  - Uploading + XHR:  localUploaded / localTotal drives 0..1 on a 0..0.5 scale
  //    (first half of the pipeline).
  //  - hot_ready + server-chunking: 0.5 + serverProgress * 0.5 (second half).
  //  - pdp_committed: 1.0 (secured).
  //  - failed: -1 (sentinel).
  const progress = useMemo(() => computeProgress(file, localUploaded, localTotal), [file, localUploaded, localTotal])

  const rate = useRollingRate(
    file.state === 'uploading' && localUploaded != null ? localUploaded : 0,
  )

  const previewable = classifyPreview(file.mimeType, file.name) !== 'none'
  const parts = file.name.split('/')
  const basename = parts[parts.length - 1] ?? file.name
  const dirpath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

  const rowCls = [
    'group relative grid items-center gap-4 px-4 py-2.5 transition-colors duration-150',
    'grid-cols-[44px_minmax(0,1fr)_96px_auto_auto]',
    selected ? 'bg-sky-fill/70' : 'hover:bg-surface-sunk/70',
  ].join(' ')

  return (
    <div role="button" tabIndex={0} onClick={onSelect} className={rowCls}>
      {/* Icon tile */}
      <FileIcon mime={file.mimeType} name={file.name} state={file.state} />

      {/* Name + path */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-ink">{basename}</span>
          {dirpath && (
            <span className="hidden truncate font-mono text-[11px] text-ink-mute sm:inline">
              {dirpath}
            </span>
          )}
        </div>
        {/* Progress row appears only when active. */}
        {progress >= 0 && progress < 1 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-sky-deep transition-all duration-500 ease-smooth"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-ink-mute">
              {Math.round(progress * 100)}%
              {rate > 0 && file.state === 'uploading' && (
                <span className="ml-1.5 opacity-70">· {fmtBytes(rate)}/s</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Size */}
      <span className="text-right font-mono text-[12px] text-ink-soft">
        {fmtBytes(file.sizeBytes)}
      </span>

      {/* State pill */}
      <StatePill file={file} />

      {/* Added / actions toggle. On hover the added label fades out for actions. */}
      <div className="relative w-[180px]">
        <span className="absolute inset-y-0 right-0 flex items-center font-mono text-[11px] text-ink-mute opacity-100 transition-opacity duration-150 group-hover:opacity-0">
          {fmtRelative(file.createdAt)}
        </span>
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {previewable && file.state !== 'uploading' && file.state !== 'failed' && (
            <RowIconButton
              title="Preview"
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M2 10c2-4 5-6 8-6s6 2 8 6c-2 4-5 6-8 6s-6-2-8-6Z" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </RowIconButton>
          )}
          {file.state !== 'uploading' && file.state !== 'failed' && (
            <RowIconButton
              as="a"
              href={downloadUrl(file.id)}
              download
              title="Download"
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M10 4v10M6 10l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </RowIconButton>
          )}
          <RowIconButton
            title="Delete"
            variant="danger"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M5 6h10M8 6V4h4v2M7 6l.6 10a1 1 0 0 0 1 .95h2.8a1 1 0 0 0 1-.95L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </RowIconButton>
        </div>
      </div>
    </div>
  )
}

function computeProgress(file: FileDTO, localUp?: number, localTot?: number): number {
  if (file.state === 'failed') return -1
  if (file.state === 'pdp_committed') return 1
  // Uploading: use local XHR bytes (0..0.5 range).
  if (file.state === 'uploading') {
    if (localTot != null && localTot > 0 && localUp != null) {
      return Math.min(0.5, (localUp / localTot) * 0.5)
    }
    return 0.05
  }
  // hot_ready: local PUT done, server is chunking to SP. 0.5..1.0 range.
  if (file.state === 'hot_ready') {
    const p = file.progress
    if (p && p.totalBytes > 0) {
      return 0.5 + Math.min(0.5, (p.totalUploaded / p.totalBytes) * 0.5)
    }
    return 0.5
  }
  return 1
}

function StatePill({ file }: { file: FileDTO }) {
  const s = file.state
  const colors = {
    uploading:         { bg: 'bg-sky-fill', fg: 'text-sky-deep', dot: 'bg-sky-deep' },
    hot_ready:         { bg: 'bg-lavender-fill', fg: 'text-lavender-deep', dot: 'bg-lavender-deep' },
    pdp_committed:     { bg: 'bg-mint-fill', fg: 'text-mint-deep', dot: 'bg-mint-deep' },
    archived_cold:     { bg: 'bg-surface-sunk', fg: 'text-ink-soft', dot: 'bg-ink-mute' },
    restore_from_cold: { bg: 'bg-sunflower-fill', fg: 'text-sunflower-deep', dot: 'bg-sunflower-deep' },
    failed:            { bg: 'bg-err-fill', fg: 'text-err', dot: 'bg-err' },
  }[s] ?? { bg: 'bg-surface-sunk', fg: 'text-ink-soft', dot: 'bg-ink-mute' }

  const pulse = s === 'uploading' || s === 'hot_ready' || s === 'restore_from_cold'
  const label = s === 'pdp_committed' ? 'Secured' : (FILE_STATE_LABEL as Record<string, string>)[s] ?? 'Unknown'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${colors.bg} ${colors.fg}`}>
      <span className={`relative inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`}>
        {pulse && (
          <span className={`absolute inset-0 rounded-full ${colors.dot} fb-animate-pulse`} style={{ opacity: 0.5 }} />
        )}
      </span>
      {label}
    </span>
  )
}

function FileIcon({ mime, name, state }: { mime: string; name: string; state: string }) {
  const kind = classifyForIcon(mime, name)
  const palettes = {
    image:  { bg: 'bg-peach-fill', fg: 'text-peach-deep' },
    video:  { bg: 'bg-rose-fill', fg: 'text-rose-deep' },
    audio:  { bg: 'bg-mint-fill', fg: 'text-mint-deep' },
    doc:    { bg: 'bg-sky-fill', fg: 'text-sky-deep' },
    code:   { bg: 'bg-lavender-fill', fg: 'text-lavender-deep' },
    archive:{ bg: 'bg-sunflower-fill', fg: 'text-sunflower-deep' },
    generic:{ bg: 'bg-surface-sunk', fg: 'text-ink-soft' },
  }[kind]

  return (
    <div
      className={[
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] shadow-xs transition-all duration-200',
        palettes.bg,
        palettes.fg,
        state === 'uploading' ? 'fb-animate-pulse' : '',
      ].join(' ')}
      aria-hidden
    >
      {renderIcon(kind)}
    </div>
  )
}

function classifyForIcon(mime: string, name: string): 'image' | 'video' | 'audio' | 'doc' | 'code' | 'archive' | 'generic' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  // Mime first, but fall back to extension because iOS HEIC / raw camera
  // files often come over with mimeType=''.
  if (mime.startsWith('image/') || ['heic', 'heif', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'svg', 'raw', 'cr2', 'nef', 'dng'].includes(ext)) return 'image'
  if (mime.startsWith('video/') || ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'].includes(ext)) return 'video'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'].includes(ext)) return 'audio'
  if (mime === 'application/pdf' || mime.startsWith('text/markdown') || mime.includes('document') || mime === 'text/plain' || ['pdf', 'doc', 'docx', 'md', 'txt', 'rtf', 'pages'].includes(ext)) return 'doc'
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz'].includes(ext)) return 'archive'
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'sh', 'bash', 'zsh', 'json', 'yaml', 'yml', 'toml', 'html', 'htm', 'css', 'scss', 'sass', 'sql', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt', 'lua'].includes(ext)) return 'code'
  return 'generic'
}

function renderIcon(kind: string) {
  // 20×20 stroke-based icons, inherit currentColor.
  switch (kind) {
    case 'image':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" />
          <path d="M3 14l4-3 3 2 4-4 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'video':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <rect x="3" y="5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 9l3-2v6l-3-2" fill="currentColor" />
        </svg>
      )
    case 'audio':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <path d="M8 14V6l8-2v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6.5" cy="14.5" r="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="14.5" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'doc':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7 11h6M7 14h6M7 8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'code':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <path d="M7 7l-3 3 3 3M13 7l3 3-3 3M11 5l-2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'archive':
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <rect x="4" y="3" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 3v4M10 9v2M10 13v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
          <path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
  }
}

function RowIconButton({
  children,
  onClick,
  title,
  variant,
  as = 'button',
  href,
  download,
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  title: string
  variant?: 'default' | 'danger'
  as?: 'button' | 'a'
  href?: string
  download?: boolean
}) {
  const cls = [
    'flex h-8 w-8 items-center justify-center rounded-[10px] transition-all duration-150 ease-spring',
    'hover:scale-[1.08] active:scale-95',
    variant === 'danger'
      ? 'text-ink-soft hover:bg-err-fill hover:text-err'
      : 'text-ink-soft hover:bg-surface-sunk hover:text-ink',
  ].join(' ')

  if (as === 'a') {
    return (
      <a href={href} download={download} title={title} onClick={onClick} className={cls}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {children}
    </button>
  )
}
