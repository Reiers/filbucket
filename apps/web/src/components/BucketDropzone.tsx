'use client'

import { useEffect, useRef, useState } from 'react'
import { namedFilesFromDrop, namedFilesFromFileList, type NamedFile } from '../lib/files'

type BucketState = 'idle' | 'drag' | 'filling'

/**
 * Interactive bucket dropzone.
 *
 * States:
 *  - idle:    bucket breathes calmly, italic 'f' glyph shimmers softly
 *  - drag:    the lid lifts off and floats, the mouth opens wide
 *  - filling: active uploads in progress; shows soft ripples
 *
 * `dragenter` / `dragleave` / `drop` listen on the whole window so a user can
 * drop anywhere on the page; we surface the bucket visual whenever files are
 * being dragged in.
 */
export function BucketDropzone({
  onFiles,
  uploadingCount,
  filling,
}: {
  onFiles: (files: NamedFile[]) => void
  uploadingCount: number
  filling: boolean
}) {
  const [state, setState] = useState<BucketState>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Window-level drag tracking. Drag events fire on descendants too, so count refs.
  const dragDepthRef = useRef(0)

  // Dev-only: allow forcing a visual state via URL hash, so we can snap
  // design screenshots of the drag/filling lid-open state without manually
  // dragging. `#debug-drag` / `#debug-fill` toggle the corresponding state.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      if (window.location.hash === '#debug-drag') setState('drag')
      else if (window.location.hash === '#debug-fill') setState('filling')
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
      setState((s) => (s === 'filling' ? s : 'drag'))
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setState(filling ? 'filling' : 'idle')
      }
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      dragDepthRef.current = 0
      setState('filling')
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
  }, [filling, onFiles])

  // Sync visual "filling" state whenever the prop changes (unless user is dragging).
  useEffect(() => {
    setState((s) => {
      if (s === 'drag') return s
      return filling ? 'filling' : 'idle'
    })
  }, [filling])

  const pickFiles = () => fileInputRef.current?.click()
  const pickFolder = () => folderInputRef.current?.click()

  const prompt =
    state === 'drag'
      ? "Let go, we've got it."
      : state === 'filling'
        ? uploadingCount > 0
          ? `Filling up… ${uploadingCount} file${uploadingCount === 1 ? '' : 's'} in flight`
          : 'Filling up…'
        : 'Drop files in the bucket'

  const sub =
    state === 'drag'
      ? 'Folders welcome. Anything under a gig, really.'
      : state === 'filling'
        ? 'Hold tight, these land in hot cache first.'
        : 'Or pick from your computer. Folders keep their shape.'

  return (
    <section
      aria-label="Upload bucket"
      className="relative isolate mb-10 overflow-hidden rounded-3xl border border-line bg-paper-raised"
    >
      {/* Soft warm halo so the bucket feels lit */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 120%, rgba(11, 111, 192, 0.10), transparent 60%), radial-gradient(ellipse 50% 55% at 50% -10%, rgba(184, 73, 24, 0.08), transparent 60%)',
        }}
      />
      {/* Dashed corner marks \u2014 editorial detail */}
      <span className="pointer-events-none absolute left-3 top-3 h-2.5 w-2.5 border-l border-t border-line-strong" />
      <span className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 border-r border-t border-line-strong" />
      <span className="pointer-events-none absolute bottom-3 left-3 h-2.5 w-2.5 border-b border-l border-line-strong" />
      <span className="pointer-events-none absolute bottom-3 right-3 h-2.5 w-2.5 border-b border-r border-line-strong" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-12 sm:px-10 sm:py-16">
        <BucketArt state={state} uploadingCount={uploadingCount} />

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

      {/* Hidden inputs */}
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

function hasFiles(dt: DataTransfer | null): boolean {
  if (dt == null) return false
  const types = dt.types
  if (!types) return false
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true
  }
  return false
}

/* --------------------------------------------------------------------------
 * The bucket illustration.
 *
 * A bigger, richly-styled version of /brand/filbucket-mark.svg:
 *  - Filecoin-blue silhouette (same gradient as the brand mark)
 *  - detachable lid that lifts off in "drag" state
 *  - italic 'f' glyph in negative space, same geometry as the mark
 *  - soft cast shadow, ambient glow, optional splash particles on drag
 * ------------------------------------------------------------------------ */

