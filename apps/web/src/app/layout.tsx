import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'FilBucket',
  description: 'Simple, durable file storage.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
