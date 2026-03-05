import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
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
  getThumbnailUrl,
  getPageUrl,
  fetchCollections,
  addToCollection,
  type Book,
  type ReadingProgress,
  type SeriesMetadata,
  type SeriesChapter,
  type Collection,
} from '@/lib/api'
import { formatStatus, getDisplayTitle, getRomajiSubtitle } from '@/lib/anilist'
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
    // Start metadata + batch progress + chapters fetch in parallel
    const [metadata, progressMap, chaptersData] = await Promise.all([
      fetchSeriesMetadata(params.seriesId).catch(() => null),
      fetchBatchProgress(data.books.map((b) => b.id)),
      fetchSeriesChapters(params.seriesId).catch(() => ({
        series_id: params.seriesId,
        total_chapters: 0,
        chapters: [],
      })),
    ])
    return {
      seriesName: data.series.name,
      books: data.books,
      metadata: metadata as SeriesMetadata | null,
      progress: progressMap,
      seriesChapters: chaptersData.chapters as SeriesChapter[],
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
  const [seriesName, setSeriesName] = useState(loaderData.seriesName)
  const [books, setBooks] = useState<Book[]>(loaderData.books)
  const [metadata, setMetadata] = useState<SeriesMetadata | null>(
    loaderData.metadata,
  )
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>(
    loaderData.progress,
  )
  const [seriesChapters] = useState<SeriesChapter[]>(loaderData.seriesChapters)
  const [displayMode, setDisplayMode] = useState<'volumes' | 'chapters'>(
    'volumes',
  )
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [anilistIdInput, setAnilistIdInput] = useState('')
  const [settingId, setSettingId] = useState(false)
  const [showAnilistPopover, setShowAnilistPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Collections
  const [showCollectionPopover, setShowCollectionPopover] = useState(false)
  const [userCollections, setUserCollections] = useState<Collection[]>([])
  const [addingToCollection, setAddingToCollection] = useState<string | null>(
    null,
  )
  const collectionPopoverRef = useRef<HTMLDivElement>(null)

  const isAdmin = useAppStore((s) => s.user?.is_admin) ?? false

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
    } catch (err) {
      console.error('Failed to add to collection:', err)
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
    } catch (err) {
      console.error('Rescan failed:', err)
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
    } catch (err) {
      console.error('Failed to set AniList ID:', err)
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
    } catch (err) {
      console.error('Failed to reset AniList ID:', err)
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
            <div className="relative aspect-3/4 overflow-hidden rounded-lg bg-muted shadow-xl">
              {cover ? (
                <>
                  {/* Blurred background for uncropped cover */}
                  <img
                    src={cover}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75"
                  />
                  <img
                    src={cover}
                    alt={seriesName}
                    className={`relative h-full w-full object-contain transition-opacity duration-500 ${
                      coverLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setCoverLoaded(true)}
                  />
                </>
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

            {/* Local info + collection button */}
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground/60">
                {books.length} {bookLabel === 'volume' ? 'volumes' : 'chapters'}{' '}
                in library
                {isAdmin && metadata?.anilist_id && (
                  <>
                    {' '}
                    · AniList ID: {metadata.anilist_id}
                    {metadata.anilist_id_source === 'manual'
                      ? ' (manual)'
                      : metadata.anilist_id_source === 'folder'
                        ? ' (folder)'
                        : ''}
                  </>
                )}
              </p>
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
            </div>
          </div>
        </motion.div>

        <Separator className="my-8" />

        {/* Chapter List */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {displayMode === 'chapters'
                  ? 'Chapters'
                  : bookLabel === 'volume'
                    ? 'Volumes'
                    : 'Chapters'}
              </h2>
              {/* Volume/Chapter toggle - only show when books are volumes and chapters exist */}
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
            </div>
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
              {isAdmin && (
                <>
                  {/* AniList ID popover */}
                  <div className="relative" ref={popoverRef}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setShowAnilistPopover(!showAnilistPopover)}
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
                      <div className="group relative cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-card transition-all hover:border-border hover:shadow-md">
                        <div className="relative aspect-3/4 w-full overflow-hidden bg-muted">
                          <img
                            src={getPageUrl(ch.book_id, ch.start_page + 1)}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75"
                            loading="lazy"
                          />
                          <img
                            src={getPageUrl(ch.book_id, ch.start_page + 1)}
                            alt={ch.title}
                            className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-medium">
                            {ch.title}
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
                              <p className="text-sm font-medium">{ch.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {ch.book_title} · Pages {ch.start_page + 1}–
                                {ch.end_page + 1}
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
                        <div className="relative aspect-3/4 w-full overflow-hidden bg-muted">
                          {/* Blurred background for uncropped cover */}
                          <img
                            src={getThumbnailUrl(book.id)}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75"
                            loading="lazy"
                          />
                          <img
                            src={getThumbnailUrl(book.id)}
                            alt={book.title}
                            className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
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
                              <p className="text-sm font-medium">
                                {book.title}
                              </p>
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
