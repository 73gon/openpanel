/**
 * SSE notification listener for real-time events (scan complete, new books, etc.).
 *
 * Usage: Add <NotificationListener /> to the app layout (once).
 * It connects when the user is authenticated and auto-reconnects on error.
 */

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'

const BASE = import.meta.env.VITE_API_URL ?? ''
const RECONNECT_DELAY = 5_000

interface NotificationEvent {
  type: 'ScanComplete' | 'NewBooks' | 'BackupComplete'
  scanned?: number
  errors?: number
  count?: number
  series_name?: string
  filename?: string
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

function handleEvent(event: NotificationEvent) {
  switch (event.type) {
    case 'ScanComplete':
      if (event.errors && event.errors > 0) {
        toast.warning('Scan complete', {
          description: `${event.scanned} files scanned, ${event.errors} errors`,
        })
      } else {
        toast.success('Scan complete', {
          description: `${event.scanned} files scanned`,
        })
      }
      break

    case 'NewBooks':
      toast.info('New books added', {
        description: `${event.count} new book${event.count !== 1 ? 's' : ''} in ${event.series_name}`,
      })
      break

    case 'BackupComplete':
      toast.success('Backup complete', {
        description: event.filename,
      })
      break
  }
}
