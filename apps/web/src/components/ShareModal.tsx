'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  type ShareSummary,
  createShare,
  listShares,
  revokeShare,
} from '../lib/api'

const EXPIRY_PRESETS: { label: string; seconds: number | null }[] = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
  { label: '30 days', seconds: 30 * 24 * 60 * 60 },
  { label: 'Never', seconds: null },
]

function shareUrl(share: ShareSummary): string {
  if (typeof window === 'undefined') return share.url
  return `${window.location.origin}${share.url}`
}

function fmtExpiry(iso: string | null): string {
  if (iso == null) return 'never expires'
  const delta = new Date(iso).getTime() - Date.now()
  if (delta < 0) return 'expired'
  const m = Math.round(delta / 60_000)
  if (m < 60) return `${m} min left`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h left`
  const d = Math.round(h / 24)
  return `${d}d left`
}

export function ShareModal({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string
  fileName: string
  onClose: () => void
}) {
  const [shares, setShares] = useState<ShareSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expirySec, setExpirySec] = useState<number | null>(7 * 24 * 60 * 60)
  const [password, setPassword] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const rows = await listShares(fileId)
      setShares(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const created = await createShare(fileId, {
        password: password.length >= 4 ? password : null,
        expiresInSeconds: expirySec ?? null,
        maxDownloads: maxDownloads.length > 0 ? Number(maxDownloads) : null,
      })
      await navigator.clipboard.writeText(shareUrl(created)).catch(() => {
        // clipboard may fail in insecure contexts; not fatal.
      })
      setCopiedId(created.id)
      setPassword('')
      setMaxDownloads('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }, [fileId, password, expirySec, maxDownloads, refresh])

  const revoke = useCallback(
    async (id: string) => {
      if (!window.confirm('Revoke this share link?')) return
      try {
        await revokeShare(id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [refresh],
  )

  const copy = useCallback(async (s: ShareSummary) => {
    try {
      await navigator.clipboard.writeText(shareUrl(s))
      setCopiedId(s.id)
      setTimeout(() => setCopiedId((v) => (v === s.id ? null : v)), 1500)
    } catch {
      // Ignore.
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-[0_30px_80px_-20px_rgba(23,21,19,0.35)]"
      >
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
              Share
            </p>
            <h2
              className="mt-1 truncate font-serif text-2xl leading-tight text-ink"
              style={{ fontVariationSettings: '"SOFT" 100, "opsz" 110' }}
            >
              {fileName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft transition-colors hover:border-line-strong hover:bg-paper"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-5 rounded-xl border border-err/30 bg-err/5 px-4 py-3 text-sm text-err">
              {error}
            </div>
          )}

          {/* Create form */}
          <div className="space-y-4">
            <div>
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
                Expires
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setExpirySec(p.seconds)}
                    className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                      expirySec === p.seconds
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line text-ink-soft hover:border-line-strong hover:bg-paper'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
                  Password (optional)
                </span>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 4 chars"
                  className="block w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label>
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
                  Max downloads
                </span>
                <input
                  type="number"
                  min="1"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  placeholder="unlimited"
                  className="block w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create share link'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </div>

          {/* Existing shares */}
          <div className="mt-8">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-mute">
              Active links
            </p>
            {loading && <p className="text-[13px] text-ink-mute">Loading…</p>}
            {!loading && shares.length === 0 && (
              <p className="text-[13px] text-ink-mute">No shares yet.</p>
            )}
            <ul className="space-y-2">
              {shares.map((s) => {
                const url = shareUrl(s)
                const dead =
                  s.revokedAt != null ||
                  (s.expiresAt != null && new Date(s.expiresAt).getTime() < Date.now()) ||
                  (s.maxDownloads != null && s.downloadCount >= s.maxDownloads)
                return (
                  <li
                    key={s.id}
                    className={`rounded-xl border border-line bg-paper px-3.5 py-2.5 ${dead ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        readOnly
                        value={url}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-ink-soft focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void copy(s)}
                        className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-soft hover:border-line-strong hover:bg-paper-raised"
                      >
                        {copiedId === s.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void revoke(s.id)}
                        className="rounded-full px-2 py-0.5 text-[11px] text-ink-mute hover:bg-err/10 hover:text-err"
                      >
                        Revoke
                      </button>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-ink-mute">
                      {s.revokedAt != null ? 'revoked' : fmtExpiry(s.expiresAt)}
                      {s.hasPassword ? ' · password' : ''}
                      {s.maxDownloads != null
                        ? ` · ${s.downloadCount}/${s.maxDownloads} used`
                        : s.downloadCount > 0
                          ? ` · ${s.downloadCount} downloads`
                          : ''}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
