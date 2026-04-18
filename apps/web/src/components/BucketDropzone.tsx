'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { namedFilesFromDrop, namedFilesFromFileList, type NamedFile } from '../lib/files'

type BucketState = 'idle' | 'drag' | 'filling'

export interface InFlightUpload {
  /** Human-displayable filename (with path). */
  displayName: string
  uploaded: number
  total: number
  /** 'xhr' = browser→MinIO; 'server' = server→SP chunking; 'starting' = pre-init */
  phase: 'starting' | 'xhr' | 'server'
}

/**
 * Interactive bucket dropzone with real progress visualization.
 *
 * States:
 *  - idle:    bucket breathes calmly, handle rests, mouth closed.
 *  - drag:    lid lifts + tilts, mouth opens, glow beneath the rim.
 *  - filling: mouth stays partially open, internal liquid level rises with
 *             average upload progress, soft wobble on the body, droplets fall.
 */
export function BucketDropzone({
  onFiles,
  uploads,
}: {
  onFiles: (files: NamedFile[]) => void
  /** Per-file progress tracked by the parent. Empty = idle/drag-only. */
  uploads: InFlightUpload[]
}) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)

  // Dev-only state override via hash.
  const [debugState, setDebugState] = useState<BucketState | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      const h = window.location.hash
      if (h === '#debug-drag') setDebugState('drag')
      else if (h === '#debug-fill') setDebugState('filling')
      else setDebugState(null)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      dragDepthRef.current += 1
      e.preventDefault()
      setDragOver(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDragOver(false)
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      dragDepthRef.current = 0
      setDragOver(false)
      const dt = e.dataTransfer
      if (dt == null) return
      const files = await namedFilesFromDrop(dt)
      if (files.length > 0) onFiles(files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFiles])

  // Derive bucket state.
  const actual: BucketState = dragOver
    ? 'drag'
    : uploads.length > 0
      ? 'filling'
      : 'idle'
  const state: BucketState = debugState ?? actual

  // Average progress across all uploads (weighted by total bytes).
  const overall = useMemo(() => {
    if (uploads.length === 0) return { pct: 0, totalBytes: 0, totalUploaded: 0 }
    let u = 0
    let t = 0
    for (const up of uploads) {
      u += up.uploaded
      t += up.total
    }
    return {
      pct: t > 0 ? Math.min(100, (u / t) * 100) : 0,
      totalBytes: t,
      totalUploaded: u,
    }
  }, [uploads])

  const pickFiles = () => fileInputRef.current?.click()
  const pickFolder = () => folderInputRef.current?.click()

  const prompt =
    state === 'drag'
      ? "Let go — we've got it."
      : state === 'filling'
        ? uploads.length === 1
          ? 'Catching your file…'
          : `Catching ${uploads.length} files…`
        : 'Drop files in the bucket'

  const sub =
    state === 'drag'
      ? 'Folders welcome. Anything, really.'
      : state === 'filling'
        ? `${fmtBytesShort(overall.totalUploaded)} of ${fmtBytesShort(overall.totalBytes)} landed.`
        : 'Or pick from your computer. Folders keep their shape.'

  return (
    <section
      aria-label="Upload bucket"
      className={`relative isolate mb-10 overflow-hidden rounded-3xl border bg-paper-raised transition-colors ${
        state === 'drag' ? 'border-medallion/60 shadow-[0_0_0_6px_rgba(60,167,255,0.12)]' : 'border-line'
      }`}
    >
      {/* Ambient lighting: warm accent from below, blue from above, amplified during drag */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: state === 'idle' ? 0.6 : 1,
          background:
            'radial-gradient(ellipse 65% 85% at 50% 118%, rgba(11, 111, 192, 0.14), transparent 60%), radial-gradient(ellipse 55% 60% at 50% -8%, rgba(184, 73, 24, 0.08), transparent 60%)',
        }}
      />
      {/* Editorial corner marks */}
      <span className="pointer-events-none absolute left-3 top-3 h-2.5 w-2.5 border-l border-t border-line-strong" />
      <span className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 border-r border-t border-line-strong" />
      <span className="pointer-events-none absolute bottom-3 left-3 h-2.5 w-2.5 border-b border-l border-line-strong" />
      <span className="pointer-events-none absolute bottom-3 right-3 h-2.5 w-2.5 border-b border-r border-line-strong" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 pt-12 pb-8 sm:px-10 sm:pt-16">
        <BucketArt state={state} fillPct={overall.pct} fileCount={uploads.length} />

        <div className="text-center">
          <p
            className="font-serif text-[clamp(1.6rem,3.6vw,2.4rem)] italic leading-tight tracking-tight text-ink"
            style={{ fontVariationSettings: '"SOFT" 80, "opsz" 60' }}
          >
            {prompt}
          </p>
          <p className="mt-2 text-[14px] text-ink-soft">{sub}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={pickFiles}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-all hover:-translate-y-0.5 hover:bg-accent-deep focus:outline-none"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v13" />
              <path d="m6 9 6-6 6 6" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Upload files
          </button>
          <button
            type="button"
            onClick={pickFolder}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper-raised px-5 py-2.5 text-sm font-medium text-ink transition-all hover:-translate-y-0.5 hover:bg-paper focus:outline-none"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
            Upload folder
          </button>
        </div>
      </div>

      {/* In-flight progress tray (real bars). Folded into the dropzone so the
          progress lives visually "with" the bucket, not elsewhere on the page. */}
      {uploads.length > 0 && (
        <div className="relative z-10 border-t border-line bg-paper/70 backdrop-blur-sm">
          {/* Overall bar */}
          <div className="relative h-[3px] w-full overflow-hidden bg-line/60">
            <span
              className="block h-full bg-medallion transition-all duration-300 ease-out"
              style={{ width: `${overall.pct.toFixed(1)}%` }}
            />
          </div>
          <ul className="max-h-[180px] divide-y divide-line/60 overflow-y-auto px-5 py-2">
            {uploads.slice(0, 10).map((u, i) => (
              <ProgressRow key={`${u.displayName}-${i}`} upload={u} />
            ))}
            {uploads.length > 10 && (
              <li className="px-0 py-1.5 text-center font-mono text-[10px] text-ink-mute">
                + {uploads.length - 10} more…
              </li>
            )}
          </ul>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = namedFilesFromFileList(e.target.files)
          if (picked.length > 0) onFiles(picked)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        /* @ts-expect-error -- webkitdirectory is non-standard but universally supported */
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          const picked = namedFilesFromFileList(e.target.files)
          if (picked.length > 0) onFiles(picked)
          if (folderInputRef.current) folderInputRef.current.value = ''
        }}
      />
    </section>
  )
}

