import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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
  Tick01Icon,
  Settings02Icon,
  Cancel01Icon,
  FolderLibraryIcon,
  Add01Icon,
  Download04Icon,
  PlayIcon,
  CheckmarkSquare01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'

import {
  fetchBooks,
  fetchBatchProgress,
  rescanSeries,
  fetchSeriesMetadata,
  refreshSeriesMetadata,
  setSeriesAnilistId,
  clearSeriesAnilistId,
  fetchSeriesChapters,
  fetchSeriesContinue,
  getThumbnailUrl,
  getPageUrl,
  fetchCollections,
  addToCollection,
  bulkMarkProgress,
  type Book,
  type ReadingProgress,
  type SeriesMetadata,
  type SeriesChapter,
  type Collection,
  type SeriesContinueResponse,
} from '@/lib/api'
import { formatStatus, getDisplayTitle, getRomajiSubtitle } from '@/lib/anilist'
import { useAppStore } from '@/lib/store'
import { usePWA } from '@/lib/use-pwa'
import { isBookDownloaded } from '@/lib/downloads'
import { useDownloadStore, type QueueItem } from '@/lib/download-store'
import { CircularProgress } from '@/components/ui/circular-progress'
import { toast } from 'sonner'
import { ContinueFab, InstallPromptModal } from '@/components/series'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { stripTitleZeros } from '@/lib/utils'

