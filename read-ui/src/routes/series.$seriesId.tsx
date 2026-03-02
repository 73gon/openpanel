import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft,
  Book02Icon,
  Star,
  UserCircleIcon,
  Calendar01Icon,
  Loading03Icon,
  Refresh,
  ArrowDown01Icon,
  ArrowUp01Icon,
  GridViewIcon,
  Menu02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import {
  fetchBooks,
  fetchProgress,
  rescanSeries,
  getPageUrl,
  type Book,
  type ReadingProgress,
} from '@/lib/api'
import {
  searchManga,
  refreshManga,
  getAnilistCover,
  getAnilistBanner,
  formatStatus,
  getAuthor,
  type AnilistMedia,
} from '@/lib/anilist'
import { useAppStore } from '@/lib/store'

function SeriesDetailSkeleton() {
  return (
    <div className="relative mx-auto max-w-5xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-16 rounded" />
      <div className="flex flex-col gap-8 md:flex-row">
        <Skeleton className="aspect-3/4 w-48 shrink-0 rounded-lg md:w-56" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-64 rounded" />
          <Skeleton className="h-4 w-48 rounded" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-16 w-full rounded" />
        </div>
      </div>
      <Skeleton className="my-8 h-px w-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/series/$seriesId')({
  loader: async ({ params }) => {
    const data = await fetchBooks(params.seriesId)
    // Start anilist + progress fetches in parallel (non-blocking for render)
    const [aniMedia, ...progressResults] = await Promise.all([
      searchManga(data.series.name),
      ...data.books.map((b) => fetchProgress(b.id)),
    ])
    const progressMap: Record<string, ReadingProgress> = {}
    progressResults.forEach((p, i) => {
      if (p) progressMap[data.books[i].id] = p as ReadingProgress
    })
    return {
      seriesName: data.series.name,
      books: data.books,
      media: aniMedia as AnilistMedia | null,
      progress: progressMap,
    }
  },
  pendingComponent: SeriesDetailSkeleton,
  component: SeriesDetailPage,
})

