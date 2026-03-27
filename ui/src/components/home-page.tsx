import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type SectionVisibility, defaultSections } from '@/lib/types'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Book02Icon,
  Clock01Icon,
  ArrowRight,
  Add01Icon,
  Refresh,
  FilterIcon,
  SortingIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Download04Icon,
  WifiDisconnected01Icon,
  Loading03Icon,
  Star,
} from '@hugeicons/core-free-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  type Series,
  type ContinueReadingItem,
  fetchContinueReading,
  fetchRecentlyAdded,
  fetchRecentlyUpdated,
  fetchPreferences,
  updatePreferences,
  fetchAllSeries,
  fetchAvailableGenres,
} from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import { toast } from 'sonner'
import {
  getDownloadsBySeries,
  getDownloadedCover,
  type SeriesDownloadGroup,
} from '@/lib/downloads'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { queryClient, queryKeys } from '@/lib/query'

const routeApi = getRouteApi('/')

const SERIES_PER_PAGE = 36

// -- Series Card (React.memo — Task 50) --

const SeriesCard = memo(function SeriesCard({
  series,
  index,
}: {
  series: Series
  index: number
}) {
  const cover = series.anilist_cover_url ?? null
  const [loaded, setLoaded] = useState(false)
  const score = series.anilist_score ? (series.anilist_score / 10).toFixed(1) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.03, 0.3),
        ease: 'easeOut',
      }}
    >
      <Link to="/series/$seriesId" params={{ seriesId: series.id }}>
        <div className="group relative cursor-pointer overflow-hidden rounded-xl">
          <div className="relative aspect-5.5/8 w-full bg-muted">
            {cover ? (
              <img
                src={cover}
                srcSet={`${cover} 1x`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                alt={series.name}
                className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <HugeiconsIcon
                  icon={Book02Icon}
                  size={32}
                  className="text-muted-foreground/40"
                />
              </div>
            )}
            {!loaded && cover && (
              <Skeleton className="absolute inset-0 rounded-xl" />
            )}
            {/* Year badge — top-left, hover only */}
            {series.year && (
              <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] group-hover:opacity-100">
                {series.year}
              </div>
            )}
            {/* Score badge — top-right, hover only */}
            {score && (
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] group-hover:opacity-100">
                <HugeiconsIcon icon={Star} size={11} className="text-yellow-400" />
                {score}
              </div>
            )}
            {/* Always-visible bottom gradient with name + count */}
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
              <p className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {displaySeriesName(series.name)}
              </p>
              <p className="mt-0.5 text-xs text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {series.book_count}{' '}
                {series.book_type === 'volume' ? 'volumes' : 'chapters'}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
})

// -- Continue Reading Card (React.memo — Task 50) --

