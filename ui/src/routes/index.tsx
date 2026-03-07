import { createFileRoute } from '@tanstack/react-router'
import { fetchAllSeries } from '@/lib/api'
import { HomePage } from '@/components/home-page'
import { Skeleton } from '@/components/ui/skeleton'

function HomePageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-6 w-24 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-3/4 w-full rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      const data = await fetchAllSeries({})
      return { series: data.series, offline: false }
    } catch {
      // Offline or server unreachable — flag it so HomePage shows downloads
      return { series: [], offline: true }
    }
  },
  pendingComponent: HomePageSkeleton,
  component: HomePage,
})
