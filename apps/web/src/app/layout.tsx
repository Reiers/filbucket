import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Body + display. Inter at multiple weights gives us the whole type system
// without needing a separate display face. Apple uses SF Pro; Inter is the
// closest free analogue and reads almost identical at text sizes.
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

// Mono for microcopy + numerics. IBM Plex Mono is warmer than JetBrains
// and sits better against a white/pastel iCloud-style base.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FilBucket',
  description: 'Your bucket, in the cloud. Files you drop stay safe forever.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
}

// Inline script runs BEFORE React hydration so there's no flash of
// light-then-dark (or vice versa). Reads localStorage first, falls back
// to prefers-color-scheme.
const themeInit = `
(function() {
  try {
    var saved = localStorage.getItem('fb-theme');
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved || (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen bg-canvas text-ink antialiased selection:bg-[color:var(--accent-sky)]/30" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
