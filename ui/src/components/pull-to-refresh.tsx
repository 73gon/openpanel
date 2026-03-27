import { useState, useRef, useCallback, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'

const THRESHOLD = 80 // px pulled before triggering refresh
const MAX_PULL = 120

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

/**
 * Pull-to-refresh wrapper for touch devices.
 * Wraps scrollable content and shows a spinner when the user pulls down
 * while already at the top of the scroll container.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return
      // Only activate if the nearest scrollable ancestor is at the top
      const scrollParent = findScrollParent(e.target as HTMLElement)
      if (scrollParent && scrollParent.scrollTop > 0) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    },
    [refreshing],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return
      const diff = e.touches[0].clientY - startY.current
      if (diff < 0) {
        pulling.current = false
        setPullDistance(0)
        return
      }
      // Diminishing return curve
      const clamped = Math.min(diff * 0.5, MAX_PULL)
      setPullDistance(clamped)
    },
    [refreshing],
  )

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current && !pullDistance) return
    pulling.current = false
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(THRESHOLD * 0.6) // collapse to spinner position
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
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-center transition-opacity duration-200"
        style={{
          height: `${Math.max(pullDistance, 0)}px`,
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur-sm ${refreshing ? 'animate-spin' : ''}`}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${Math.min((pullDistance / THRESHOLD) * 360, 360)}deg)`,
          }}
        >
          <HugeiconsIcon icon={Loading03Icon} size={18} className="text-primary" />
        </div>
      </div>

      {/* Content shifted down by pull distance */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pulling.current ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Walk up from an element until we find an overflow-scrollable parent or <main>. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    if (el.tagName === 'MAIN') return el
    const style = getComputedStyle(el)
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}
