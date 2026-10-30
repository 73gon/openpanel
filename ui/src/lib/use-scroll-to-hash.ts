import { useEffect } from 'react'

/**
 * Scrolls to the element with this id when the address ends in its hash: a section that renders
 * after its data arrives is not there yet when the router looks for it.
 */
export function useScrollToHash(id: string, ready: boolean) {
  useEffect(() => {
    if (!ready || window.location.hash !== `#${id}`) return
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: 'start' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [id, ready])
}
