'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { namedFilesFromDrop, type NamedFile } from '../lib/files'

export interface InFlightUpload {
  displayName: string
  uploaded: number
  total: number
  phase: 'starting' | 'xhr' | 'server'
}

/**
 * iCloud-style drop tile.
 *
 * - Rounded-18 pastel-sky tile, soft elevation shadow.
 * - Hero bucket illustration centered.
 * - Single headline + subline + two pills (Upload / Choose folder).
 * - Drag-over: whole tile lifts + gains a dashed inner ring + bucket lid wiggles.
 * - Filling: the sky fill visibly rises inside the bucket in sync with progress.
 */
export function BucketDropzone({
  onFiles,
  uploads,
}: {
  onFiles: (files: NamedFile[]) => void
  uploads: InFlightUpload[]
}) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)

  // Aggregate progress across in-flight uploads. 0..1.
  const totalBytes = uploads.reduce((s, u) => s + Math.max(1, u.total), 0)
  const uploadedBytes = uploads.reduce((s, u) => s + u.uploaded, 0)
  const progress = uploads.length === 0 ? 0 : Math.min(1, uploadedBytes / totalBytes)
  const filling = uploads.length > 0
  const state: 'idle' | 'drag' | 'filling' = filling ? 'filling' : dragOver ? 'drag' : 'idle'

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current += 1
    if (e.dataTransfer?.types.includes('Files')) setDragOver(true)
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0
      setDragOver(false)
    }
  }, [])
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      dragDepthRef.current = 0
      const dt = e.dataTransfer
      const files = dt ? await namedFilesFromDrop(dt) : []
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  // Folder-picker needs webkitdirectory on the input element (non-standard TS typing).
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  return (
    <section
      className={[
        'relative overflow-hidden rounded-tile-lg transition-all duration-300 ease-smooth',
        'border border-line/80 bg-surface shadow-md',
        state === 'drag' ? 'scale-[1.01] ring-4 ring-sky-deep/20 shadow-lg' : '',
      ].join(' ')}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Soft sky gradient wash behind content. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 50% at 18% 20%, rgba(127, 185, 255, 0.28), transparent 60%), ' +
            'radial-gradient(ellipse 45% 40% at 85% 80%, rgba(180, 156, 255, 0.14), transparent 60%)',
        }}
      />

      {/* Dashed inner ring on drag. */}
      <div
        className={[
          'pointer-events-none absolute inset-3 rounded-[20px] border-2 border-dashed transition-opacity duration-200',
          state === 'drag' ? 'opacity-100 border-sky-deep/60' : 'opacity-0 border-transparent',
        ].join(' ')}
      />

      <div className="relative grid grid-cols-[auto_1fr] items-center gap-10 px-10 py-10 md:px-14 md:py-12">
        {/* Hero bucket */}
        <BucketHero state={state} progress={progress} />

        {/* Copy + actions */}
        <div className="min-w-0">
          <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-ink md:text-[36px]">
            {state === 'drag'
              ? 'Drop to save'
              : state === 'filling'
                ? filling && uploads.length === 1
                  ? 'Saving one file…'
                  : `Saving ${uploads.length} files…`
                : 'Drop anything here.'}
          </h2>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
            {state === 'filling'
              ? 'Your files are safe the moment they land. Securing happens quietly in the background.'
              : 'Photos, documents, folders — kept safe forever. Drag them in, or pick from your computer.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-pill bg-sky-deep px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all duration-200 ease-spring hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M10 14V6M6 10l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15v1.5A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Upload
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-pill bg-surface px-5 py-2.5 text-[14px] font-semibold text-ink shadow-sm ring-1 ring-line transition-all duration-200 ease-spring hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h6.5A1.5 1.5 0 0 1 17 8.5v7A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              Choose folder
            </button>
          </div>
        </div>
      </div>

      {/* In-flight strip — only when actually filling. */}
      {filling && (
        <div className="relative border-t border-line/60 bg-surface-sunk/50 px-10 py-4 md:px-14">
          <ul className="space-y-2.5">
            {uploads.slice(0, 3).map((u, i) => (
              <InFlightRow key={i} u={u} />
            ))}
            {uploads.length > 3 && (
              <p className="pl-1 font-mono text-[11px] text-ink-mute">
                + {uploads.length - 3} more
              </p>
            )}
          </ul>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          const list = e.target.files
          if (!list) return
          const named: NamedFile[] = Array.from(list).map((f) => ({ file: f, path: f.name }))
          onFiles(named)
          e.target.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          const list = e.target.files
          if (!list) return
          const named: NamedFile[] = Array.from(list).map((f) => ({
            // webkitRelativePath preserves folder structure (foo/bar/baz.txt).
            file: f,
            path: (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name,
          }))
          onFiles(named)
          e.target.value = ''
        }}
      />
    </section>
  )
}

/**
 * Hero bucket — 96×96 in idle, gains water fill on filling, lid wiggles on drag.
 * Pure SVG + CSS, no external deps.
 */
