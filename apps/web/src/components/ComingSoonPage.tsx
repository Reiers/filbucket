'use client'

import { Sidebar, type SidebarCounts } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { useEffect, useState } from 'react'
import { listFiles } from '../lib/api'
import { DEFAULT_BUCKET_ID, DEV_USER_ID } from '../lib/env'

/**
 * Shared scaffold for the Recents / Shared / Trash pages.
 * Same sidebar, tasteful empty-state tile with a themed illustration,
 * short description, and a gentle "coming soon" chip.
 */
export function ComingSoonPage({
  activeRoute,
  title,
  subtitle,
  body,
  illustration,
}: {
  activeRoute: '/recents' | '/shared' | '/trash'
  title: string
  subtitle: string
  body: string
  illustration: 'recents' | 'shared' | 'trash'
}) {
  const [counts, setCounts] = useState<SidebarCounts>({
    total: 0,
    uploading: 0,
    ready: 0,
    secured: 0,
    failed: 0,
  })

  // Fetch counts so the sidebar doesn't lie about bucket size while you're away.
  useEffect(() => {
    const configOk = Boolean(DEV_USER_ID && DEFAULT_BUCKET_ID)
    if (!configOk) return
    let cancelled = false
    const tick = async () => {
      try {
        const files = await listFiles(DEFAULT_BUCKET_ID)
        if (cancelled) return
        const c: SidebarCounts = {
          total: files.length,
          uploading: 0,
          ready: 0,
          secured: 0,
          failed: 0,
        }
        for (const f of files) {
          if (f.state === 'uploading') c.uploading++
          else if (f.state === 'hot_ready') c.ready++
          else if (f.state === 'pdp_committed') c.secured++
          else if (f.state === 'failed') c.failed++
        }
        setCounts(c)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="relative z-10 min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-[260px_1fr]">
        <Sidebar counts={counts} activeRoute={activeRoute} />

        <main className="flex flex-col px-8 pb-20 pt-8 lg:px-12">
          <header className="mb-10 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
              <p className="mt-1.5 text-[14px] text-ink-soft">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-pill bg-lavender-fill px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-lavender-deep">
                Coming soon
              </span>
              <ThemeToggle />
            </div>
          </header>

          <section className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-tile-lg bg-surface px-8 py-16 text-center shadow-sm ring-1 ring-line/60">
            <div className="mb-8">
              <Illustration kind={illustration} />
            </div>
            <h2 className="max-w-xl text-[22px] font-bold tracking-[-0.02em] text-ink">
              {title} is on the way.
            </h2>
            <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-ink-soft">{body}</p>
            <a
              href="/"
              className="mt-8 inline-flex items-center gap-2 rounded-pill bg-sky-deep px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all duration-200 ease-spring hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <path d="M4 7h12l-1 9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M7 7V5a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Back to Bucket
            </a>
          </section>
        </main>
      </div>
    </div>
  )
}

/**
 * Themed pastel illustrations for each placeholder page.
 * Hand-drawn SVGs, ~200×160, match the pastel palette.
 */
function Illustration({ kind }: { kind: 'recents' | 'shared' | 'trash' }) {
  if (kind === 'recents') {
    return (
      <svg viewBox="0 0 220 160" className="h-40 w-[220px]" aria-hidden>
        <defs>
          <linearGradient id="ill-r" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B7DCFF" />
            <stop offset="100%" stopColor="#4FA7F5" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="80" r="60" fill="url(#ill-r)" opacity="0.28" />
        <circle cx="110" cy="80" r="42" fill="#FFFFFF" stroke="#4FA7F5" strokeWidth="3" />
        <path d="M 110 56 V 80 L 128 92" stroke="#1E7FD8" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <circle cx="110" cy="80" r="2.5" fill="#1E7FD8" />
        <circle cx="48" cy="44" r="8" fill="#ECDFFD" />
        <circle cx="176" cy="112" r="6" fill="#D5F2E8" />
        <circle cx="180" cy="42" r="4" fill="#FFE7D4" />
      </svg>
    )
  }
  if (kind === 'shared') {
    return (
      <svg viewBox="0 0 220 160" className="h-40 w-[220px]" aria-hidden>
        <defs>
          <linearGradient id="ill-s" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ECDFFD" />
            <stop offset="100%" stopColor="#B49CFF" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="92" r="30" fill="url(#ill-s)" />
        <circle cx="160" cy="56" r="24" fill="#D5F2E8" />
        <circle cx="170" cy="116" r="20" fill="#FFE7D4" />
        <path d="M 80 92 L 148 62 M 80 92 L 152 116" stroke="#B49CFF" strokeWidth="2.5" strokeDasharray="4 4" fill="none" />
        <circle cx="60" cy="92" r="10" fill="#6B4CD9" />
        <circle cx="160" cy="56" r="8" fill="#00875A" />
        <circle cx="170" cy="116" r="7" fill="#CC5500" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 220 160" className="h-40 w-[220px]" aria-hidden>
      <defs>
        <linearGradient id="ill-t" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD9E2" />
          <stop offset="100%" stopColor="#FF8EA8" />
        </linearGradient>
      </defs>
      <rect x="70" y="48" width="80" height="92" rx="8" fill="url(#ill-t)" opacity="0.35" />
      <rect x="70" y="48" width="80" height="16" rx="4" fill="#FF8EA8" />
      <rect x="86" y="36" width="48" height="14" rx="4" fill="#FFFFFF" stroke="#C8345E" strokeWidth="2" />
      <path d="M 86 76 V 124 M 110 76 V 124 M 134 76 V 124" stroke="#C8345E" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
