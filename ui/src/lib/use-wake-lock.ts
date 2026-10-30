import { useEffect } from 'react'

/** How long the screen stays on without a touch, a key or a page turn. */
const IDLE_MS = 10 * 60_000

/**
 * Keeps the screen on while `enabled`, where the browser allows it (most phones do over HTTPS).
 * Left alone for ten minutes, the screen may dim again; the next touch keeps it on once more.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let requesting = false
    let cancelled = false
    let idle: ReturnType<typeof setTimeout> | undefined

    const release = () => {
      const held = lock
      lock = null
      held?.release().catch(() => {})
    }

    const acquire = async () => {
      if (lock || requesting || document.visibilityState !== 'visible') return
      requesting = true
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) sentinel.release().catch(() => {})
        else {
          lock = sentinel
          // The browser lets go itself when the page is hidden.
          sentinel.addEventListener('release', () => {
            if (lock === sentinel) lock = null
          })
        }
      } catch {
        // Not allowed here (no HTTPS, battery saver, or the user said no).
      } finally {
        requesting = false
      }
    }

    const activity = () => {
      clearTimeout(idle)
      idle = setTimeout(release, IDLE_MS)
      void acquire()
    }

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, activity, { passive: true })
    document.addEventListener('visibilitychange', activity)
    activity()

    return () => {
      cancelled = true
      clearTimeout(idle)
      for (const e of events) window.removeEventListener(e, activity)
      document.removeEventListener('visibilitychange', activity)
      release()
    }
  }, [enabled])
}
