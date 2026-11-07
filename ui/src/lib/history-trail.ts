import { useCallback, useEffect, type MouseEvent } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'

/**
 * The page at each step of this tab's history, by the router's own index for the entry. A
 * replaced entry keeps its index and takes the new page.
 */
const trail = new Map<number, string>()

type Router = ReturnType<typeof useRouter>

function indexOf(router: Router): number {
  const state = router.history.location.state as { __TSR_index?: number }
  return state.__TSR_index ?? 0
}

/** Keeps the trail as the reader moves about. Mount it once, in the layout. */
export function useHistoryTrail() {
  const router = useRouter()
  useEffect(() => {
    const record = () =>
      trail.set(indexOf(router), router.state.location.pathname)
    record()
    return router.subscribe('onResolved', record)
  }, [router])
}

/**
 * Leaving the reader for its series. When the series page is the step just behind, it goes back
 * to it, so the series page's own Back then leaves the series, not into the book again. From
 * anywhere else (the library's Continue reading, a link) the reader is swapped for the series
 * page, so Back from there returns to where the book was opened.
 */
export function useSeriesExit(seriesId: string) {
  const router = useRouter()
  const navigate = useNavigate()

  const leave = useCallback(() => {
    if (trail.get(indexOf(router) - 1) === `/series/${seriesId}`) {
      router.history.back()
    } else {
      navigate({ to: '/series/$seriesId', params: { seriesId }, replace: true })
    }
  }, [router, navigate, seriesId])

  /** For a link to the series: a plain click leaves as above; a new tab opens as usual. */
  const onClick = useCallback(
    (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      leave()
    },
    [leave],
  )

  return { leave, onClick }
}
