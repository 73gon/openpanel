import { useQuery } from '@tanstack/react-query'
import { fetchSeriesProgress } from './api'
import { queryKeys } from './query'
import { useAppStore } from './store'

/**
 * How far the reader is in every series they opened, for the posters: one request for the
 * whole library, shared by every poster on the page.
 */
export function useSeriesProgress() {
  const token = useAppStore((s) => s.token)
  return useQuery({
    queryKey: queryKeys.seriesProgress(),
    queryFn: fetchSeriesProgress,
    enabled: !!token,
    staleTime: 30_000,
    retry: false,
  })
}
