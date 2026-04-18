'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SharePublicDTO } from '@filbucket/shared'
import { PUBLIC_API_URL } from '../../../lib/env'
import { FilePreview } from '../../../components/FilePreview'
import { classifyPreview, fmtBytes } from '../../../lib/files'

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
      const url = share.hasPassword
        ? `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download?p=${encodeURIComponent(password)}`
        : `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download`
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDownloading(false)
    }
  }, [token, share, password])

  const previewable = useMemo(() => {
    if (share?.file == null) return false
    if (share.hasPassword) return false // password unlocks download, keep preview gated
    if (share.status !== 'active') return false
    const kind = classifyPreview(share.file.mimeType, share.file.name)
    return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf'
  }, [share])

  const previewSrc =
    token != null
      ? `${PUBLIC_API_URL}/api/shares/${encodeURIComponent(token)}/download`
      : ''

  return (
    <main className="relative z-10 mx-auto w-full max-w-2xl px-6 pt-16 pb-16 sm:pt-24">
      {/* Soft gradient backdrop specific to share page */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(184, 73, 24, 0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 90% 100%, rgba(11, 111, 192, 0.07), transparent 60%)',
        }}
      />

      {/* Bucket watermark off to the side */}
      <img
        src="/brand/filbucket-mark.svg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed -right-12 bottom-6 z-0 h-[340px] w-[340px] opacity-[0.07] sm:-right-6 sm:bottom-12"
      />

      <header className="relative z-10 mb-10 flex items-center gap-3">
        <img
          src="/brand/filbucket-mark.svg"
          alt=""
          width={40}
          height={40}
          className="drop-shadow-[0_4px_10px_rgba(184,73,24,0.2)]"
        />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
            Shared via FilBucket
          </p>
          <p
            className="font-serif text-lg text-ink"
            style={{ fontVariationSettings: '"SOFT" 100, "opsz" 90' }}
          >
            A file is waiting for you.
          </p>
        </div>
      </header>

      {loading && (
        <div className="relative z-10 rounded-2xl border border-line bg-paper-raised px-6 py-10 text-center text-sm text-ink-mute">
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="relative z-10 mb-6 rounded-xl border border-err/30 bg-err/5 px-5 py-4 text-sm text-err">
          {error}
        </div>
      )}

      {!loading && share != null && share.file != null && (
        <section className="relative z-10 overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-[0_30px_60px_-30px_rgba(23,21,19,0.18)]">
          {/* Preview band */}
          {previewable && (
            <div className="border-b border-line">
              <FilePreview
                src={previewSrc}
                mimeType={share.file.mimeType}
                name={share.file.name}
                sizeBytes={share.file.sizeBytes}
                maxHeight={460}
                rounded="0"
              />
            </div>
          )}

          {/* Filename + meta */}
          <div className="px-7 py-7">
            <h1
              className="break-words font-serif text-[clamp(1.5rem,3.5vw,2.25rem)] leading-tight text-ink"
              style={{ fontVariationSettings: '"SOFT" 100, "opsz" 120' }}
            >
              {share.file.name}
            </h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-ink-mute">
              {fmtBytes(share.file.sizeBytes)}
              {share.expiresAt != null ? ` · ${fmtExpiry(share.expiresAt)}` : ''}
              {share.maxDownloads != null
                ? ` · ${share.downloadCount}/${share.maxDownloads} downloads used`
                : ''}
            </p>

            <div className="mt-6">
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

              {share.status === 'active' && (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  {share.hasPassword && (
                    <label className="block w-full sm:max-w-xs">
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
                        className="block w-full rounded-lg border border-line bg-paper px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={downloading}
                    onClick={() => void doDownload()}
                    className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-all hover:-translate-y-0.5 hover:bg-accent-deep disabled:opacity-60 sm:self-auto"
                  >
                    {downloading ? 'Starting download…' : 'Download'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v14" />
                      <path d="m6 11 6 6 6-6" />
                      <path d="M4 21h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="relative z-10 mt-14 flex items-center justify-between border-t border-line pt-5 text-[11px] text-ink-mute">
        <a
          href="/"
          className="font-mono uppercase tracking-[0.22em] transition-colors hover:text-ink-soft"
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
