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
  Settings01Icon,
  FilterIcon,
  SortingIcon,
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
} from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'

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
                  className={`relative h-full w-full object-contain transition-all duration-200 group-hover:scale-102 ${
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
          <CardContent className="flex items-center gap-4 p-3">
            <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
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
  const { series: loaderSeries } = routeApi.useLoaderData()
  const [allSeries, setAllSeries] = useState<Series[]>(loaderSeries)
  const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>(
    [],
  )
  const [recentlyAdded, setRecentlyAdded] = useState<Series[]>([])
  const [recentlyUpdated, setRecentlyUpdated] = useState<Series[]>([])
  const [sections, setSections] = useState<SectionVisibility>(defaultSections)
  const [showSectionSettings, setShowSectionSettings] = useState(false)

  // Filter & Sort state
  const [sortBy, setSortBy] = useState<
    'name' | 'year' | 'score' | 'recently_added'
  >('name')
  const [filterGenre, setFilterGenre] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchContinueReading()
      .then(setContinueReading)
      .catch(() => {})
    fetchRecentlyAdded(10)
      .then(setRecentlyAdded)
      .catch(() => {})
    fetchRecentlyUpdated(10)
      .then(setRecentlyUpdated)
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
  }, [])

  // Re-fetch library when filters/sort change
  useEffect(() => {
    const params: {
      sort?: 'name' | 'year' | 'score' | 'recently_added'
      genre?: string
      status?: string
    } = {}
    if (sortBy !== 'name') params.sort = sortBy
    if (filterGenre) params.genre = filterGenre
    if (filterStatus) params.status = filterStatus
    // Only re-fetch if we have actual filter/sort changes
    if (sortBy !== 'name' || filterGenre || filterStatus) {
      fetchAllSeries(params)
        .then((data) => setAllSeries(data.series))
        .catch(() => {})
    } else {
      setAllSeries(loaderSeries)
    }
  }, [sortBy, filterGenre, filterStatus, loaderSeries])

  const toggleSection = (key: keyof SectionVisibility) => {
    const updated = { ...sections, [key]: !sections[key] }
    setSections(updated)
    updatePreferences({ homeSections: updated }).catch(() => {})
  }

  const displayedRecents = useMemo(
    () => continueReading.slice(0, 3),
    [continueReading],
  )

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Section settings toggle */}
      <div className="mb-6 flex items-center justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setShowSectionSettings((p) => !p)}
          title="Customize sections"
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} />
        </Button>
      </div>

      {/* Section settings panel */}
      {showSectionSettings && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium">Home Sections</p>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ['continueReading', 'Continue Reading'],
                ['recentlyAdded', 'Recently Added'],
                ['recentlyUpdated', 'Recently Updated'],
              ] as [keyof SectionVisibility, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleSection(key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  sections[key]
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

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
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Genre:</span>
              <input
                type="text"
                placeholder="e.g. Action"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs w-24"
              />
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
            {(filterGenre || filterStatus || sortBy !== 'name') && (
              <button
                onClick={() => {
                  setSortBy('name')
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
