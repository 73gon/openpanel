import { useState, useMemo, useEffect } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
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
import {
  getDownloadsBySeries,
  getDownloadedCover,
  type SeriesDownloadGroup,
} from '@/lib/downloads'

const routeApi = getRouteApi('/')

// -- Series Card --

function SeriesCard({ series, index }: { series: Series; index: number }) {
  const cover = series.anilist_cover_url ?? null
  const [loaded, setLoaded] = useState(false)

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
        <Card className="group cursor-pointer overflow-hidden border-0 bg-transparent shadow-none transition-transform hover:scale-[1.02] pt-0">
          <CardContent className="p-0">
            <div className="relative aspect-5.5/8 w-full overflow-hidden rounded-lg bg-background">
              {cover ? (
                <img
                  src={cover}
                  alt={series.name}
                  className={`relative h-full w-full object-cover transition-all duration-200 group-hover:scale-102 ${
                    loaded ? 'opacity-100' : 'opacity-0'
                  }`}
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
                <Skeleton className="absolute inset-0 rounded-lg" />
              )}
            </div>
            <div className="mt-2 space-y-0.5 px-0.5">
              <p className="truncate text-sm font-medium leading-tight">
                {displaySeriesName(series.name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {series.book_count}{' '}
                {series.book_type === 'volume' ? 'volumes' : 'chapters'}
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

// -- Continue Reading Card --

function ContinueReadingCard({
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
}

// -- Home Page --

interface SectionVisibility {
  continueReading: boolean
  recentlyAdded: boolean
  recentlyUpdated: boolean
}

const defaultSections: SectionVisibility = {
  continueReading: true,
  recentlyAdded: true,
  recentlyUpdated: true,
}

export function HomePage() {
  const { series: loaderSeries, offline } = routeApi.useLoaderData()
  const [allSeries, setAllSeries] = useState<Series[]>(loaderSeries)
  const [offlineGroups, setOfflineGroups] = useState<SeriesDownloadGroup[]>([])
  const [offlineCovers, setOfflineCovers] = useState<Record<string, string>>({})
  const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>(
    [],
  )
  const [recentlyAdded, setRecentlyAdded] = useState<Series[]>([])
  const [recentlyUpdated, setRecentlyUpdated] = useState<Series[]>([])
  const [sections, setSections] = useState<SectionVisibility>(defaultSections)

  // Filter & Sort state
  const [sortBy, setSortBy] = useState<
    'name' | 'year' | 'score' | 'recently_added'
  >('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterGenre, setFilterGenre] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [availableGenres, setAvailableGenres] = useState<string[]>([])

  useEffect(() => {
    if (offline) return // Don't try to fetch when offline
    fetchContinueReading()
      .then(setContinueReading)
      .catch(() => {})
    fetchRecentlyAdded(10)
      .then(setRecentlyAdded)
      .catch(() => {})
    fetchRecentlyUpdated(10)
      .then(setRecentlyUpdated)
      .catch(() => {})
    fetchAvailableGenres()
      .then(setAvailableGenres)
      .catch(() => {})
    // Load section prefs
    fetchPreferences()
      .then((prefs) => {
        if (prefs.homeSections && typeof prefs.homeSections === 'object') {
          setSections({
            ...defaultSections,
            ...(prefs.homeSections as Partial<SectionVisibility>),
          })
        }
      })
      .catch(() => {})
  }, [offline])

  // Load downloaded series when offline
  useEffect(() => {
    if (!offline) return
    getDownloadsBySeries().then(async (groups) => {
      setOfflineGroups(groups)
      // Load covers from IDB
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

  // Re-fetch library when filters/sort change
  useEffect(() => {
    const params: {
      sort?: 'name' | 'year' | 'score' | 'recently_added'
      sortDir?: 'asc' | 'desc'
      genre?: string
      status?: string
    } = {}
    if (sortBy !== 'name') params.sort = sortBy
    params.sortDir = sortDir
    if (filterGenre) params.genre = filterGenre
    if (filterStatus) params.status = filterStatus
    // Always re-fetch with sort direction and filter params
    if (sortBy !== 'name' || sortDir !== 'asc' || filterGenre || filterStatus) {
      fetchAllSeries(params)
        .then((data) => setAllSeries(data.series))
        .catch(() => {})
    } else {
      setAllSeries(loaderSeries)
    }
  }, [sortBy, sortDir, filterGenre, filterStatus, loaderSeries])

  const toggleSection = (key: keyof SectionVisibility) => {
    const updated = { ...sections, [key]: !sections[key] }
    setSections(updated)
    updatePreferences({ homeSections: updated }).catch(() => {})
  }

  const displayedRecents = useMemo(
    () => continueReading.slice(0, 3),
    [continueReading],
  )

  // Offline mode: show only downloaded series
  if (offline) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
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

      {/* Library Series Grid */}
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

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {allSeries.map((series, i) => (
            <SeriesCard key={series.id} series={series} index={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