function SeriesDetailSkeleton() {
  return (
    <div className="relative mx-auto max-w-7xl px-6 py-8">
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
    // Start metadata + batch progress + chapters + continue fetch in parallel
    const [metadata, progressMap, chaptersData, continueData] =
      await Promise.all([
        fetchSeriesMetadata(params.seriesId).catch(() => null),
        fetchBatchProgress(data.books.map((b) => b.id)),
        fetchSeriesChapters(params.seriesId).catch(() => ({
          series_id: params.seriesId,
          total_chapters: 0,
          chapters: [],
        })),
        fetchSeriesContinue(params.seriesId).catch(() => null),
      ])
    return {
      seriesName: data.series.name,
      books: data.books,
      metadata: metadata as SeriesMetadata | null,
      progress: progressMap,
      seriesChapters: chaptersData.chapters as SeriesChapter[],
      continueData: continueData as SeriesContinueResponse | null,
    }
  },
  pendingComponent: SeriesDetailSkeleton,
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="mb-2 text-xl font-semibold">Failed to load series</h2>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Retry
      </button>
    </div>
  ),
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

  // Scroll to top on mount / route change
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }, [seriesId])

  const [seriesName, setSeriesName] = useState(loaderData.seriesName)
  const [books, setBooks] = useState<Book[]>(loaderData.books)
  const [metadata, setMetadata] = useState<SeriesMetadata | null>(
    loaderData.metadata,
  )
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>(
    loaderData.progress,
  )
  const [seriesChapters] = useState<SeriesChapter[]>(loaderData.seriesChapters)
  const [continueInfo, setContinueInfo] =
    useState<SeriesContinueResponse | null>(loaderData.continueData)
  const [displayMode, setDisplayMode] = useState<'volumes' | 'chapters'>(
    'volumes',
  )
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [anilistIdInput, setAnilistIdInput] = useState('')
  const [settingId, setSettingId] = useState(false)
  const [showAnilistPopover, setShowAnilistPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Continue/Start banner
  const bannerRef = useRef<HTMLDivElement>(null)
  const [showFab, setShowFab] = useState(false)

  // Collections
  const [showCollectionPopover, setShowCollectionPopover] = useState(false)
  const [userCollections, setUserCollections] = useState<Collection[]>([])
  const [addingToCollection, setAddingToCollection] = useState<string | null>(
    null,
  )
  const collectionPopoverRef = useRef<HTMLDivElement>(null)

  const isAdmin = useAppStore((s) => s.user?.is_admin) ?? false

  // Bulk select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set())

  const toggleSelectBook = useCallback((bookId: string) => {
    setSelectedBooks((prev) => {
      const next = new Set(prev)
      if (next.has(bookId)) next.delete(bookId)
      else next.add(bookId)
      return next
    })
  }, [])

  const handleBulkMark = useCallback(
    async (isCompleted: boolean) => {
      const ids = Array.from(selectedBooks)
      if (ids.length === 0) return
      try {
        await bulkMarkProgress(ids, isCompleted)
        // Small delay to ensure DB write is flushed before refetch
        await new Promise((r) => setTimeout(r, 100))
        // Refresh progress and continue info
        const [progressMap, freshContinue] = await Promise.all([
          fetchBatchProgress(books.map((b) => b.id)),
          fetchSeriesContinue(seriesId).catch(() => null),
        ])
        setProgress({ ...progressMap })
        setContinueInfo(freshContinue)
        setSelectedBooks(new Set())
        setSelectMode(false)
        toast.success(
          isCompleted
            ? `Marked ${ids.length} as read`
            : `Marked ${ids.length} as unread`,
        )
      } catch (err) {
        toast.error('Bulk update failed', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [selectedBooks, books, seriesId],
  )

  // Downloads (PWA)
  const { isPWA } = usePWA()
  const [downloadedBooks, setDownloadedBooks] = useState<Set<string>>(new Set())
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const downloadStatuses = useDownloadStore((s) => s.statuses)
  const { addToQueue, pauseDownload, resumeDownload } = useDownloadStore()

  // Check which books are already downloaded
  useEffect(() => {
    async function checkDownloads() {
      const downloaded = new Set<string>()
      for (const book of books) {
        if (await isBookDownloaded(book.id)) {
          downloaded.add(book.id)
        }
      }
      setDownloadedBooks(downloaded)
    }
    checkDownloads()
  }, [books])

  const handleDownloadBook = useCallback(
    (book: Book) => {
      if (!isPWA) {
        setShowInstallPrompt(true)
        return
      }
      if (downloadedBooks.has(book.id)) return
      if (downloadStatuses[book.id]) return // already in queue

      const item: QueueItem = {
        bookId: book.id,
        title: book.title,
        seriesId,
        seriesName,
        pageCount: book.page_count,
        coverUrl: getThumbnailUrl(book.id),
      }
      addToQueue([item])
    },
    [
      isPWA,
      downloadedBooks,
      downloadStatuses,
      seriesName,
      seriesId,
      addToQueue,
    ],
  )

  const handleDownloadAll = useCallback(() => {
    if (!isPWA) {
      setShowInstallPrompt(true)
      return
    }
    const items: QueueItem[] = books
      .filter((b) => !downloadedBooks.has(b.id) && !downloadStatuses[b.id])
      .map((b) => ({
        bookId: b.id,
        title: b.title,
        seriesId,
        seriesName,
        pageCount: b.page_count,
        coverUrl: getThumbnailUrl(b.id),
      }))
    if (items.length > 0) addToQueue(items)
  }, [
    isPWA,
    books,
    downloadedBooks,
    downloadStatuses,
    seriesName,
    seriesId,
    addToQueue,
  ])

  // Refresh progress + continue info when returning from reader (back nav / visibility)
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      const [progressMap, freshContinue] = await Promise.all([
        fetchBatchProgress(books.map((b) => b.id)),
        fetchSeriesContinue(seriesId).catch(() => null),
      ])
      setProgress({ ...progressMap })
      setContinueInfo(freshContinue)
    }
    // Also refresh on window focus / popstate (covers SPA back-navigation & swipe-back)
    const handlePopstate = () => void handleVisibility()
    window.addEventListener('focus', handleVisibility)
    window.addEventListener('popstate', handlePopstate)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener('popstate', handlePopstate)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [books, seriesId])

  // FAB visibility: show when banner scrolls out of viewport
  useEffect(() => {
    if (!bannerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setShowFab(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(bannerRef.current)
    return () => observer.disconnect()
  }, [continueInfo])

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowAnilistPopover(false)
      }
      if (
        collectionPopoverRef.current &&
        !collectionPopoverRef.current.contains(e.target as Node)
      ) {
        setShowCollectionPopover(false)
      }
    }
    if (showAnilistPopover || showCollectionPopover) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAnilistPopover, showCollectionPopover])

  // Load collections when popover opens
  useEffect(() => {
    if (showCollectionPopover) {
      fetchCollections()
        .then(setUserCollections)
        .catch(() => {})
    }
  }, [showCollectionPopover])

  const handleAddToCollection = async (collectionId: string) => {
    setAddingToCollection(collectionId)
    try {
      await addToCollection(collectionId, seriesId)
      setShowCollectionPopover(false)
      toast.success('Added to collection')
    } catch (err) {
      toast.error('Failed to add to collection', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setAddingToCollection(null)
    }
  }

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
      // Refresh metadata from server
      const freshMeta = await refreshSeriesMetadata(seriesId).catch(() => null)
      setMetadata(freshMeta)
      setCoverLoaded(false)
      // Re-fetch progress
      const progressMap = await fetchBatchProgress(data.books.map((b) => b.id))
      setProgress(progressMap)
      // Refresh continue info
      const freshContinue = await fetchSeriesContinue(seriesId).catch(
        () => null,
      )
      setContinueInfo(freshContinue)
      toast.success('Rescan complete')
    } catch (err) {
      toast.error('Rescan failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setRescanning(false)
    }
  }

  const handleSetAnilistId = async () => {
    const id = parseInt(anilistIdInput.trim())
    if (!id || isNaN(id)) return
    setSettingId(true)
    try {
      const freshMeta = await setSeriesAnilistId(seriesId, id)
      setMetadata(freshMeta)
      setCoverLoaded(false)
      setAnilistIdInput('')
      setShowAnilistPopover(false)
      toast.success('AniList ID updated')
    } catch (err) {
      toast.error('Failed to set AniList ID', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSettingId(false)
    }
  }

  const handleResetToAuto = async () => {
    setSettingId(true)
    try {
      const freshMeta = await clearSeriesAnilistId(seriesId)
      setMetadata(freshMeta)
      setCoverLoaded(false)
      setShowAnilistPopover(false)
      toast.success('Reset to auto-detect')
    } catch (err) {
      toast.error('Failed to reset AniList ID', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSettingId(false)
    }
  }

  const cover = metadata?.cover_url ?? null
  const banner = metadata?.banner_url ?? null
  const author = metadata?.author ?? null

  // Detect if books are volumes or chapters based on first book title
  const bookLabel =
    books.length > 0 && books[0].title.toLowerCase().startsWith('volume')
      ? 'volume'
      : 'chapter'

  const viewMode = bookLabel === 'volume' ? volumeViewMode : chapterViewMode
  const setViewMode =
    bookLabel === 'volume' ? setVolumeViewMode : setChapterViewMode

  const handlePullRefresh = useCallback(async () => {
    const [data, freshMeta, freshContinue] = await Promise.all([
      fetchBooks(seriesId),
      fetchSeriesMetadata(seriesId).catch(() => null),
      fetchSeriesContinue(seriesId).catch(() => null),
    ])
    setSeriesName(data.series.name)
    setBooks(data.books)
    setMetadata(freshMeta)
    const progressMap = await fetchBatchProgress(data.books.map((b) => b.id))
    setProgress(progressMap)
    setContinueInfo(freshContinue)
  }, [seriesId])

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
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

        <div className="relative mx-auto max-w-7xl px-6 py-8">
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
              <div className="group/cover relative aspect-3/4 overflow-hidden rounded-lg">
                {cover ? (
                  <img
                    src={cover}
                    alt={seriesName}
                    className={`h-full w-full object-contain transition-all duration-500 group-hover/cover:brightness-50 ${
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
                {/* Cover hover overlay — shows read/continue action */}
                {continueInfo && (
                  <Link
                    to="/read/$bookId"
                    params={{ bookId: continueInfo.book_id }}
                    search={
                      continueInfo.action === 'continue'
                        ? { page: continueInfo.page }
                        : { page: 1 }
                    }
                    className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100"
                  >
                    <span className="rounded-full bg-black/60 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm">
                      {continueInfo.action === 'start'
                        ? 'Start Reading'
                        : continueInfo.action === 'continue'
                          ? 'Continue'
                          : 'Read Again'}
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {getDisplayTitle(metadata, seriesName)}
                </h1>
                {getRomajiSubtitle(metadata) && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {getRomajiSubtitle(metadata)}
                  </p>
                )}
              </div>

              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-3">
                {metadata?.status && (
                  <Badge variant="secondary">
                    {formatStatus(metadata.status)}
                  </Badge>
                )}
                {metadata?.score && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <HugeiconsIcon
                      icon={Star}
                      size={14}
                      className="text-yellow-500"
                    />
                    {(metadata.score / 10).toFixed(1)}
                  </div>
                )}
                {metadata?.chapters && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <HugeiconsIcon icon={Book02Icon} size={14} />
                    {metadata.chapters} chapters
                  </div>
                )}
                {author && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <HugeiconsIcon icon={UserCircleIcon} size={14} />
                    {author}
                  </div>
                )}
                {metadata?.start_year && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <HugeiconsIcon icon={Calendar01Icon} size={14} />
                    {metadata.start_year}
                    {metadata.end_year &&
                    metadata.end_year !== metadata.start_year
                      ? `–${metadata.end_year}`
                      : ''}
                  </div>
                )}
              </div>

              {/* Genres */}
              {metadata?.genres && metadata.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {metadata.genres.map((g) => (
                    <Badge key={g} variant="outline" className="text-xs">
                      {g}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Description */}
              {metadata?.description && (
                <ExpandableDescription
                  text={metadata.description.replace(/<[^>]*>/g, '')}
                />
              )}

              {/* Local info + collection + continue button */}
              <div className="flex items-center gap-3">
                <div className="relative" ref={collectionPopoverRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() =>
                      setShowCollectionPopover(!showCollectionPopover)
                    }
                  >
                    <HugeiconsIcon icon={FolderLibraryIcon} size={14} />
                    Add to Collection
                  </Button>
                  <AnimatePresence>
                    {showCollectionPopover && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-2 shadow-lg"
                      >
                        {userCollections.length === 0 ? (
                          <div className="py-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              No collections yet
                            </p>
                            <Link
                              to="/collections"
                              className="mt-1 inline-block text-xs text-primary hover:underline"
                            >
                              Create one
                            </Link>
                          </div>
                        ) : (
                          <div className="max-h-48 space-y-0.5 overflow-y-auto">
                            {userCollections.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => handleAddToCollection(c.id)}
                                disabled={addingToCollection === c.id}
                                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                              >
                                <span className="truncate">{c.name}</span>
                                {addingToCollection === c.id ? (
                                  <HugeiconsIcon
                                    icon={Loading03Icon}
                                    size={12}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <HugeiconsIcon
                                    icon={Add01Icon}
                                    size={12}
                                    className="text-muted-foreground"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Continue / Start Reading button — same row */}
                {continueInfo && (
                  <div ref={bannerRef} className="ml-auto shrink-0">
                    <Link
                      to="/read/$bookId"
                      params={{ bookId: continueInfo.book_id }}
                      search={
                        continueInfo.action === 'continue'
                          ? { page: continueInfo.page }
                          : { page: 1 }
                      }
                      className="block"
                    >
                      <div className="group relative overflow-hidden rounded-md bg-foreground text-background transition-all hover:opacity-90">
                        {continueInfo.action === 'continue' && (
                          <div
                            className="absolute inset-y-0 left-0 bg-background/10 transition-all"
                            style={{
                              width: `${continueInfo.progress_percent}%`,
                            }}
                          />
                        )}
                        <div className="relative flex items-center gap-1.5 px-3 py-1.5">
                          <HugeiconsIcon
                            icon={PlayIcon}
                            size={12}
                            strokeWidth={3}
                            className="shrink-0"
                          />
                          <span className="whitespace-nowrap text-xs font-semibold">
                            {continueInfo.action === 'start'
                              ? 'Start Reading'
                              : continueInfo.action === 'continue'
                                ? 'Continue'
                                : 'Read Again'}
                          </span>
                          <span className="whitespace-nowrap text-xs opacity-70">
                            · {stripTitleZeros(continueInfo.book_title)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          <Separator className="my-8" />

          {/* Chapter List */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              {/* Row 1: Title + Volume/Chapter toggle + List/Grid toggle + Continue button */}
              <div className="flex flex-1 items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {displayMode === 'chapters'
                    ? 'Chapters'
                    : bookLabel === 'volume'
                      ? 'Volumes'
                      : 'Chapters'}
                </h2>
                {/* Volume/Chapter toggle */}
                {bookLabel === 'volume' && seriesChapters.length > 0 && (
                  <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
                    <button
                      onClick={() => setDisplayMode('volumes')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                        displayMode === 'volumes'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Volumes
                    </button>
                    <button
                      onClick={() => setDisplayMode('chapters')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                        displayMode === 'chapters'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Chapters
                    </button>
                  </div>
                )}
                {/* List/Grid toggle */}
                <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
                  <button
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    className={`rounded px-2 py-1 transition-all ${
                      viewMode === 'list'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={Menu02Icon} size={16} />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    className={`rounded px-2 py-1 transition-all ${
                      viewMode === 'grid'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={GridViewIcon} size={16} />
                  </button>
                </div>
                {/* Select mode toggle */}
                <Button
                  variant={selectMode ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => {
                    setSelectMode((v) => !v)
                    setSelectedBooks(new Set())
                  }}
                >
                  <HugeiconsIcon icon={CheckmarkSquare01Icon} size={14} />
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              </div>
              {/* Row 2 right side: Download All + Admin controls */}
              <div className="flex items-center gap-1">
                {/* Download All button - mobile only */}
                {isPWA && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground md:hidden"
                    onClick={handleDownloadAll}
                    disabled={books.every(
                      (b) =>
                        downloadedBooks.has(b.id) || !!downloadStatuses[b.id],
                    )}
                  >
                    <HugeiconsIcon
                      icon={
                        books.every((b) => downloadedBooks.has(b.id))
                          ? Download04Icon
                          : Download04Icon
                      }
                      size={14}
                    />
                    {books.every((b) => downloadedBooks.has(b.id))
                      ? 'All Downloaded'
                      : 'Download All'}
                  </Button>
                )}
                {isAdmin && (
                  <>
                    {/* AniList ID popover */}
                    <div className="relative" ref={popoverRef}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Set AniList ID"
                        onClick={() =>
                          setShowAnilistPopover(!showAnilistPopover)
                        }
                        title="Set AniList ID"
                      >
                        <HugeiconsIcon icon={Settings02Icon} size={16} />
                      </Button>
                      <AnimatePresence>
                        {showAnilistPopover && (
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg"
                          >
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              AniList ID
                              {metadata?.anilist_id_source && (
                                <span className="ml-1 text-muted-foreground/60">
                                  ({metadata.anilist_id_source})
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder={
                                  metadata?.anilist_id?.toString() || 'Enter ID'
                                }
                                value={anilistIdInput}
                                onChange={(e) =>
                                  setAnilistIdInput(
                                    e.target.value.replace(/\D/g, ''),
                                  )
                                }
                                onKeyDown={(e) =>
                                  e.key === 'Enter' && handleSetAnilistId()
                                }
                                className="h-7 flex-1 text-xs"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Confirm AniList ID"
                                onClick={handleSetAnilistId}
                                disabled={settingId || !anilistIdInput.trim()}
                                title="Set ID"
                              >
                                <HugeiconsIcon
                                  icon={settingId ? Loading03Icon : Tick01Icon}
                                  size={14}
                                  className={settingId ? 'animate-spin' : ''}
                                />
                              </Button>
                            </div>
                            {metadata?.anilist_id_source === 'manual' && (
                              <button
                                onClick={handleResetToAuto}
                                disabled={settingId}
                                className="mt-2 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                              >
                                <HugeiconsIcon icon={Cancel01Icon} size={12} />
                                Reset to auto-detect
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

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
                  </>
                )}
              </div>
            </div>
            {displayMode === 'chapters' && seriesChapters.length > 0 ? (
              /* ── Chapters view ── */
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {seriesChapters.map((ch, i) => (
                    <motion.div
                      key={`${ch.book_id}-${ch.chapter_number}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.15,
                        delay: Math.min(i * 0.015, 0.3),
                        ease: 'easeOut',
                      }}
                    >
                      <Link
                        to="/read/$bookId"
                        params={{ bookId: ch.book_id }}
                        search={{ page: ch.start_page + 1 }}
                      >
                        <div className="group relative cursor-pointer overflow-hidden rounded-lg transition-all hover:shadow-md">
                          <div className="relative aspect-3/4 w-full overflow-hidden">
                            <img
                              src={getPageUrl(ch.book_id, ch.start_page + 1)}
                              alt={ch.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-2">
                            <p className="truncate text-xs font-medium">
                              {stripTitleZeros(ch.title)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {ch.end_page - ch.start_page + 1} pages
                            </p>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2">
                  {seriesChapters.map((ch, i) => (
                    <motion.div
                      key={`${ch.book_id}-${ch.chapter_number}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.15,
                        delay: Math.min(i * 0.015, 0.3),
                        ease: 'easeOut',
                      }}
                    >
                      <Link
                        to="/read/$bookId"
                        params={{ bookId: ch.book_id }}
                        search={{ page: ch.start_page + 1 }}
                      >
                        <div className="group relative cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-card px-4 py-3 transition-all hover:border-border hover:bg-accent/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="w-8 text-center text-xs font-medium text-muted-foreground">
                                {ch.chapter_number}
                              </span>
                              <div>
                                <p className="text-sm font-medium">
                                  {stripTitleZeros(ch.title)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {stripTitleZeros(ch.book_title)} · Pages{' '}
                                  {ch.start_page + 1}–{ch.end_page + 1}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {ch.end_page - ch.start_page + 1} pages
                            </span>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {books.map((book, i) => {
                  const prog = progress[book.id]
                  const pct = prog
                    ? Math.round((prog.page / book.page_count) * 100)
                    : 0
                  const isCompleted = prog?.is_completed
                  const isSelected = selectedBooks.has(book.id)

                  const cardContent = (
                    <div
                      className={`group relative cursor-pointer overflow-hidden rounded-lg transition-all hover:shadow-md ${selectMode && isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      {selectMode && (
                        <div className="absolute left-1.5 top-1.5 z-20">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${isSelected ? 'border-primary bg-primary text-white' : 'border-white/80 bg-black/40'}`}
                          >
                            {isSelected && (
                              <HugeiconsIcon icon={Tick01Icon} size={12} />
                            )}
                          </div>
                        </div>
                      )}
                      <div className="relative aspect-3/4 w-full overflow-hidden">
                        <img
                          src={getThumbnailUrl(book.id)}
                          alt={book.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        {/* Download button overlay - mobile only */}
                        {isPWA && (
                          <div
                            className="absolute right-1.5 top-1.5 z-10 md:hidden"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const ds = downloadStatuses[book.id]
                              if (ds?.status === 'downloading')
                                pauseDownload(book.id)
                              else if (ds?.status === 'paused')
                                resumeDownload(book.id)
                              else if (!downloadedBooks.has(book.id) && !ds)
                                handleDownloadBook(book)
                            }}
                          >
                            {downloadedBooks.has(book.id) ||
                            downloadStatuses[book.id]?.status === 'complete' ? (
                              <CircularProgress
                                progress={1}
                                status="complete"
                                size={26}
                                strokeWidth={2.5}
                              />
                            ) : downloadStatuses[book.id] ? (
                              <CircularProgress
                                progress={
                                  downloadStatuses[book.id].totalPages > 0
                                    ? downloadStatuses[book.id]
                                        .downloadedPages /
                                      downloadStatuses[book.id].totalPages
                                    : 0
                                }
                                status={downloadStatuses[book.id].status}
                                size={26}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <button
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all active:scale-90"
                                aria-label="Download"
                              >
                                <HugeiconsIcon
                                  icon={Download04Icon}
                                  size={14}
                                />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="truncate text-xs font-medium">
                          {stripTitleZeros(book.title)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {book.page_count} pages
                          {isCompleted && ' · Done'}
                          {prog && !isCompleted && ` · ${pct}%`}
                        </p>
                      </div>
                      {/* Progress bar at bottom */}
                      {pct > 0 && (isCompleted || (prog && prog.page > 1)) && (
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
                  )

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
                      onClick={
                        selectMode ? () => toggleSelectBook(book.id) : undefined
                      }
                    >
                      {selectMode ? (
                        cardContent
                      ) : (
                        <Link to="/read/$bookId" params={{ bookId: book.id }}>
                          {cardContent}
                        </Link>
                      )}
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
                  const isSelected = selectedBooks.has(book.id)

                  const listContent = (
                    <div
                      className={`group relative cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-card px-4 py-3 transition-all hover:border-border hover:bg-accent/50 ${selectMode && isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {selectMode && (
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40'}`}
                            >
                              {isSelected && (
                                <HugeiconsIcon icon={Tick01Icon} size={12} />
                              )}
                            </div>
                          )}
                          <span className="hidden w-8 text-center text-xs font-medium text-muted-foreground md:block">
                            {book.sort_order}
                          </span>
                          <div>
                            <p className="text-sm font-medium">
                              {stripTitleZeros(book.title)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {book.page_count} pages
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Download button - mobile only */}
                          {isPWA && (
                            <div
                              className="md:hidden"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const ds = downloadStatuses[book.id]
                                if (ds?.status === 'downloading')
                                  pauseDownload(book.id)
                                else if (ds?.status === 'paused')
                                  resumeDownload(book.id)
                                else if (!downloadedBooks.has(book.id) && !ds)
                                  handleDownloadBook(book)
                              }}
                            >
                              {downloadedBooks.has(book.id) ||
                              downloadStatuses[book.id]?.status ===
                                'complete' ? (
                                <CircularProgress
                                  progress={1}
                                  status="complete"
                                  size={24}
                                  strokeWidth={2.5}
                                />
                              ) : downloadStatuses[book.id] ? (
                                <CircularProgress
                                  progress={
                                    downloadStatuses[book.id].totalPages > 0
                                      ? downloadStatuses[book.id]
                                          .downloadedPages /
                                        downloadStatuses[book.id].totalPages
                                      : 0
                                  }
                                  status={downloadStatuses[book.id].status}
                                  size={24}
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <button
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all active:scale-90"
                                  aria-label="Download"
                                >
                                  <HugeiconsIcon
                                    icon={Download04Icon}
                                    size={14}
                                  />
                                </button>
                              )}
                            </div>
                          )}
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs">
                              Completed
                            </Badge>
                          )}
                          {!isPWA && prog && !isCompleted && prog.page > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {prog.page}/{book.page_count}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress bar at bottom */}
                      {pct > 0 && (isCompleted || (prog && prog.page > 1)) && (
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
                  )

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
                      onClick={
                        selectMode ? () => toggleSelectBook(book.id) : undefined
                      }
                    >
                      {selectMode ? (
                        listContent
                      ) : (
                        <Link to="/read/$bookId" params={{ bookId: book.id }}>
                          {listContent}
                        </Link>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Bulk selection action bar */}
        <AnimatePresence>
          {selectMode && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm md:bottom-6"
            >
              <span className="text-sm font-medium">
                {selectedBooks.size} selected
              </span>
              <Separator orientation="vertical" className="h-5" />
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setSelectedBooks(new Set(books.map((b) => b.id)))
                }}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => handleBulkMark(true)}
              >
                <HugeiconsIcon icon={Tick01Icon} size={14} />
                Mark Read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => handleBulkMark(false)}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
                Mark Unread
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Button — appears when banner is scrolled out, hidden during selection */}
        {continueInfo && !selectMode && (
          <ContinueFab continueInfo={continueInfo} showFab={showFab} />
        )}

        {/* Install as app prompt - shown to browser users when they try to download */}
        <InstallPromptModal
          show={showInstallPrompt}
          onClose={() => setShowInstallPrompt(false)}
        />
      </div>
    </PullToRefresh>
  )
}
