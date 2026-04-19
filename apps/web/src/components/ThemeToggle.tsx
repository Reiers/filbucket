'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

/**
 * Theme toggle — saves preference to localStorage + respects OS setting on first load.
 * Applies theme by setting data-theme attribute on <html>.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = (localStorage.getItem('fb-theme') as Theme | null)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial: Theme = saved ?? (prefersDark ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('fb-theme', next)
    } catch {
      /* ignore */
    }
  }

  if (!mounted) {
    // Avoid SSR flash mismatch: render placeholder until hydrated.
    return <span className="inline-block h-8 w-8" aria-hidden />
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunk text-ink-soft transition-all duration-200 ease-spring hover:scale-[1.06] hover:bg-surface hover:text-ink hover:shadow-sm active:scale-95"
    >
      {theme === 'light' ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
          <path
            d="M16 11.5A7 7 0 0 1 8.5 4a7 7 0 1 0 7.5 7.5Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
          <circle cx="10" cy="10" r="3.5" fill="currentColor" />
          <path
            d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9 4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}
