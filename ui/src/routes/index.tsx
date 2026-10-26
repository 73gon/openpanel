import { createFileRoute } from '@tanstack/react-router'
import { Skeleton } from '@zonsh/ui'
import { RouteErrorComponent } from '@/components/route-error'
import { fetchAllSeries } from '@/lib/api'
import { HomePage, SERIES_PER_PAGE } from '@/components/home-page'
import { Page } from '@/components/page'
import { POSTER_GRID, PosterSkeleton } from '@/components/series-poster'

export type LibrarySort = 'name' | 'year' | 'score' | 'recently_added'

export interface LibrarySearch {
  sort?: LibrarySort
  dir?: 'asc' | 'desc'
  genre?: string
  status?: string
}

const SORTS: LibrarySort[] = ['name', 'year', 'score', 'recently_added']

function HomePageSkeleton() {
  return (
    <Page aria-busy="true">
      <span className="sr-only">Loading your library…</span>
      <Skeleton shape="text" className="mb-6 h-6 w-44" />
      <div className={POSTER_GRID}>
        {Array.from({ length: 12 }).map((_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </Page>
  )
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    ...(SORTS.includes(search.sort as LibrarySort)
      ? { sort: search.sort as LibrarySort }
      : {}),
    ...(search.dir === 'asc' || search.dir === 'desc'
      ? { dir: search.dir }
      : {}),
    ...(typeof search.genre === 'string' && search.genre
      ? { genre: search.genre }
      : {}),
    ...(typeof search.status === 'string' && search.status
      ? { status: search.status }
      : {}),
  }),
  loader: async () => {
    try {
      // The unfiltered first page, for a fast first paint; filters load in the page.
      const data = await fetchAllSeries({ page: 1, perPage: SERIES_PER_PAGE })
      return { series: data.series, total: data.total, offline: false }
    } catch {
      // Offline or server unreachable — flag it so HomePage shows downloads
      return { series: [], total: 0, offline: true }
    }
  },
  pendingComponent: HomePageSkeleton,
  errorComponent: RouteErrorComponent,
  component: HomePage,
})
