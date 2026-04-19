'use client'

import Link from 'next/link'

export interface SidebarCounts {
  total: number
  uploading: number
  ready: number
  secured: number
  failed: number
}

/**
 * Global sidebar.
 * `activeRoute` tells us which nav item to highlight without needing
 * usePathname() (which would force a boundary on a server component).
 */
export function Sidebar({
  counts,
  activeRoute,
}: {
  counts: SidebarCounts
  activeRoute: '/' | '/recents' | '/shared' | '/trash'
}) {
  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-6 px-6 py-8 fb-glass-sunk">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2.5">
        <img src="/brand/filbucket-mark.svg" alt="" width={36} height={36} />
        <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">FilBucket</span>
      </Link>

      <nav className="space-y-1">
        <SideItem href="/" active={activeRoute === '/'} label="Bucket" count={counts.total || undefined}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="M4 7h12l-1 9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M7 7V5a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </SideItem>
        <SideItem
          href="/recents"
          active={activeRoute === '/recents'}
          label="Recents"
          count={counts.uploading + counts.ready > 0 ? counts.uploading + counts.ready : undefined}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </SideItem>
        <SideItem href="/shared" active={activeRoute === '/shared'} label="Shared">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <circle cx="6" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="14" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3 15c0-2 1.5-3.5 3.5-3.5S10 13 10 15M10 15c0-2 1.5-3.5 3.5-3.5S17 13 17 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </SideItem>
        <SideItem href="/trash" active={activeRoute === '/trash'} label="Trash">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path
              d="M5 6h10M8 6V4h4v2M7 6l.6 10a1 1 0 0 0 1 .95h2.8a1 1 0 0 0 1-.95L13 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SideItem>
      </nav>

      {/* Only show status counters on pages where they're meaningful. */}
      {activeRoute === '/' && counts.total > 0 && (
        <div className="mt-2 border-t border-line/60 pt-5">
          <p className="px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
            Status
          </p>
          <div className="mt-2 space-y-1">
            <StatusLine dot="bg-mint-deep" label="Secured" count={counts.secured} />
            <StatusLine dot="bg-lavender-deep" label="Saving" count={counts.ready} />
            <StatusLine dot="bg-sky-deep" label="Uploading" count={counts.uploading} />
            {counts.failed > 0 && <StatusLine dot="bg-err" label="Failed" count={counts.failed} />}
          </div>
        </div>
      )}

      {/* Storage chip */}
      <div className="mt-auto rounded-tile bg-surface/80 p-4 shadow-xs ring-1 ring-line/60">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono uppercase tracking-wider text-ink-mute">Storage</span>
          <span className="font-mono font-semibold text-ink-soft">Calibration</span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full w-[8%] rounded-full bg-sky-deep" />
        </div>
        <p className="mt-2 text-[12px] text-ink-soft">
          <span className="font-semibold text-ink">Plenty of room.</span> You&apos;re on the dev plan.
        </p>
      </div>
    </aside>
  )
}

function SideItem({
  href,
  active,
  label,
  count,
  children,
}: {
  href: string
  active?: boolean
  label: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={[
        'group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[14px] transition-colors duration-150',
        active
          ? 'bg-sky-fill text-sky-deep'
          : 'text-ink-soft hover:bg-surface/80 hover:text-ink',
      ].join(' ')}
    >
      <span className={active ? 'text-sky-deep' : 'text-ink-mute group-hover:text-ink-soft'}>
        {children}
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {count != null && count > 0 && (
        <span
          className={[
            'rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold',
            active ? 'bg-sky-deep/10 text-sky-deep' : 'bg-surface-sunk text-ink-mute',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

function StatusLine({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="flex-1 text-[12px] text-ink-soft">{label}</span>
      <span className="font-mono text-[11px] font-medium text-ink-mute">{count}</span>
    </div>
  )
}
