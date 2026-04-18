'use client'

import { useEffect, useRef, useState } from 'react'
import { classifyPreview } from '../lib/files'

/**
 * Inline preview.
 * Supports:
 *  - image: <img>
 *  - video: <video> with controls
 *  - audio: <audio> with controls
 *  - pdf:   first-page render via pdf.js (lazy-loaded), \u2264 20 MB only
 *  - text:  fetch first ~4KB and show monospace (first 20 lines)
 *
 * For anything else returns null so the parent can render a fallback.
 */
export function FilePreview({
  src,
  mimeType,
  name,
  sizeBytes,
  maxHeight = 420,
  rounded = '1rem',
}: {
  src: string
  mimeType: string
  name: string
  sizeBytes: number
  maxHeight?: number
  rounded?: string
}) {
  const kind = classifyPreview(mimeType, name)

  if (kind === 'image') {
    return (
      <div
        className="relative overflow-hidden bg-paper-sunken"
        style={{ borderRadius: rounded, maxHeight }}
      >
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="mx-auto block h-auto max-h-[420px] w-auto max-w-full object-contain"
        />
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div
        className="relative overflow-hidden bg-black"
        style={{ borderRadius: rounded, maxHeight }}
      >
        {/* Native <video> + Range requests is enough for MP4/WebM on MinIO. */}
        <video
          src={src}
          controls
          preload="metadata"
          className="mx-auto block h-auto max-h-[420px] w-full"
        />
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div
        className="flex items-center justify-center bg-paper-sunken px-6 py-10"
        style={{ borderRadius: rounded }}
      >
        <audio src={src} controls className="w-full max-w-md" />
      </div>
    )
  }

  if (kind === 'pdf' && sizeBytes <= 20 * 1024 * 1024) {
    return <PdfFirstPage src={src} rounded={rounded} />
  }

  if (kind === 'text' && sizeBytes <= 512 * 1024) {
    return <TextPreview src={src} rounded={rounded} />
  }

  return null
}

/* ---------------- PDF first-page preview ---------------- */

function PdfFirstPage({ src, rounded }: { src: string; rounded: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        // Lazy import keeps pdf.js out of the initial bundle.
        const pdfjs = await import('pdfjs-dist')
        // Point to the worker hosted in /public so we don't trip the bundler.
        // pdf.js ships with a worker that must be served as a static asset.
        const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)
          .toString()
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
        const loadingTask = pdfjs.getDocument({ url: src, withCredentials: false })
        const doc = await loadingTask.promise
        if (cancelled) return
        const page = await doc.getPage(1)
        const viewport = page.getViewport({ scale: 1.3 })
        const canvas = canvasRef.current
        if (canvas == null) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (ctx == null) {
          setError('Preview unavailable.')
          return
        }
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden bg-paper-sunken"
      style={{ borderRadius: rounded, minHeight: 260 }}
    >
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-mute">
          Rendering preview…
        </div>
      )}
      {error && (
        <div className="px-6 py-10 text-center text-sm text-ink-mute">
          Preview unavailable. Download to view.
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="h-auto max-h-[480px] w-auto max-w-full"
        style={{ display: error != null ? 'none' : 'block' }}
      />
    </div>
  )
}

/* ---------------- Text file preview ---------------- */

function TextPreview({ src, rounded }: { src: string; rounded: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(src, { headers: { Range: 'bytes=0-4095' } })
        if (!res.ok && res.status !== 206) {
          // Fallback: fetch whole file if server doesn't support Range.
          const full = await fetch(src)
          if (!full.ok) throw new Error(`Preview failed: ${full.status}`)
          const text = await full.text()
          if (!cancelled) setContent(text.split('\n').slice(0, 20).join('\n'))
          return
        }
        const text = await res.text()
        if (!cancelled) setContent(text.split('\n').slice(0, 20).join('\n'))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [src])

  if (error != null) {
    return (
      <div
        className="bg-paper-sunken px-6 py-10 text-center text-sm text-ink-mute"
        style={{ borderRadius: rounded }}
      >
        Preview unavailable.
      </div>
    )
  }
  return (
    <pre
      className="max-h-[420px] overflow-auto bg-paper-sunken px-5 py-4 font-mono text-[12px] leading-relaxed text-ink-soft"
      style={{ borderRadius: rounded }}
    >
      {content ?? 'Loading…'}
    </pre>
  )
}