function BucketHero({ state, progress }: { state: 'idle' | 'drag' | 'filling'; progress: number }) {
  // Water fill maps progress 0..1 → y position inside the bucket body.
  // Bucket interior runs from y ~ 22 (top rim) to ~ 52 (bottom). 30 units of range.
  const waterTop = 52 - progress * 30
  const pct = Math.round(progress * 100)

  return (
    <div className="relative flex h-[160px] w-[160px] items-center justify-center">
      {/* Soft glow behind bucket on drag/filling. */}
      <div
        className={[
          'absolute inset-0 rounded-full blur-2xl transition-opacity duration-500',
          state === 'idle' ? 'opacity-30' : 'opacity-70',
        ].join(' ')}
        style={{ background: 'radial-gradient(circle, rgba(127,185,255,0.5), transparent 70%)' }}
      />

      <svg
        viewBox="0 0 64 64"
        className={[
          'relative h-[150px] w-[150px] transition-transform duration-500 ease-spring',
          state === 'idle' ? 'fb-bucket-breathe' : '',
          state === 'drag' ? 'scale-[1.06]' : '',
        ].join(' ')}
      >
        <defs>
          <linearGradient id="b-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B7DCFF" />
            <stop offset="100%" stopColor="#4FA7F5" />
          </linearGradient>
          <linearGradient id="b-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3A9CF0" />
            <stop offset="100%" stopColor="#1E7FD8" />
          </linearGradient>
          <linearGradient id="b-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7FB9FF" />
            <stop offset="100%" stopColor="#4FA7F5" />
          </linearGradient>
          <linearGradient id="b-drop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#EAF4FF" />
          </linearGradient>
          {/* Clip path: bucket interior, used to confine the water fill. */}
          <clipPath id="b-interior">
            <path d="M 12 19 L 52 19 L 48 55 Q 47.5 57.5, 45.5 57.5 L 18.5 57.5 Q 16.5 57.5, 16 55 Z" />
          </clipPath>
        </defs>

        {/* Ambient shadow */}
        <ellipse cx="32" cy="60" rx="18" ry="2.5" fill="#0071e3" opacity="0.14" />

        {/* Handle — lifts slightly on drag. */}
        <g
          style={{
            transformOrigin: '32px 18px',
            transform: state === 'drag' ? 'translateY(-2px) rotate(-3deg)' : 'translateY(0) rotate(0)',
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <path
            d="M18 18 C 18 6, 46 6, 46 18"
            fill="none"
            stroke="url(#b-rim)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Body */}
        <path
          d="M 11 19 Q 11 16, 14 16 L 50 16 Q 53 16, 53 19 L 49 54 Q 48.5 57, 45.5 57 L 18.5 57 Q 15.5 57, 15 54 Z"
          fill="url(#b-sky)"
        />

        {/* Interior (water fill) */}
        <g clipPath="url(#b-interior)">
          {/* Sky-dim interior backdrop, visible only when no water */}
          <rect x="0" y="20" width="64" height="38" fill="#7bb3e8" opacity="0.25" />
          {/* Water block, animates height by moving its y. */}
          <rect
            x="0"
            y={waterTop}
            width="64"
            height={58 - waterTop}
            fill="url(#b-water)"
            style={{
              transition: 'y 0.7s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
          {/* Wobble surface wave */}
          {state === 'filling' && (
            <ellipse
              cx="32"
              cy={waterTop}
              rx="22"
              ry="1.5"
              fill="#B7DCFF"
              opacity="0.8"
              className="fb-liquid-wobble"
            />
          )}
        </g>

        {/* Mouth */}
        <ellipse cx="32" cy="17" rx="21" ry="3.2" fill="#1E5C9A" opacity="0.55" />

        {/* Front highlight */}
        <path
          d="M 15 22 Q 15 19.5, 17 19 L 27 18.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Center droplet — hidden when filling (progress > 0.05) so water tells the story. */}
        {progress < 0.05 && (
          <>
            <path
              d="M 32 28 C 32 28, 27.5 34, 27.5 38.5 C 27.5 42, 29.5 44, 32 44 C 34.5 44, 36.5 42, 36.5 38.5 C 36.5 34, 32 28, 32 28 Z"
              fill="url(#b-drop)"
              opacity={state === 'drag' ? 0.6 : 1}
              style={{ transition: 'opacity 0.3s ease' }}
            />
            <path
              d="M 30 36 C 29.5 37.5, 29.5 39, 30 40"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.9"
            />
          </>
        )}
      </svg>

      {/* Percentage badge during filling. */}
      {state === 'filling' && (
        <div className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-pill bg-surface px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sky-deep shadow-sm ring-1 ring-line">
          {pct}%
        </div>
      )}
    </div>
  )
}

function InFlightRow({ u }: { u: InFlightUpload }) {
  const pct = u.total > 0 ? Math.min(100, Math.round((u.uploaded / u.total) * 100)) : 0
  const label =
    u.phase === 'starting' ? 'Starting…' : u.phase === 'server' ? 'Securing…' : 'Uploading'

  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{u.displayName}</span>
      <span className="shrink-0 font-mono text-[11px] text-ink-mute">{label}</span>
      <div className="w-28 overflow-hidden rounded-full bg-line">
        <div
          className="h-1.5 rounded-full bg-sky-deep transition-all duration-300 ease-smooth"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] font-semibold text-ink-soft">
        {pct}%
      </span>
    </li>
  )
}
