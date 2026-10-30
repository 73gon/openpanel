import {
  createFileRoute,
  Link,
  useCanGoBack,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Heading,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Progress,
  Skeleton,
  Tag,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@zonsh/ui'
import {
  ArrowLeftIcon,
  DownloadIcon,
  EllipsisIcon,
  LayoutGridIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  RefreshCwIcon,
  StarIcon,
} from 'lucide-react'
import {
  fetchBooks,
  fetchBatchProgress,
  rescanSeries,
  fetchSeriesMetadata,
  refreshSeriesMetadata,
  fetchSeriesChapters,
  fetchSeriesContinue,
  getThumbnailUrl,
  bulkMarkProgress,
  type Book,
  type ReadingProgress,
  type SeriesMetadata,
  type SeriesChapter,
  type SeriesContinueResponse,
} from '@/lib/api'
import { formatStatus, getDisplayTitle, getRomajiSubtitle } from '@/lib/anilist'
import { queryClient, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { usePWA } from '@/lib/use-pwa'
import { isBookDownloaded } from '@/lib/downloads'
import { useDownloadStore, type QueueItem } from '@/lib/download-store'
import { countLabel, pad2, stripTitleZeros } from '@/lib/utils'
import {
  AnilistDialog,
  BookList,
  ChapterList,
  CollectionMenu,
  ContinueButton,
  ContinueFab,
  InstallPrompt,
  SelectionBar,
} from '@/components/series'
import { Backdrop } from '@/components/backdrop'
import { Cover } from '@/components/cover'
import { DownloadIndicator } from '@/components/download-indicator'
import { Overview } from '@/components/overview'
import { Page } from '@/components/page'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { ErrorNotice } from '@/components/route-error'

function SeriesDetailSkeleton() {
  return (
    <Page aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">Loading the series…</span>
      <Skeleton shape="button" className="w-28" />
      <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Skeleton
          shape="item"
          className="aspect-[5/7] w-40 rounded-none sm:w-48 md:w-full"
        />
        <div className="flex flex-col gap-4">
          <Skeleton shape="text" className="h-10 w-3/4" />
          <Skeleton shape="text" className="w-1/3" />
          <Skeleton shape="text" className="mt-4 w-full" />
          <Skeleton shape="text" className="w-11/12" />
          <Skeleton shape="text" className="w-2/3" />
          <div className="mt-4 flex gap-3">
            <Skeleton shape="button" className="min-h-(--control-h-lg) w-40" />
            <Skeleton shape="button" className="min-h-(--control-h-lg) w-36" />
          </div>
        </div>
      </div>
    </Page>
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
    <Page>
      <ErrorNotice
        title="This series didn't load"
        error={error}
        onRetry={reset}
        className="mx-auto max-w-2xl"
      />
    </Page>
  ),
  component: SeriesDetailPage,
})

function SeriesDetailPage() {
  const { seriesId } = Route.useParams()
  // Another series is another page: its state starts again from its own loader data.
  return <SeriesDetail key={seriesId} />
}

function SeriesDetail() {
  const { seriesId } = Route.useParams()
  const loaderData = Route.useLoaderData()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const navigate = useNavigate()

  const [seriesName, setSeriesName] = useState(loaderData.seriesName)
  const [books, setBooks] = useState<Book[]>(loaderData.books)
  const [metadata, setMetadata] = useState<SeriesMetadata | null>(
    loaderData.metadata,
  )
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>(
    loaderData.progress,
  )
  const [seriesChapters] = useState<SeriesChapter[]>(loaderData.seriesChapters)

  // Detect if books are volumes or chapters based on first book title
  const bookLabel =
    books.length > 0 && books[0].title.toLowerCase().startsWith('volume')
      ? 'volume'
      : 'chapter'
  const [continueInfo, setContinueInfo] =
    useState<SeriesContinueResponse | null>(loaderData.continueData)
  const [displayMode, setDisplayMode] = useState<'volumes' | 'chapters'>(
    'volumes',
  )
  const [rescanning, setRescanning] = useState(false)
  const [anilistOpen, setAnilistOpen] = useState(false)

  const isAdmin = useAppStore((s) => s.user?.is_admin) ?? false

  // The floating continue button appears once the page's own has scrolled away.
  const actionsRef = useRef<HTMLDivElement>(null)
  const [showFab, setShowFab] = useState(false)

  // Bulk select mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set())
  const [marking, setMarking] = useState(false)

  const setSelected = useCallback((bookId: string, selected: boolean) => {
    setSelectedBooks((prev) => {
      const next = new Set(prev)
      if (selected) next.add(bookId)
      else next.delete(bookId)
      return next
    })
  }, [])

  const refreshProgress = useCallback(
    async (bookList: Book[]) => {
      const [progressMap, freshContinue] = await Promise.all([
        fetchBatchProgress(bookList.map((b) => b.id)),
        fetchSeriesContinue(seriesId).catch(() => null),
      ])
      setProgress({ ...progressMap })
      setContinueInfo(freshContinue)
    },
    [seriesId],
  )

  const handleBulkMark = async (isCompleted: boolean) => {
    const ids = Array.from(selectedBooks)
    if (ids.length === 0) return
    setMarking(true)
    try {
      await bulkMarkProgress(ids, isCompleted)
      // Small delay to ensure DB write is flushed before refetch
      await new Promise((r) => setTimeout(r, 100))
      await refreshProgress(books)
      // The posters and Continue reading elsewhere show it too.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seriesProgress(),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.continueReading(),
      })
      setSelectedBooks(new Set())
      setSelectMode(false)
      toast.success(
        `${countLabel(ids.length, bookLabel)} marked ${isCompleted ? 'read' : 'unread'}.`,
      )
    } catch (err) {
      toast.error('Your reading progress was not updated.', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setMarking(false)
    }
  }

  // Downloads (PWA)
  const { isPWA } = usePWA()
  const [downloadedBooks, setDownloadedBooks] = useState<Set<string>>(new Set())
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const downloadStatuses = useDownloadStore((s) => s.statuses)
  const { addToQueue, pauseDownload, resumeDownload } = useDownloadStore()

  // Check which books are already downloaded
  useEffect(() => {
    let cancelled = false
    async function checkDownloads() {
      const downloaded = new Set<string>()
      for (const book of books) {
        if (await isBookDownloaded(book.id)) downloaded.add(book.id)
      }
      if (!cancelled) setDownloadedBooks(downloaded)
    }
    checkDownloads()
    return () => {
      cancelled = true
    }
  }, [books])

  const queueItem = useCallback(
    (book: Book): QueueItem => ({
      bookId: book.id,
      title: book.title,
      seriesId,
      seriesName,
      pageCount: book.page_count,
      coverUrl: getThumbnailUrl(book.id),
    }),
    [seriesId, seriesName],
  )

  const handleDownloadBook = useCallback(
    (book: Book) => {
      if (!isPWA) {
        setShowInstallPrompt(true)
        return
      }
      if (downloadedBooks.has(book.id)) return
      const ds = downloadStatuses[book.id]
      // Queued or running already; a failed one goes back in the queue.
      if (ds && ds.status !== 'error') return
      addToQueue([queueItem(book)])
    },
    [isPWA, downloadedBooks, downloadStatuses, addToQueue, queueItem],
  )

  const pending = books.filter(
    (b) => !downloadedBooks.has(b.id) && !downloadStatuses[b.id],
  )
  const allDownloaded = books.every((b) => downloadedBooks.has(b.id))

  const handleDownloadAll = () => {
    if (!isPWA) {
      setShowInstallPrompt(true)
      return
    }
    if (pending.length > 0) {
      addToQueue(pending.map(queueItem))
      toast.info(
        `${countLabel(pending.length, bookLabel)} queued for download.`,
      )
    }
  }

  // Refresh progress + continue info when returning from reader (back nav / visibility)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void refreshProgress(books)
    }
    // Also refresh on window focus / popstate (covers SPA back-navigation & swipe-back)
    window.addEventListener('focus', handleVisibility)
    window.addEventListener('popstate', handleVisibility)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener('popstate', handleVisibility)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [books, refreshProgress])

  useEffect(() => {
    const el = actionsRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) =>
        setShowFab(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [continueInfo])

  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)

  const handleRescan = async () => {
    setRescanning(true)
    try {
      await rescanSeries(seriesId)
      const data = await fetchBooks(seriesId)
      setSeriesName(data.series.name)
      setBooks(data.books)
      const freshMeta = await refreshSeriesMetadata(seriesId).catch(() => null)
      setMetadata(freshMeta)
      await refreshProgress(data.books)
      toast.success('The series is rescanned.', {
        description: countLabel(data.books.length, bookLabel),
      })
    } catch (err) {
      toast.error('The rescan failed.', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setRescanning(false)
    }
  }

  const title = getDisplayTitle(metadata, seriesName)
  const romaji = getRomajiSubtitle(metadata)
  const cover =
    metadata?.cover_url ?? (books[0] ? getThumbnailUrl(books[0].id) : null)

  const viewMode = bookLabel === 'volume' ? volumeViewMode : chapterViewMode
  const setViewMode =
    bookLabel === 'volume' ? setVolumeViewMode : setChapterViewMode
  const showChapters = displayMode === 'chapters' && seriesChapters.length > 0

  const handlePullRefresh = useCallback(async () => {
    const [data, freshMeta] = await Promise.all([
      fetchBooks(seriesId),
      fetchSeriesMetadata(seriesId).catch(() => null),
    ])
    setSeriesName(data.series.name)
    setBooks(data.books)
    setMetadata(freshMeta)
    await refreshProgress(data.books)
  }, [seriesId, refreshProgress])

  const goBack = () => {
    if (canGoBack) router.history.back()
    else navigate({ to: '/' })
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div className="relative">
        <Backdrop
          src={metadata?.banner_url}
          className="h-[28rem] sm:h-[32rem]"
        />
        <Page className="relative flex flex-col gap-14 sm:gap-16">
          <div className="flex flex-col gap-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="-ml-3 self-start"
            >
              <ArrowLeftIcon />
              {canGoBack ? 'Back' : 'Library'}
            </Button>

            <header className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <Cover
                src={cover}
                loading="eager"
                fallback={title}
                className="w-40 self-start sm:w-48 md:w-full"
              />

              <div className="flex min-w-0 flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <Heading level={2} as="h1">
                    {title}
                  </Heading>
                  {romaji && (
                    <p className="m-0 text-[15px] text-foreground-soft">
                      {romaji}
                    </p>
                  )}
                </div>

                <SeriesFacts metadata={metadata} />

                {!!metadata?.genres?.length && (
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {metadata.genres.map((genre) => (
                      <li key={genre}>
                        <Link
                          to="/"
                          search={{ genre }}
                          className="block rounded-item focus-ring"
                        >
                          <Tag
                            variant="muted"
                            className="transition-colors duration-(--duration) hover:text-foreground"
                          >
                            {genre}
                          </Tag>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {metadata?.description && (
                  <Overview
                    text={metadata.description.replace(/<[^>]*>/g, '')}
                  />
                )}

                {metadata?.author && (
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
                    <dt className="eyebrow self-center">Author</dt>
                    <dd className="m-0 text-foreground-soft">
                      {metadata.author}
                    </dd>
                  </dl>
                )}

                <div ref={actionsRef} className="mt-2 flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-3">
                    {continueInfo && <ContinueButton info={continueInfo} />}
                    <CollectionMenu seriesId={seriesId} seriesName={title} />
                    {(isAdmin || isPWA) && (
                      <Menu>
                        <MenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="More actions"
                            />
                          }
                        >
                          <EllipsisIcon />
                        </MenuTrigger>
                        <MenuContent align="end" className="min-w-56">
                          {isPWA && (
                            <MenuItem
                              onClick={handleDownloadAll}
                              disabled={pending.length === 0}
                            >
                              <DownloadIcon />
                              {allDownloaded
                                ? 'All downloaded'
                                : 'Download all'}
                            </MenuItem>
                          )}
                          {isPWA && isAdmin && <MenuSeparator />}
                          {isAdmin && (
                            <>
                              <MenuItem onClick={() => setAnilistOpen(true)}>
                                <LinkIcon />
                                Match on AniList…
                              </MenuItem>
                              <MenuItem
                                onClick={handleRescan}
                                disabled={rescanning}
                              >
                                <RefreshCwIcon />
                                {rescanning ? 'Rescanning…' : 'Rescan series'}
                              </MenuItem>
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    )}
                  </div>
                  {continueInfo?.action === 'continue' && (
                    <Progress
                      value={Math.round(continueInfo.progress_percent)}
                      label={`${stripTitleZeros(continueInfo.book_title)} · page ${continueInfo.page} of ${continueInfo.total_pages}`}
                      showValue
                      className="max-w-sm"
                    />
                  )}
                </div>
              </div>
            </header>
          </div>

          <section
            aria-labelledby="books-title"
            className="flex flex-col gap-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-baseline gap-2.5">
                <Heading level={3} as="h2" id="books-title">
                  {showChapters || bookLabel === 'chapter'
                    ? 'Chapters'
                    : 'Volumes'}
                </Heading>
                <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                  {pad2(showChapters ? seriesChapters.length : books.length)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {bookLabel === 'volume' && seriesChapters.length > 0 && (
                  <ToggleGroup
                    aria-label="Show"
                    value={[displayMode]}
                    onValueChange={(value) => {
                      const next = value[0] as typeof displayMode | undefined
                      if (!next) return
                      setDisplayMode(next)
                      setSelectMode(false)
                      setSelectedBooks(new Set())
                    }}
                  >
                    <ToggleGroupItem value="volumes">Volumes</ToggleGroupItem>
                    <ToggleGroupItem value="chapters">Chapters</ToggleGroupItem>
                  </ToggleGroup>
                )}
                <ToggleGroup
                  aria-label="Layout"
                  value={[viewMode]}
                  onValueChange={(value) => {
                    const next = value[0] as typeof viewMode | undefined
                    if (next) setViewMode(next)
                  }}
                >
                  <ToggleGroupItem value="list" aria-label="List">
                    <ListIcon />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="grid" aria-label="Grid">
                    <LayoutGridIcon />
                  </ToggleGroupItem>
                </ToggleGroup>
                {!showChapters && (
                  <Toggle
                    pressed={selectMode}
                    onPressedChange={(pressed) => {
                      setSelectMode(pressed)
                      setSelectedBooks(new Set())
                    }}
                    aria-label="Select books"
                    className="max-sm:px-2.5"
                  >
                    <ListChecksIcon />
                    <span className="max-sm:hidden">Select</span>
                  </Toggle>
                )}
              </div>
            </div>

            {showChapters ? (
              <ChapterList chapters={seriesChapters} view={viewMode} />
            ) : (
              <BookList
                books={books}
                progress={progress}
                view={viewMode}
                selecting={selectMode}
                selected={selectedBooks}
                onSelectChange={setSelected}
                renderDownload={
                  isPWA
                    ? (book) => {
                        const ds = downloadStatuses[book.id]
                        const done =
                          downloadedBooks.has(book.id) ||
                          ds?.status === 'complete'
                        return (
                          <DownloadIndicator
                            status={done ? 'complete' : ds?.status}
                            progress={
                              ds && ds.totalPages > 0
                                ? ds.downloadedPages / ds.totalPages
                                : 0
                            }
                            onClick={() => {
                              if (ds?.status === 'downloading')
                                pauseDownload(book.id)
                              else if (ds?.status === 'paused')
                                resumeDownload(book.id)
                              else if (!done) handleDownloadBook(book)
                            }}
                          />
                        )
                      }
                    : undefined
                }
              />
            )}
          </section>
        </Page>
      </div>

      {selectMode && (
        <SelectionBar
          count={selectedBooks.size}
          total={books.length}
          busy={marking}
          onSelectAll={() => setSelectedBooks(new Set(books.map((b) => b.id)))}
          onMark={handleBulkMark}
          onDone={() => {
            setSelectMode(false)
            setSelectedBooks(new Set())
          }}
        />
      )}

      {continueInfo && !selectMode && (
        <ContinueFab info={continueInfo} visible={showFab} />
      )}

      <InstallPrompt
        open={showInstallPrompt}
        onOpenChange={setShowInstallPrompt}
      />

      {isAdmin && (
        <AnilistDialog
          open={anilistOpen}
          onOpenChange={setAnilistOpen}
          seriesId={seriesId}
          metadata={metadata}
          onSaved={setMetadata}
        />
      )}
    </PullToRefresh>
  )
}

/** Status, years, length and score in Licht Mono: the facts people scan for. */
function SeriesFacts({ metadata }: { metadata: SeriesMetadata | null }) {
  if (!metadata) return null
  const years = metadata.start_year
    ? metadata.end_year && metadata.end_year !== metadata.start_year
      ? `${metadata.start_year}–${metadata.end_year}`
      : String(metadata.start_year)
    : null
  const length = metadata.chapters
    ? countLabel(metadata.chapters, 'chapter')
    : metadata.volumes
      ? countLabel(metadata.volumes, 'volume')
      : null
  const facts = [
    metadata.status ? formatStatus(metadata.status) : null,
    years,
    length,
  ].filter((f): f is string => !!f)
  if (facts.length === 0 && !metadata.score) return null

  return (
    <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] tracking-wide text-foreground-soft uppercase tabular-nums">
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
      {!!metadata.score && (
        <span className="flex items-center gap-1">
          <StarIcon className="size-3" aria-hidden />
          <span
            aria-label={`AniList score ${(metadata.score / 10).toFixed(1)}`}
          >
            {(metadata.score / 10).toFixed(1)}
          </span>
        </span>
      )}
    </p>
  )
}