function ProgressRow({ upload }: { upload: InFlightUpload }) {
  const pct = upload.total > 0 ? Math.min(100, (upload.uploaded / upload.total) * 100) : 0
  const phaseLabel =
    upload.phase === 'starting' ? 'starting…' : upload.phase === 'xhr' ? 'uploading' : 'securing'
  const phaseColor =
    upload.phase === 'starting'
      ? 'bg-ink-mute'
      : upload.phase === 'xhr'
        ? 'bg-medallion'
        : 'bg-accent'
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className={`h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full ${phaseColor}`} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
        {upload.displayName}
      </span>
      <span className="relative h-[3px] w-40 overflow-hidden rounded-full bg-line/60">
        {upload.phase === 'starting' ? (
          <span className="indeterminate-bar absolute inset-0 text-ink-mute" />
        ) : (
          <span
            className={`block h-full transition-all duration-300 ease-out ${phaseColor}`}
            style={{ width: `${pct.toFixed(1)}%` }}
          />
        )}
      </span>
      <span className="w-10 text-right font-mono text-[10px] text-ink-mute tabular-nums">
        {upload.phase === 'starting' ? '—' : `${Math.round(pct)}%`}
      </span>
      <span className="w-14 text-right font-mono text-[10px] text-ink-mute/80">
        {phaseLabel}
      </span>
    </li>
  )
}

function hasFiles(dt: DataTransfer | null): boolean {
  if (dt == null) return false
  const types = dt.types
  if (!types) return false
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true
  }
  return false
}

