'use client'

import { useState } from 'react'

/**
 * Small "?" badge that shows a pastel tooltip on hover / focus.
 * Plain-CSS, no headless-ui dependency. Positions above by default.
 */
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-sunk text-[10px] font-bold text-ink-mute transition-colors duration-150 hover:bg-sky-fill hover:text-sky-deep"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="fb-animate-fade-in pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-tile bg-ink px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-lg"
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </span>
      )}
    </span>
  )
}
