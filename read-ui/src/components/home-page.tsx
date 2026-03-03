import { useState, useEffect, useMemo } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Book02Icon, Clock01Icon, ArrowRight } from '@hugeicons/core-free-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type Series } from '@/lib/api'
import {
  searchManga,
  getAnilistCover,
  syncMetadataCache,
  displaySeriesName,
} from '@/lib/anilist'
import { useAppStore, type RecentRead } from '@/lib/store'

const routeApi = getRouteApi('/')

// ── Series Card ──

function SeriesCard({
  series,
  index,
  initialCover,
}: {
  series: Series
  index: number
  initialCover?: string | null
}) {
  const [cover, setCover] = useState<string | null>(initialCover ?? null)
  const [loaded, setLoaded] = useState(false)

  // If no initial cover was provided (sync hasn't finished yet), look it up
  useEffect(() => {
    if (cover) return
    let cancelled = false
    searchManga(series.name).then((media) => {
      if (cancelled) return
      const url = getAnilistCover(media)
      setCover(url)
    })
    return () => {
      cancelled = true
    }
  }, [series.name, cover])

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
        <Card className="group cursor-pointer overflow-hidden border-0 bg-transparent shadow-none transition-transform hover:scale-[1.01] pt-0">
          <CardContent className="p-0">
            <div className="relative aspect-5.5/8 w-full overflow-hidden rounded-lg bg-background transition-colors group-hover:border group-hover:border-foreground">
              {cover ? (
                <>
                  <img
                    src={cover}
                    alt={series.name}
                    className={`relative h-full w-full object-contain transition-all duration-500 group-hover:scale-105 ${
                      loaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setLoaded(true)}
                  />
                </>
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

// ── Continue Reading Card ──

function ContinueReadingCard({
  read,
  index,
}: {
  read: RecentRead
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08, ease: 'easeOut' }}
    >
      <Link to="/read/$bookId" params={{ bookId: read.bookId }}>
        <Card className="group cursor-pointer overflow-hidden border border-border/50 transition-all hover:border-border hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-3">
            <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
              {read.coverUrl ? (
                <img
                  src={read.coverUrl}
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
                    width: `${Math.round((read.page / read.totalPages) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{read.seriesName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {read.bookTitle}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {read.page}/{read.totalPages} pages
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

// ── Home Page ──

export function HomePage() {
  const { series: loaderSeries } = routeApi.useLoaderData()
  const [allSeries] = useState<Series[]>(loaderSeries)
  const [covers, setCovers] = useState<Record<string, string | null>>({})
  const recentReads = useAppStore((s) => s.recentReads)

  const displayedRecents = useMemo(() => recentReads.slice(0, 3), [recentReads])

  useEffect(() => {
    let cancelled = false
    // Sync metadata cache — only fetches for new series, removes stale ones
    const names = allSeries.map((s) => s.name)
    syncMetadataCache(names).then(({ fetched, removed }) => {
      if (fetched > 0 || removed > 0) {
        console.log(`[anilist] Synced: ${fetched} fetched, ${removed} removed`)
      }
      // After sync, resolve covers from cache
      if (!cancelled) {
        Promise.all(
          allSeries.map(async (s) => {
            const media = await searchManga(s.name)
            return [s.id, getAnilistCover(media)] as const
          }),
        ).then((results) => {
          if (cancelled) return
          const coverMap: Record<string, string | null> = {}
          for (const [id, url] of results) coverMap[id] = url
          setCovers(coverMap)
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [allSeries])
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Continue Reading */}
      {displayedRecents.length > 0 && (
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
            {displayedRecents.map((read, i) => (
              <ContinueReadingCard key={read.bookId} read={read} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Library Series Grid */}
      <section>
        <div className="mb-4 flex items-center gap-2">
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

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {allSeries.map((series, i) => (
            <SeriesCard
              key={series.id}
              series={series}
              index={i}
              initialCover={covers[series.id]}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
