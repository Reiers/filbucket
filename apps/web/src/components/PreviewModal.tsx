'use client'

import { useEffect } from 'react'
import { FilePreview } from './FilePreview'
import { fmtBytes } from '../lib/files'

export function PreviewModal({
  src,
  mimeType,
  name,
  sizeBytes,
  onClose,
}: {
  src: string
  mimeType: string
  name: string
  sizeBytes: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Lock body scroll.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-ink/55 px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-end justify-between gap-4 text-paper">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">
              Preview
            </p>
            <p className="truncate font-serif text-xl text-paper">{name}</p>
            <p className="font-mono text-[11px] text-paper/60">
              {fmtBytes(sizeBytes)} · {mimeType || 'file'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-paper/20 bg-paper/10 px-3 py-1 text-sm text-paper transition-colors hover:bg-paper/20"
          >
            Close · Esc
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl bg-paper shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          <FilePreview
            src={src}
            mimeType={mimeType}
            name={name}
            sizeBytes={sizeBytes}
            maxHeight={720}
            rounded="1rem"
          />
        </div>
      </div>
    </div>
  )
}