function fmtBytesShort(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/* --------------------------------------------------------------------------
 * The bucket illustration.
 *
 * Built to match /brand/filbucket-mark.svg precisely:
 *  - Filecoin-blue gradient body
 *  - Bail handle
 *  - Dark ellipse for the mouth (revealed when lid tilts)
 *  - REAL Filecoin 'f' glyph on the front (verbatim path from filecoin.svg)
 *
 * State transitions:
 *  - idle → drag:    lid tilts open 22°, translates up+left, mouth exposed,
 *                    blue inner glow, droplet particles above the rim.
 *  - drag → filling: lid rests slightly ajar, bucket gains a subtle sway,
 *                    internal fill level rises with `fillPct`, droplets fall.
 * ------------------------------------------------------------------------ */

function BucketArt({
  state,
  fillPct,
  fileCount,
}: {
  state: BucketState
  fillPct: number
  fileCount: number
}) {
  const isDrag = state === 'drag'
  const isFill = state === 'filling'

  // Lid transform — eased tilt during drag, slight ajar while filling.
  const lidTransform = isDrag
    ? 'translate(-50%, -28px) rotate(-18deg)'
    : isFill
      ? 'translate(-50%, -8px) rotate(-6deg)'
      : 'translate(-50%, 0px) rotate(0deg)'

  // Body wobble classes.
  const bodyClass = isFill ? 'bucket-body-sway' : state === 'idle' ? 'bucket-body-breathe' : ''

  return (
    <div
      className="relative"
      style={{ width: 240, height: 240 }}
      aria-hidden
    >
      {/* Cast shadow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 transition-all duration-500"
        style={{
          bottom: 2,
          width: isDrag ? 200 : 170,
          height: 16,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(11, 21, 40, 0.32) 0%, rgba(11, 21, 40, 0.08) 55%, transparent 75%)',
          filter: 'blur(2px)',
          animation: isFill ? 'shadow-breathe 2.4s ease-in-out infinite' : undefined,
        }}
      />

      {/* Ambient cyan glow in the mouth when exposed */}
      {(isDrag || isFill) && (
        <div
          className="absolute left-1/2 top-[30%] -translate-x-1/2 transition-opacity duration-300"
          style={{
            width: 180,
            height: 54,
            background:
              'radial-gradient(ellipse at center, rgba(60, 167, 255, 0.5) 0%, transparent 70%)',
            filter: 'blur(10px)',
            opacity: isDrag ? 0.9 : 0.55,
          }}
        />
      )}

      {/* Drop particles coming down while filling */}
      {isFill && fileCount > 0 && (
        <>
          {[0, 1, 2].map((i) => (
            <span
              key={`drop-${i}`}
              className="absolute block rounded-full bg-medallion/80"
              style={{
                left: `${44 + i * 6}%`,
                top: -10,
                width: 5,
                height: 5,
                animation: `droplet-fall 1.6s ${i * 0.3}s ease-in infinite`,
              }}
            />
          ))}
        </>
      )}

      {/* Splash rising on initial drag */}
      {isDrag && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={`splash-${i}`}
              className="absolute block rounded-full"
              style={{
                left: `${38 + i * 6}%`,
                top: 40 + (i % 2) * 8,
                width: 5 + (i % 2),
                height: 5 + (i % 2),
                background: i % 2 === 0 ? 'var(--accent)' : '#3ca7ff',
                opacity: 0.82,
                animation: `splash-rise 1.4s ${i * 0.15}s ease-out infinite`,
              }}
            />
          ))}
        </>
      )}

      {/* The lid */}
      <div
        className="absolute left-1/2 transition-transform duration-500 ease-out will-change-transform"
        style={{
          top: 30,
          transform: lidTransform,
          transformOrigin: '80% 50%',
          width: 168,
          height: 26,
          pointerEvents: 'none',
        }}
      >
        <svg viewBox="0 0 168 26" width="168" height="26">
          <defs>
            <linearGradient id="lid-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ca7ff" />
              <stop offset="100%" stopColor="#0072e5" />
            </linearGradient>
          </defs>
          <ellipse cx="84" cy="10" rx="80" ry="7" fill="url(#lid-grad)" />
          <path
            d="M4 10 L 4 15 Q 4 22 12 23 L 156 23 Q 164 22 164 15 L 164 10 Z"
            fill="url(#lid-grad)"
          />
          <ellipse cx="84" cy="6" rx="66" ry="2.2" fill="#a8daff" opacity="0.65" />
          <ellipse cx="84" cy="3.2" rx="9" ry="2.4" fill="#0a1020" />
        </svg>
      </div>

      {/* The bucket body */}
      <svg
        viewBox="0 0 240 240"
        width="240"
        height="240"
        className={bodyClass}
        style={{ position: 'absolute', inset: 0, willChange: 'transform' }}
      >
        <defs>
          <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ca7ff" />
            <stop offset="100%" stopColor="#0072e5" />
          </linearGradient>
          <linearGradient id="fill-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
          {/* Clip to bucket interior so the fill liquid stays inside */}
          <clipPath id="bucket-inner">
            <path d="M44 70 H 196 L 186 208 Q 184 212 180 212 H 60 Q 56 212 54 208 Z" />
          </clipPath>
        </defs>

        {/* Bail handle */}
        <path
          d="M52 60 C 52 8, 188 8, 188 60"
          fill="none"
          stroke="url(#body-grad)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Bucket body */}
        <path
          d="M36 66 H 204 L 190 204 Q 188 210 182 210 H 58 Q 52 210 50 204 Z"
          fill="url(#body-grad)"
        />

        {/* Internal liquid level (only shown while filling) */}
        {isFill && (
          <g clipPath="url(#bucket-inner)">
            {/* Liquid surface — rises from bottom based on fillPct */}
            <rect
              x="0"
              y={70 + (148 * (100 - Math.max(5, fillPct))) / 100}
              width="240"
              height="250"
              fill="url(#fill-grad)"
              className="bucket-liquid-wobble"
            />
            {/* Surface highlight line */}
            <line
              x1="44"
              y1={70 + (148 * (100 - Math.max(5, fillPct))) / 100 + 1}
              x2="196"
              y2={70 + (148 * (100 - Math.max(5, fillPct))) / 100 + 1}
              stroke="#a8daff"
              strokeWidth="1.5"
              opacity="0.7"
            />
          </g>
        )}

        {/* Mouth ellipse, only drawn when lid is lifted so the idle state
            reads as a clean sealed bucket. */}
        {(isDrag || isFill) && (
          <>
            <ellipse cx="120" cy="66" rx="84" ry="11" fill="#0a1020" />
            <ellipse cx="120" cy="68" rx="74" ry="6.5" fill="#000" opacity="0.45" />
            <path
              d="M38 64 Q 120 52, 202 64"
              fill="none"
              stroke="#a8daff"
              strokeWidth="2"
              opacity="0.9"
            />
          </>
        )}

        {/* REAL Filecoin 'f' glyph extracted from filecoin.svg — not a redraw.
            Original glyph lives at viewBox 0..40 starting around x=10,y=6.
            We translate+scale it so it sits centered on the bucket face. */}
        <g
          transform="translate(80 110) scale(2.1)"
          fill="#fbf9f4"
          className={state === 'idle' ? 'bucket-medallion-shimmer' : ''}
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M21.9 17.6l-.6 3.2 5.7.8-.4 1.5-5.6-.8c-.4 1.3-.6 2.7-1.1 3.9-.5 1.4-1 2.8-1.6 4.1-.8 1.7-2.2 2.9-4.1 3.2-1.1.2-2.3.1-3.2-.6-.3-.2-.6-.6-.6-.9 0-.4.2-.9.5-1.1.2-.1.7 0 1 .1.3.3.6.7.8 1.1.6.8 1.4.9 2.2.3.9-.8 1.4-1.9 1.7-3 .6-2.4 1.2-4.7 1.7-7.1v-.4l-5.3-.8.2-1.5 5.5.8.7-3.1-5.7-.9.2-1.6 5.9.8c.2-.6.3-1.1.5-1.6.5-1.8 1-3.6 2.2-5.2 1.2-1.6 2.6-2.6 4.7-2.5.9 0 1.8.3 2.4 1 .1.1.3.3.3.5 0 .4 0 .9-.3 1.2-.4.3-.9.2-1.3-.2-.3-.3-.5-.6-.8-.9-.6-.8-1.5-.9-2.2-.2-.5.5-1 1.2-1.3 1.9-.7 2.1-1.2 4.3-1.9 6.5l5.5.8-.4 1.5-5.3-.8"
          />
        </g>
      </svg>
    </div>
  )
}
