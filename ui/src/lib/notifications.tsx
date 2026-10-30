/**
 * SSE notification listener for real-time events (scan complete, new books, etc.).
 *
 * Usage: Add <NotificationListener /> to the app layout (once).
 * It connects when the user is authenticated and auto-reconnects on error.
 */

import { useEffect, useRef } from 'react'
import { toast } from '@zonsh/ui'
import { displaySeriesName } from '@/lib/anilist'
import { invalidateAfterScan, queryClient, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { countLabel } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL ?? ''
const RECONNECT_DELAY = 5_000

interface NotificationEvent {
  type: 'ScanStarted' | 'ScanComplete' | 'NewBooks' | 'NewBooksInSeries'
  scanned?: number
  errors?: number
  added?: number
  updated?: number
  removed?: number
  count?: number
  series_name?: string
  /** NewBooksInSeries: how many series got new books. */
  series?: number
}

export function NotificationListener() {
  const token = useAppStore((s) => s.token)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!token) return

    function connect() {
      // Close any existing connection
      esRef.current?.close()

      const url = `${BASE}/api/notifications/stream`
      // EventSource doesn't support custom headers, so we append the token as a query param
      const es = new EventSource(`${url}?token=${encodeURIComponent(token!)}`)
      esRef.current = es

      es.onmessage = (event) => {
        if (!event.data || event.data === 'ping') return
        try {
          const data: NotificationEvent = JSON.parse(event.data)
          handleEvent(data)
        } catch {
          // ignore malformed events
        }
      }

      es.onerror = () => {
        es.close()
        // Reconnect after delay
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer.current)
      esRef.current?.close()
      esRef.current = null
    }
  }, [token])

  return null
}

/**
 * Everyone hears about new books; administrators also hear when a scan couldn't read files.
 * A scan that changed nothing stays quiet, and nothing interrupts the reader.
 */
function handleEvent(event: NotificationEvent) {
  const { user, readerActive, setScanRunning } = useAppStore.getState()

  switch (event.type) {
    case 'ScanStarted':
      setScanRunning(true)
      void queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus() })
      break

    case 'ScanComplete': {
      setScanRunning(false)
      const changed =
        (event.added ?? 0) + (event.updated ?? 0) + (event.removed ?? 0) > 0
      if (changed || event.errors) invalidateAfterScan()
      else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus() })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.adminOverview(),
        })
      }
      if (user?.is_admin && event.errors && !readerActive) {
        toast.warning('The scan finished with errors.', {
          description: `${countLabel(event.errors, 'file')} couldn't be read. Administration → Libraries lists them.`,
        })
      }
      break
    }

    case 'NewBooks':
      if (readerActive || !event.count) break
      toast.info(`New in ${displaySeriesName(event.series_name ?? '')}`, {
        description: `${countLabel(event.count, 'new book')} in your library.`,
      })
      break

    case 'NewBooksInSeries':
      if (readerActive || !event.count) break
      toast.info('New in your library', {
        description: `${countLabel(event.count, 'new book')} across ${countLabel(event.series ?? 0, 'series', 'series')}.`,
      })
      break
  }
}

/**
 * Whether a scan is running, for the administrator's sidebar. The server's notifications say
 * when one starts and ends; this asks on sign-in, every 2 s while a scan runs (in case a
 * notification is missed) and otherwise once a minute.
 */
export function useScanStatusPolling() {
  const token = useAppStore((s) => s.token)
  const user = useAppStore((s) => s.user)
  const scanRunning = useAppStore((s) => s.scanRunning)
  const setScanRunning = useAppStore((s) => s.setScanRunning)

  useEffect(() => {
    if (!token || !user?.is_admin) return

    let active = true
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`${BASE}/api/admin/scan/status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (active) setScanRunning(!!data.running)
        }
      } catch {
        // ignore network errors
      }
    }

    poll()
    const interval = setInterval(poll, scanRunning ? 2_000 : 60_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token, user?.is_admin, scanRunning, setScanRunning])
}
