'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SharePublicDTO } from '@filbucket/shared'
import { PUBLIC_API_URL } from '../../../lib/env'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function fmtExpiry(iso: string | null): string | null {
  if (iso == null) return null
  const delta = new Date(iso).getTime() - Date.now()
  if (delta < 0) return 'expired'
  const m = Math.round(delta / 60_000)
  if (m < 60) return `expires in ${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `expires in ${h}h`
  const d = Math.round(h / 24)
  return `expires in ${d} days`
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null)
  const [share, setShare] = useState<SharePublicDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Unwrap the Promise-shaped params that Next.js 15 gives to client pages.
  useEffect(() => {
    let cancelled = false
    void params.then((p) => {
      if (!cancelled) setToken(p.token)
    })
    return () => {
      cancelled = true
    }
  }, [params])

  const load = useCallback(async () => {
    if (token == null) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/api/shares/by-token/${encodeURIComponent(token)}`,
      )
      if (res.status === 404) {
        setError('This link is invalid or has been removed.')
        return
      }
      if (res.status === 429) {
        setError('Too many requests. Try again in a minute.')
        return
      }
      if (!res.ok) {
        setError(`Unexpected response (${res.status}).`)
        return
      }
      const data = (await res.json()) as SharePublicDTO
      setShare(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const doDownload = useCallback(async () => {
    if (token == null || share == null) return
    setDownloading(true)
    setError(null)
    try {
      // If a password is required, probe the endpoint first to surface
      // password errors cleanly instead of landing the user on a 401 page.
      if (share.hasPassword) {
        if (password.length === 0) {
          setError('Enter the password to download.')
          setDownloading(false)
          return
        }
        const probe = await fetch(
          `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download?p=${encodeURIComponent(password)}`,
          { method: 'GET', redirect: 'manual' },
        )
        if (probe.status === 401) {
          setError('Wrong password.')
          setDownloading(false)
          return
        }
        if (probe.status === 410) {
          setError('This link can no longer be downloaded.')
          setDownloading(false)
          return
        }
        if (probe.status === 429) {
          setError('Too many requests. Try again in a minute.')
          setDownloading(false)
          return
        }
      }
      // Hand off to the browser — 302 chain ends at MinIO which serves the bytes.
      const url = share.hasPassword
        ? `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download?p=${encodeURIComponent(password)}`
        : `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download`
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDownloading(false)
    }
  }, [token, share, password])

  // ---- Render ---------------------------------------------------------------

  return (
    <main className="relative z-10 mx-auto w-full max-w-xl px-6 pt-20 pb-16">
      <header className="mb-10 flex items-center gap-3">
        <img
          src="/brand/filbucket-mark.svg"
          alt=""
          width={40}
          height={40}
          className="drop-shadow-[0_2px_4px_rgba(26,24,23,0.15)]"
        />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
            Shared via FilBucket
          </p>
          <p className="font-serif text-lg text-ink">A file is waiting for you.</p>
        </div>
      </header>

      {loading && (
        <div className="rounded-xl border border-line bg-paper-raised px-6 py-10 text-center text-sm text-ink-mute">
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="mb-6 rounded-xl border border-err/30 bg-err/5 px-5 py-4 text-sm text-err">
          {error}
        </div>
      )}

      {!loading && share != null && (
        <section className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
          {/* File card */}
          <div className="flex items-start gap-4 border-b border-line px-6 py-6">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-line-strong bg-paper text-ink-mute">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-all font-serif text-xl text-ink">
                {share.file?.name ?? 'Unavailable'}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-mute">
                {share.file != null ? fmtBytes(share.file.sizeBytes) : '—'}
                {share.expiresAt != null ? ` · ${fmtExpiry(share.expiresAt)}` : ''}
                {share.maxDownloads != null
                  ? ` · ${share.downloadCount}/${share.maxDownloads} downloads used`
                  : ''}
              </p>
            </div>
          </div>

          {/* Status / action */}
          <div className="px-6 py-6">
            {share.status === 'revoked' && (
              <p className="text-sm text-err">This link has been revoked.</p>
            )}
            {share.status === 'expired' && (
              <p className="text-sm text-err">This link has expired.</p>
            )}
            {share.status === 'exhausted' && (
              <p className="text-sm text-err">
                This link has reached its download limit.
              </p>
            )}
            {share.status === 'active' && share.file != null && (
              <>
                {share.hasPassword && (
                  <label className="mb-4 block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
                      Password
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void doDownload()
                      }}
                      placeholder="Enter to unlock"
                      className="block w-full rounded-lg border border-line bg-paper px-3 py-2 font-sans text-[14px] text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                )}
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => void doDownload()}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {downloading ? 'Starting download…' : 'Download'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v14" />
                    <path d="m6 11 6 6 6-6" />
                    <path d="M4 21h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <footer className="mt-12 flex items-center justify-between border-t border-line pt-4 text-[11px] text-ink-mute">
        <a
          href="/"
          className="font-mono uppercase tracking-[0.22em] hover:text-ink-soft"
        >
          ← filbucket
        </a>
        <span className="inline-flex items-center gap-2 opacity-70">
          <span className="font-mono uppercase tracking-wider">Stored on</span>
          <img src="/brand/filecoin.svg" alt="Filecoin" width={12} height={12} />
          <span className="font-sans text-[12px] font-medium text-ink-soft">Filecoin</span>
        </span>
      </footer>
    </main>
  )
}