function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="max-w-2xl">
      <p
        className={`text-sm leading-relaxed text-muted-foreground ${
          expanded ? '' : 'line-clamp-2'
        }`}
      >
        {text}
      </p>
      {text.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
            size={12}
          />
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function SeriesDetailPage() {
  const { seriesId } = Route.useParams()
  const loaderData = Route.useLoaderData()
  const [seriesName, setSeriesName] = useState(loaderData.seriesName)
  const [books, setBooks] = useState<Book[]>(loaderData.books)
  const [media, setMedia] = useState<AnilistMedia | null>(loaderData.media)
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>(
    loaderData.progress,
  )
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [rescanning, setRescanning] = useState(false)

  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)

  const handleRescan = async () => {
    setRescanning(true)
    try {
      await rescanSeries(seriesId)
      // Re-fetch book data
      const data = await fetchBooks(seriesId)
      setSeriesName(data.series.name)
      setBooks(data.books)
      // Force-refresh Anilist metadata (bypass cache)
      const freshMedia = await refreshManga(data.series.name)
      setMedia(freshMedia)
      setCoverLoaded(false)
      // Re-fetch progress
      const progressResults = await Promise.all(
        data.books.map((b) => fetchProgress(b.id)),
      )
      const progressMap: Record<string, ReadingProgress> = {}
      progressResults.forEach((p, i) => {
        if (p) progressMap[data.books[i].id] = p as ReadingProgress
      })
      setProgress(progressMap)
    } catch (err) {
      console.error('Rescan failed:', err)
    } finally {
      setRescanning(false)
    }
  }

  const cover = getAnilistCover(media)
  const banner = getAnilistBanner(media)
  const author = getAuthor(media)

  // Detect if books are volumes or chapters based on first book title
  const bookLabel =
    books.length > 0 && books[0].title.toLowerCase().startsWith('volume')
      ? 'volume'
      : 'chapter'

  const viewMode = bookLabel === 'volume' ? volumeViewMode : chapterViewMode
  const setViewMode =
    bookLabel === 'volume' ? setVolumeViewMode : setChapterViewMode

  return (
    <div className="relative min-h-full">
      {/* Blurred Background Cover */}
      {(banner || cover) && (
        <div className="absolute inset-x-0 top-0 h-96 overflow-hidden">
          <img
            src={banner || cover!}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-b from-background/60 via-background/80 to-background backdrop-blur-xl" />
        </div>
      )}

      <div className="relative mx-auto max-w-5xl px-6 py-8">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Link to="/">
            <Button variant="ghost" size="sm" className="mb-6 gap-2">
              <HugeiconsIcon icon={ArrowLeft} size={16} />
              Back
            </Button>
          </Link>
        </motion.div>

        {/* Series Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col gap-8 md:flex-row"
        >
          {/* Cover */}
          <div className="relative w-48 shrink-0 self-start md:w-56">
            <div className="aspect-3/4 overflow-hidden rounded-lg bg-muted shadow-xl">
              {cover ? (
                <img
                  src={cover}
                  alt={seriesName}
                  className={`h-full w-full object-cover transition-opacity duration-500 ${
                    coverLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  onLoad={() => setCoverLoaded(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <HugeiconsIcon
                    icon={Book02Icon}
                    size={48}
                    className="text-muted-foreground/30"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                {media?.title?.english || media?.title?.romaji || seriesName}
              </h1>
              {media?.title?.romaji && media?.title?.english && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {media.title.romaji}
                </p>
              )}
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-3">
              {media?.status && (
                <Badge variant="secondary">{formatStatus(media.status)}</Badge>
              )}
              {media?.averageScore && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <HugeiconsIcon
                    icon={Star}
                    size={14}
                    className="text-yellow-500"
                  />
                  {(media.averageScore / 10).toFixed(1)}
                </div>
              )}
              {media?.chapters && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Book02Icon} size={14} />
                  {media.chapters} chapters
                </div>
              )}
              {author && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={UserCircleIcon} size={14} />
                  {author}
                </div>
              )}
              {media?.startDate?.year && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Calendar01Icon} size={14} />
                  {media.startDate.year}
                  {media.endDate?.year &&
                  media.endDate.year !== media.startDate.year
                    ? `–${media.endDate.year}`
                    : ''}
                </div>
              )}
            </div>

            {/* Genres */}
            {media?.genres && media.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {media.genres.map((g) => (
                  <Badge key={g} variant="outline" className="text-xs">
                    {g}
                  </Badge>
                ))}
              </div>
            )}

            {/* Description */}
            {media?.description && (
              <ExpandableDescription
                text={media.description.replace(/<[^>]*>/g, '')}
              />
            )}

            {/* Local info */}
            <p className="text-xs text-muted-foreground/60">
              {books.length} {bookLabel === 'volume' ? 'volumes' : 'chapters'}{' '}
              in library
            </p>
          </div>
        </motion.div>

        <Separator className="my-8" />

        {/* Chapter List */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {bookLabel === 'volume' ? 'Volumes' : 'Chapters'}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${viewMode === 'list' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setViewMode('list')}
              >
                <HugeiconsIcon icon={Menu02Icon} size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${viewMode === 'grid' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setViewMode('grid')}
              >
                <HugeiconsIcon icon={GridViewIcon} size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRescan}
                disabled={rescanning}
                className="gap-2 text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={rescanning ? Loading03Icon : Refresh}
                  size={14}
                  className={rescanning ? 'animate-spin' : ''}
                />
                {rescanning ? 'Rescanning...' : 'Rescan'}
              </Button>
            </div>
          </div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {books.map((book, i) => {
                const prog = progress[book.id]
                const pct = prog
                  ? Math.round((prog.page / book.page_count) * 100)
                  : 0
                const isCompleted = prog?.is_completed

                return (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.15,
                      delay: Math.min(i * 0.015, 0.3),
                      ease: 'easeOut',
                    }}
                  >
                    <Link to="/read/$bookId" params={{ bookId: book.id }}>
                      <div className="group relative cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-card transition-all hover:border-border hover:shadow-md">
                        <div className="aspect-3/4 w-full overflow-hidden bg-muted">
                          <img
                            src={getPageUrl(book.id, 1)}
                            alt={book.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-medium">
                            {book.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {book.page_count} pages
                            {isCompleted && ' · Done'}
                            {prog && !isCompleted && ` · ${pct}%`}
                          </p>
                        </div>
                        {/* Progress bar at bottom */}
                        {pct > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5">
                            <div
                              className={`h-full transition-all ${
                                isCompleted ? 'bg-green-500' : 'bg-primary'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          ) : (
          <div className="grid gap-2">
            {books.map((book, i) => {
              const prog = progress[book.id]
              const pct = prog
                ? Math.round((prog.page / book.page_count) * 100)
                : 0
              const isCompleted = prog?.is_completed

              return (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.15,
                    delay: Math.min(i * 0.015, 0.3),
                    ease: 'easeOut',
                  }}
                >
                  <Link to="/read/$bookId" params={{ bookId: book.id }}>
                    <div className="group relative cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-card px-4 py-3 transition-all hover:border-border hover:bg-accent/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-8 text-center text-xs font-medium text-muted-foreground">
                            {book.sort_order}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{book.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {book.page_count} pages
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs">
                              Completed
                            </Badge>
                          )}
                          {prog && !isCompleted && (
                            <span className="text-xs text-muted-foreground">
                              {prog.page}/{book.page_count}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress bar at bottom */}
                      {pct > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5">
                          <div
                            className={`h-full transition-all ${
                              isCompleted ? 'bg-green-500' : 'bg-primary'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
          )}
        </section>
      </div>
    </div>
  )
}