function BucketArt({
  state,
  uploadingCount,
}: {
  state: BucketState
  uploadingCount: number
}) {
  const lidOpen = state === 'drag'
  const isIdle = state === 'idle'
  const isFilling = state === 'filling'

  return (
    <div
      className="relative"
      style={{ width: 240, height: 220 }}
      aria-hidden
    >
      {/* Cast shadow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 transition-all duration-500"
        style={{
          bottom: 2,
          width: lidOpen ? 190 : 170,
          height: 16,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(11, 21, 40, 0.32) 0%, rgba(11, 21, 40, 0.08) 55%, transparent 75%)',
          filter: 'blur(2px)',
        }}
      />

      {/* Ambient blue glow in the mouth when dragging */}
      {lidOpen && (
        <div
          className="absolute left-1/2 top-[38%] -translate-x-1/2 translate-y-[-50%] opacity-80"
          style={{
            width: 170,
            height: 44,
            background:
              'radial-gradient(ellipse at center, rgba(60, 167, 255, 0.45) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
      )}

      {/* The lid */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 transition-all duration-500 ease-out ${
          lidOpen ? 'bucket-lid-float' : ''
        }`}
        style={{
          top: lidOpen ? 2 : 48,
          transform: lidOpen
            ? 'translateX(-50%) translate(-6px, -18px) rotate(-14deg)'
            : 'translateX(-50%) rotate(0deg)',
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
          {/* Top ellipse */}
          <ellipse cx="84" cy="10" rx="80" ry="7" fill="url(#lid-grad)" />
          {/* Side wall */}
          <path
            d="M4 10 L 4 15 Q 4 22 12 23 L 156 23 Q 164 22 164 15 L 164 10 Z"
            fill="url(#lid-grad)"
          />
          {/* Cyan highlight */}
          <ellipse cx="84" cy="6" rx="66" ry="2.2" fill="#a8daff" opacity="0.65" />
          {/* Knob */}
          <ellipse cx="84" cy="3.2" rx="9" ry="2.4" fill="#0a1020" />
        </svg>
      </div>

      {/* Splash particles on drag */}
      {lidOpen && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${42 + i * 9}%`,
                top: 12 + (i % 2) * 10,
                width: 5 + (i % 2),
                height: 5 + (i % 2),
                background: i % 2 === 0 ? 'var(--accent)' : '#3ca7ff',
                opacity: 0.8,
                animation: `splash-rise 1.4s ${i * 0.2}s ease-out infinite`,
              }}
            />
          ))}
        </>
      )}

      {/* The bucket body */}
      <svg
        viewBox="0 0 240 220"
        width="240"
        height="220"
        className={isIdle ? 'bucket-idle' : ''}
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ca7ff" />
            <stop offset="100%" stopColor="#0072e5" />
          </linearGradient>
        </defs>

        {/* Bail handle */}
        <path
          d="M52 60 C 52 8, 188 8, 188 60"
          fill="none"
          stroke="url(#body-grad)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Bucket body \u2014 tapered silhouette, matches brand mark */}
        <path
          d="M36 66 H 204 L 190 204 Q 188 210 182 210 H 58 Q 52 210 50 204 Z"
          fill="url(#body-grad)"
        />

        {/* Mouth ellipse (dark void) — only drawn when lid is lifted, so the
            closed state has a smoothly-covered top without dark edge bleed. */}
        {lidOpen && (
          <>
            <ellipse cx="120" cy="66" rx="84" ry="11" fill="#0a1020" />
            <ellipse cx="120" cy="68" rx="74" ry="6.5" fill="#000" opacity="0.45" />
            {/* Cyan rim highlight only visible when mouth is exposed */}
            <path
              d="M38 64 Q 120 52, 202 64"
              fill="none"
              stroke="#a8daff"
              strokeWidth="2"
              opacity="0.9"
            />
          </>
        )}

        {/* Italic 'f' glyph in negative space \u2014 same geometry as brand mark,
            scaled up. Built from top-bar + descender + crossbar. */}
        <g
          transform="translate(130 140)"
          fill="#fbf9f4"
          className={isIdle ? 'bucket-medallion-shimmer' : ''}
        >
          {/* Top bar */}
          <path d="M -10 -30 C 0 -30 10 -24 12 -14 L 26 -14 L 24 -6 L 10 -6 C 8 -14 3 -17 -4 -17 L -10 -17 Z" />
          {/* Vertical descender with curved tail */}
          <path d="M -10 -17 L -26 40 C -27 46 -32 50 -37 50 L -45 50 L -45 41 L -40 41 C -38 41 -37 40 -36 37 L -18 -17 Z" />
          {/* Crossbar \u2014 load-bearing, thick enough to read at any size */}
          <path d="M -24 2 L 16 2 L 13 12 L -27 12 Z" />
        </g>
      </svg>

      {/* Filling ripples over the bucket mouth */}
      {isFilling && uploadingCount > 0 && (
        <>
          <span
            className="ping-soft absolute rounded-full border-2 border-accent/70"
            style={{ left: '50%', top: '30%', width: 28, height: 28, marginLeft: -14, marginTop: -14 }}
          />
          <span
            className="ping-soft absolute rounded-full border-2"
            style={{
              left: '50%',
              top: '30%',
              width: 28,
              height: 28,
              marginLeft: -14,
              marginTop: -14,
              animationDelay: '0.4s',
              borderColor: '#3ca7ff',
              opacity: 0.7,
            }}
          />
        </>
      )}
    </div>
  )
}