const ContinueReadingCard = memo(function ContinueReadingCard({
  item,
  index,
}: {
  item: ContinueReadingItem
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08, ease: 'easeOut' }}
    >
      <Link to="/read/$bookId" params={{ bookId: item.book_id }}>
        <Card className="group cursor-pointer overflow-hidden border border-border/50 transition-all hover:border-border hover:shadow-md">
          <CardContent className="flex items-center gap-3 py-1.5 px-3">
            <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
              {item.cover_url ? (
                <img
                  src={item.cover_url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <HugeiconsIcon
                    icon={Book02Icon}
                    size={16}
                    className="text-muted-foreground/40"
                  />
                </div>
              )}
              {/* Progress bar at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted-foreground/20">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((item.page / item.total_pages) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.series_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.book_title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {item.page}/{item.total_pages} pages
              </p>
            </div>
            <HugeiconsIcon
              icon={ArrowRight}
              size={16}
              className="text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
            />
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
})

// -- Columns helper for virtual grid --
function useGridColumns() {
  const [cols, setCols] = useState(getColumnCount)

  useEffect(() => {
    function handleResize() {
      setCols(getColumnCount())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return cols
}

function getColumnCount(): number {
  const w = window.innerWidth
  if (w >= 1280) return 6
  if (w >= 1024) return 5
  if (w >= 768) return 4
  if (w >= 640) return 3
  return 2
}

// -- Home Page --

export function HomePage() {
  const { series: loaderSeries, offline } = routeApi.useLoaderData()
  const [offlineGroups, setOfflineGroups] = useState<SeriesDownloadGroup[]>([])
  const [offlineCovers, setOfflineCovers] = useState<Record<string, string>>({})

  // Filter & Sort state
  const [sortBy, setSortBy] = useState<
    'name' | 'year' | 'score' | 'recently_added'
  >('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterGenre, setFilterGenre] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // --- TanStack Query (Task 48) — replace useEffect + useState ---

  const { data: continueReading = [] } = useQuery({
    queryKey: queryKeys.continueReading(),
    queryFn: fetchContinueReading,
    enabled: !offline,
  })

  const { data: recentlyAdded = [] } = useQuery({
    queryKey: queryKeys.recentlyAdded(10),
    queryFn: () => fetchRecentlyAdded(10),
    enabled: !offline,
  })

  const { data: recentlyUpdated = [] } = useQuery({
    queryKey: queryKeys.recentlyUpdated(10),
    queryFn: () => fetchRecentlyUpdated(10),
    enabled: !offline,
  })

  const { data: availableGenres = [] } = useQuery({
    queryKey: queryKeys.genres(),
    queryFn: fetchAvailableGenres,
    enabled: !offline,
    staleTime: 5 * 60_000,
  })

  const { data: sections = defaultSections } = useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: async () => {
      const prefs = await fetchPreferences()
      if (prefs.homeSections && typeof prefs.homeSections === 'object') {
        return {
          ...defaultSections,
          ...(prefs.homeSections as Partial<SectionVisibility>),
        }
      }
      return defaultSections
    },
    enabled: !offline,
    staleTime: 60_000,
  })

  // --- Infinite scroll (Task 53) ---

  const filterKey = useMemo(
    () => ({ sortBy, sortDir, filterGenre, filterStatus }),
    [sortBy, sortDir, filterGenre, filterStatus],
  )

  const hasActiveFilters =
    sortBy !== 'name' || sortDir !== 'asc' || filterGenre || filterStatus

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.allSeries(filterKey),
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, unknown> = {
        page: pageParam,
        perPage: SERIES_PER_PAGE,
      }
      if (sortBy !== 'name') params.sort = sortBy
      params.sortDir = sortDir
      if (filterGenre) params.genre = filterGenre
      if (filterStatus) params.status = filterStatus
      return fetchAllSeries(params as Parameters<typeof fetchAllSeries>[0])
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.series.length < SERIES_PER_PAGE) return undefined
      return (lastPageParam as number) + 1
    },
    initialData:
      !hasActiveFilters && loaderSeries.length > 0
        ? {
            pages: [{ series: loaderSeries, total: loaderSeries.length }],
            pageParams: [1],
          }
        : undefined,
    enabled: !offline,
  })

  const allSeries = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.series) ?? loaderSeries,
    [infiniteData, loaderSeries],
  )

  // Intersection observer for infinite scroll trigger
  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // --- Virtual scrolling (Task 49) ---

  const cols = useGridColumns()
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = Math.ceil(allSeries.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280,
    overscan: 3,
  })

  const toggleSection = useCallback(
    (key: keyof SectionVisibility) => {
      const updated = { ...sections, [key]: !sections[key] }
      updatePreferences({ homeSections: updated }).catch((e: Error) => {
        toast.error('Failed to save preference', { description: e.message })
      })
    },
    [sections],
  )

  const displayedRecents = useMemo(
    () => continueReading.slice(0, 3),
    [continueReading],
  )

  // Load downloaded series when offline
  useEffect(() => {
    if (!offline) return
    getDownloadsBySeries().then(async (groups) => {
      setOfflineGroups(groups)
      const covers: Record<string, string> = {}
      for (const g of groups) {
        const url = await getDownloadedCover(
          `/api/series/${g.seriesId}/thumbnail`,
        )
        if (url) covers[g.seriesId] = url
      }
      setOfflineCovers(covers)
    })
  }, [offline])

  // Offline mode: show only downloaded series
  if (offline) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <HugeiconsIcon
            icon={WifiDisconnected01Icon}
            size={18}
            className="text-muted-foreground"
          />
          <p className="text-sm">
            <span className="font-medium">You're offline</span>
            <span className="text-muted-foreground">
              {' '}
              — showing downloaded series
            </span>
          </p>
        </div>
        {offlineGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HugeiconsIcon
              icon={Download04Icon}
              size={48}
              className="mb-4 text-muted-foreground/30"
            />
            <p className="text-muted-foreground">No downloads available</p>
            <p className="mt-1 text-sm text-muted-foreground/60">
              Download series while online to read them offline.
            </p>
          </div>
        ) : (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <HugeiconsIcon
                icon={Book02Icon}
                size={18}
                className="text-muted-foreground"
              />
              <h2 className="text-lg font-semibold">Downloaded</h2>
              <span className="text-sm text-muted-foreground">
                {offlineGroups.length} series
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {offlineGroups.map((group, i) => (
                <motion.div
                  key={group.seriesId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(i * 0.03, 0.3),
                    ease: 'easeOut',
                  }}
                >
                  <Link to="/downloads">
                    <Card className="group cursor-pointer overflow-hidden border-0 bg-transparent shadow-none transition-transform hover:scale-[1.02] pt-0">
                      <CardContent className="p-0">
                        <div className="relative aspect-5.5/8 w-full overflow-hidden rounded-lg bg-background">
                          {offlineCovers[group.seriesId] ? (
                            <img
                              src={offlineCovers[group.seriesId]}
                              alt={group.seriesName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <HugeiconsIcon
                                icon={Book02Icon}
                                size={32}
                                className="text-muted-foreground/40"
                              />
                            </div>
                          )}
                        </div>
                        <div className="mt-2 space-y-0.5 px-0.5">
                          <p className="truncate text-sm font-medium leading-tight">
                            {group.seriesName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.completedBooks} downloaded
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.continueReading() })
    await queryClient.invalidateQueries({ queryKey: queryKeys.recentlyAdded(10) })
    await queryClient.invalidateQueries({ queryKey: queryKeys.recentlyUpdated(10) })
    await queryClient.invalidateQueries({ queryKey: ['allSeries'] })
  }, [])

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Continue Reading */}
      {sections.continueReading && displayedRecents.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <HugeiconsIcon
              icon={Clock01Icon}
              size={18}
              className="text-muted-foreground"
            />
            <h2 className="text-lg font-semibold">Continue Reading</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayedRecents.map((item, i) => (
              <ContinueReadingCard key={item.book_id} item={item} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Added */}
      {sections.recentlyAdded && recentlyAdded.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <HugeiconsIcon
              icon={Add01Icon}
              size={18}
              className="text-muted-foreground"
            />
            <h2 className="text-lg font-semibold">Recently Added</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recentlyAdded.map((series, i) => (
              <SeriesCard key={series.id} series={series} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Updated */}
      {sections.recentlyUpdated && recentlyUpdated.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <HugeiconsIcon
              icon={Refresh}
              size={18}
              className="text-muted-foreground"
            />
            <h2 className="text-lg font-semibold">Recently Updated</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recentlyUpdated.map((series, i) => (
              <SeriesCard key={series.id} series={series} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Library Series Grid — Virtualized + Infinite Scroll */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Book02Icon}
              size={18}
              className="text-muted-foreground"
            />
            <h2 className="text-lg font-semibold">Library</h2>
            <span className="text-sm text-muted-foreground">
              {allSeries.length} series
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${showFilters ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setShowFilters((p) => !p)}
              title="Filter & Sort"
              aria-label="Filter and sort"
            >
              <HugeiconsIcon icon={FilterIcon} size={16} />
            </Button>
          </div>
        </div>

        {/* Filter & Sort toolbar */}
        {showFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon
                icon={SortingIcon}
                size={14}
                className="text-muted-foreground"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="name">Name</option>
                <option value="year">Year</option>
                <option value="score">Score</option>
                <option value="recently_added">Recently Added</option>
              </select>
              <button
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                className="rounded-md border border-border bg-background p-1 hover:bg-accent transition-colors"
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
              >
                <HugeiconsIcon
                  icon={sortDir === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
                  size={14}
                  className="text-muted-foreground"
                />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Genre:</span>
              <select
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">All</option>
                {availableGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">All</option>
                <option value="FINISHED">Finished</option>
                <option value="RELEASING">Releasing</option>
                <option value="NOT_YET_RELEASED">Not Yet Released</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="HIATUS">Hiatus</option>
              </select>
            </div>
            {(filterGenre ||
              filterStatus ||
              sortBy !== 'name' ||
              sortDir !== 'asc') && (
              <button
                onClick={() => {
                  setSortBy('name')
                  setSortDir('asc')
                  setFilterGenre('')
                  setFilterStatus('')
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Virtualized grid */}
        <div
          ref={parentRef}
          className="relative"
          style={{ minHeight: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const startIdx = virtualRow.index * cols
            const rowSeries = allSeries.slice(startIdx, startIdx + cols)

            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 right-0 grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rowSeries.map((series, i) => (
                  <SeriesCard
                    key={series.id}
                    series={series}
                    index={startIdx + i}
                  />
                ))}
              </div>
            )
          })}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={loadMoreRef} className="h-1" />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={16}
              className="animate-spin"
            />
            Loading more…
          </div>
        )}
      </section>

    </div>
    </PullToRefresh>
  )
}
