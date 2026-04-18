import type { Metadata } from 'next'
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Display: Fraunces — a premium editorial variable serif with real personality.
// The SOFT + opsz axes let us dial the hero line to feel almost hand-lettered.
const serif = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-serif',
  display: 'swap',
})

// Body: Plus Jakarta Sans — humanist, friendly, not-Inter. Reads as premium
// without leaning corporate.
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Mono stays JetBrains Mono — it's still the best free mono for UI numerics.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FilBucket',
  description: 'Simple, durable file storage.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-amber-200/60">
        {children}
      </body>
    </html>
  )
}
