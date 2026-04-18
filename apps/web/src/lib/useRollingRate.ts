'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Rolling bytes-per-second calculator.
 *
 * Pass in the current `bytes` value on each update. Internally it keeps a
 * sliding window of `(timestamp, bytes)` samples over the last `windowMs`
 * and derives an instantaneous rate from the oldest sample in the window.
 *
 * Returns 0 while we don't have enough data yet (single sample, or window
 * too short). Clamps negative deltas to 0 (happens if the upstream value
 * resets, e.g. the user re-adds the file).
 */
export function useRollingRate(bytes: number, windowMs = 3000): number {
  const samplesRef = useRef<{ t: number; b: number }[]>([])
  const [rate, setRate] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const samples = samplesRef.current
    samples.push({ t: now, b: bytes })
    // Prune anything older than windowMs.
    const cutoff = now - windowMs
    while (samples.length > 1 && samples[0] != null && samples[0].t < cutoff) {
      samples.shift()
    }
    const first = samples[0]
    const last = samples[samples.length - 1]
    if (first == null || last == null || last.t === first.t) {
      setRate(0)
      return
    }
    const dBytes = Math.max(0, last.b - first.b)
    const dSec = (last.t - first.t) / 1000
    if (dSec <= 0) {
      setRate(0)
      return
    }
    setRate(dBytes / dSec)
  }, [bytes, windowMs])

  return rate
}
