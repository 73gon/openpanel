import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Spinner } from '@zonsh/ui'
import { RefreshCwIcon } from 'lucide-react'

const THRESHOLD = 80 // px pulled before a release refreshes
const MAX_PULL = 120

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

/**
 * Pull-to-refresh for touch screens. A pull that starts while the page is at the top shows a
 * raised circle that turns with the pull; past the threshold, letting go refreshes.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing || window.scrollY > 0) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    },
    [refreshing],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return
      const diff = e.touches[0].clientY - startY.current
      if (diff < 0 || window.scrollY > 0) {
        pulling.current = false
        setPullDistance(0)
        return
      }
      // A diminishing pull: the circle lags the finger.
      setPullDistance(Math.min(diff * 0.5, MAX_PULL))
    },
    [refreshing],
  )

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current && !pullDistance) return
    pulling.current = false
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(THRESHOLD * 0.6)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, refreshing, onRefresh])

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-center transition-opacity duration-(--duration)"
        style={{
          height: `${Math.max(pullDistance, 0)}px`,
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <span className="flex size-9 items-center justify-center rounded-full material-raised">
          {refreshing ? (
            <Spinner label="Refreshing" />
          ) : (
            <RefreshCwIcon
              className="size-4 text-foreground-soft"
              style={{
                transform: `rotate(${Math.min((pullDistance / THRESHOLD) * 360, 360)}deg)`,
              }}
            />
          )}
        </span>
      </div>

      <div
        style={{
          transform:
            pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pulling.current
            ? 'none'
            : 'transform var(--duration-reveal) var(--ease)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
