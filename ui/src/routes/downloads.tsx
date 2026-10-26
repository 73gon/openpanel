import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'motion/react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Heading,
  Progress,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@zonsh/ui'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import {
  type SeriesDownloadGroup,
  getDownloadsBySeries,
  deleteDownload,
  deleteAllDownloads,
  deleteSeriesDownloads,
  formatBytes,
  getDownloadedCover,
} from '@/lib/downloads'
import { useDownloadStore, type DownloadStatus } from '@/lib/download-store'
import { countLabel, pad2, stripTitleZeros } from '@/lib/utils'
import { Cover } from '@/components/cover'
import { Page } from '@/components/page'
import { PageHeader, SectionTitle } from '@/components/page-header'

// ── Swipe-to-delete row (touch screens) ──

function SwipeableItem({
  children,
  onDelete,
  label,
}: {
  children: React.ReactNode
  onDelete: () => void
  /** What a swipe deletes, for the hidden action's name. */
  label: string
}) {
  const x = useMotionValue(0)
  const bgOpacity = useTransform(x, [-120, -60, 0], [1, 0.8, 0])
  const iconScale = useTransform(x, [-120, -60, 0], [1, 0.8, 0.5])
  const isTouchDevice =
    typeof window !== 'undefined' && 'ontouchstart' in window

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -100) onDelete()
  }

  if (!isTouchDevice) return <>{children}</>

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-button">
      {/* A swipe to the left uncovers the delete action in its status colour. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end rounded-button bg-destructive/15 px-5 text-destructive"
        style={{ opacity: bgOpacity }}
      >
        <motion.span
          style={{ scale: iconScale }}
          className="flex items-center gap-2 font-mono text-xs uppercase"
        >
          <Trash2Icon className="size-4" />
          Delete
        </motion.span>
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.3, right: 0 }}
        dragDirectionLock
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative bg-background"
        aria-label={`${label}. Swipe left to delete.`}
      >
        {children}
      </motion.div>
    </div>
  )
}

/** "3 of 120 pages", "Paused at 48 of 120", "Queued" … */
function statusText(status: DownloadStatus): string {
  switch (status.status) {
    case 'complete':
      return formatBytes(status.totalSize)
    case 'error':
      return "Didn't finish"
    case 'paused':
      return `Paused at ${status.downloadedPages} of ${status.totalPages}`
    case 'queued':
      return 'Queued'
    default:
      return `${status.downloadedPages} of ${status.totalPages} pages`
  }
}

// ── A book in the queue ──

function QueueRow({
  status,
  title,
  subtitle,
  onPause,
  onResume,
  onCancel,
}: {
  status: DownloadStatus
  title: string
  subtitle?: string
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const pct =
    status.totalPages > 0
      ? Math.round((status.downloadedPages / status.totalPages) * 100)
      : 0
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <p className="m-0 truncate text-sm text-foreground">
            {subtitle && (
              <span className="text-foreground-soft">{subtitle} · </span>
            )}
            {title}
          </p>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {statusText(status)}
          </span>
        </div>
        <Progress
          value={status.status === 'queued' ? null : pct}
          tone={
            status.status === 'error'
              ? 'destructive'
              : status.status === 'paused'
                ? 'warning'
                : 'default'
          }
          aria-label={`${title}: ${statusText(status)}`}
          className="mt-2"
        />
      </div>
      {status.status === 'downloading' && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Pause ${title}`}
          onClick={onPause}
        >
          <PauseIcon />
        </Button>
      )}
      {status.status === 'paused' && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Resume ${title}`}
          onClick={onResume}
        >
          <PlayIcon />
        </Button>
      )}
      {status.status !== 'complete' && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Cancel ${title}`}
          onClick={onCancel}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}

// ── A downloaded series ──

function SeriesRow({
  group,
  activeCount,
  onSelect,
  onDelete,
}: {
  group: SeriesDownloadGroup
  activeCount: number
  onSelect: () => void
  onDelete: () => void
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDownloadedCover(`/api/series/${group.seriesId}/thumbnail`).then(
      (url) => {
        if (!cancelled && url) setCoverUrl(url)
      },
    )
    return () => {
      cancelled = true
    }
  }, [group.seriesId])

  const facts = [
    group.totalBooks
      ? `${group.completedBooks} of ${countLabel(group.totalBooks, 'book')}`
      : null,
    group.totalSize ? formatBytes(group.totalSize) : null,
    activeCount ? `${activeCount} in the queue` : null,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-1">
      <SwipeableItem onDelete={onDelete} label={group.seriesName}>
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full min-w-0 cursor-pointer items-center gap-4 rounded-button px-2 py-2 text-left material-row focus-ring"
        >
          <Cover src={coverUrl} className="w-10 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] text-foreground">
              {group.seriesName}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground tabular-nums">
              {facts.join(' · ')}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </SwipeableItem>
      <DeleteSeriesButton name={group.seriesName} onDelete={onDelete} />
    </div>
  )
}

function DeleteSeriesButton({
  name,
  onDelete,
}: {
  name: string
  onDelete: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete the downloads of ${name}`}
            className="shrink-0 [@media(hover:none)]:hidden"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the downloads of {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They leave this device. The series stays in your library, and you
            can download it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="secondary" />}>
            Keep them
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={onDelete}
          >
            Delete downloads
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── One series, opened ──

function SeriesDetail({
  group,
  queueStatuses,
  onBack,
  onDeleteBook,
}: {
  group: SeriesDownloadGroup
  queueStatuses: Record<string, DownloadStatus>
  onBack: () => void
  onDeleteBook: (bookId: string) => void
}) {
  const { pauseDownload, resumeDownload, cancelDownload } = useDownloadStore()
  const navigate = useNavigate()
  const queue = useDownloadStore((s) => s.queue)

  // Extract number from title for sorting
  const extractNumber = (title: string): number => {
    const match = title.match(/(\d+(\.\d+)?)/)
    return match ? parseFloat(match[1]) : Infinity
  }

  // Merge downloaded books with queue items not yet in metadata
  const allBooks = [...group.books]
  for (const qi of queue) {
    if (
      qi.seriesId === group.seriesId &&
      !allBooks.find((b) => b.bookId === qi.bookId)
    ) {
      allBooks.push({
        bookId: qi.bookId,
        title: qi.title,
        seriesId: qi.seriesId,
        seriesName: qi.seriesName,
        pageCount: qi.pageCount,
        downloadedPages: 0,
        totalSize: 0,
        downloadedAt: '',
      })
    }
  }
  allBooks.sort((a, b) => extractNumber(a.title) - extractNumber(b.title))

  return (
    <section
      aria-labelledby="series-downloads-title"
      className="flex flex-col gap-6"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-3 self-start"
      >
        <ArrowLeftIcon />
        All downloads
      </Button>
      <div className="flex items-baseline gap-2.5">
        <Heading level={3} as="h2" id="series-downloads-title">
          {group.seriesName}
        </Heading>
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
          {pad2(allBooks.length)}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border/60 border-y border-border/60 p-0">
        <AnimatePresence mode="popLayout" initial={false}>
          {allBooks.map((book) => {
            const qs = queueStatuses[book.bookId]
            const inQueue = !!qs && qs.status !== 'complete'
            const complete =
              book.downloadedPages === book.pageCount &&
              book.pageCount > 0 &&
              (!qs || qs.status === 'complete')
            const title = stripTitleZeros(book.title)

            return (
              <motion.li
                key={book.bookId}
                layout
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {inQueue ? (
                  <QueueRow
                    status={qs}
                    title={title}
                    onPause={() => pauseDownload(book.bookId)}
                    onResume={() => resumeDownload(book.bookId)}
                    onCancel={() => cancelDownload(book.bookId)}
                  />
                ) : (
                  <SwipeableItem
                    onDelete={() => onDeleteBook(book.bookId)}
                    label={title}
                  >
                    <div className="flex items-center gap-1 py-1.5">
                      <button
                        type="button"
                        disabled={!complete}
                        onClick={() =>
                          navigate({
                            to: '/read/$bookId',
                            params: { bookId: book.bookId },
                          })
                        }
                        className="flex min-h-(--control-h-lg) min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-button px-2 text-left material-row focus-ring disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-foreground">
                            {title}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">
                            {formatBytes(book.totalSize)}
                            {!complete && book.pageCount > 0 && (
                              <span className="text-warning">
                                {' '}
                                · Partly downloaded, {
                                  book.downloadedPages
                                } of {book.pageCount} pages
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete the download of ${title}`}
                        onClick={() => onDeleteBook(book.bookId)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </SwipeableItem>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </section>
  )
}

// ── Main Downloads Page ──

type SortBy = 'name' | 'date' | 'size'
type FilterBy = 'all' | 'complete' | 'incomplete'

function DownloadsPage() {
  const [groups, setGroups] = useState<SeriesDownloadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [filterBy, setFilterBy] = useState<FilterBy>('all')

  const queue = useDownloadStore((s) => s.queue)
  const statuses = useDownloadStore((s) => s.statuses)
  const { pauseDownload, resumeDownload, cancelDownload, clearQueue } =
    useDownloadStore()

  const refresh = useCallback(async () => {
    setGroups(await getDownloadsBySeries())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Re-refresh when statuses update (download completes)
  const statusesRef = useRef(statuses)
  useEffect(() => {
    const prev = statusesRef.current
    statusesRef.current = statuses
    for (const [id, s] of Object.entries(statuses)) {
      if (s.status === 'complete' && prev[id]?.status !== 'complete') {
        refresh()
        break
      }
    }
  }, [statuses, refresh])

  const handleDeleteAll = async () => {
    clearQueue()
    await deleteAllDownloads()
    setSelectedSeries(null)
    await refresh()
    toast.success('Every download is deleted from this device.')
  }

  const handleDeleteBook = async (bookId: string) => {
    cancelDownload(bookId)
    await deleteDownload(bookId)
    await refresh()
  }

  const handleDeleteSeries = async (seriesId: string) => {
    const name = groups.find((g) => g.seriesId === seriesId)?.seriesName
    queue
      .filter((q) => q.seriesId === seriesId)
      .forEach((q) => cancelDownload(q.bookId))
    await deleteSeriesDownloads(seriesId)
    if (selectedSeries === seriesId) setSelectedSeries(null)
    await refresh()
    if (name) toast.success(`The downloads of ${name} are deleted.`)
  }

  const totalBooks = groups.reduce((s, g) => s + g.totalBooks, 0)
  const totalSize = groups.reduce((s, g) => s + g.totalSize, 0)
  const selectedGroup = groups.find((g) => g.seriesId === selectedSeries)

  // Build combined groups including queued-only series
  const allGroups = useMemo(() => {
    const merged = [...groups]
    for (const qi of queue) {
      if (!merged.find((g) => g.seriesId === qi.seriesId)) {
        merged.push({
          seriesId: qi.seriesId,
          seriesName: qi.seriesName,
          books: [],
          totalSize: 0,
          totalBooks: 0,
          completedBooks: 0,
        })
      }
    }

    let filtered = merged
    if (filterBy === 'complete') {
      filtered = merged.filter(
        (g) => g.totalBooks > 0 && g.completedBooks === g.totalBooks,
      )
    } else if (filterBy === 'incomplete') {
      filtered = merged.filter(
        (g) => g.totalBooks === 0 || g.completedBooks < g.totalBooks,
      )
    }

    const sorted = [...filtered]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.seriesName.localeCompare(b.seriesName))
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => b.totalSize - a.totalSize)
    } else if (sortBy === 'date') {
      const latestDate = (g: SeriesDownloadGroup) =>
        g.books.reduce(
          (max, b) => (b.downloadedAt > max ? b.downloadedAt : max),
          '',
        )
      sorted.sort((a, b) => latestDate(b).localeCompare(latestDate(a)))
    }
    return sorted
  }, [groups, queue, sortBy, filterBy])

  const activeQueue = queue.filter((qi) => statuses[qi.bookId])
  const hasAny = totalBooks > 0 || queue.length > 0

  return (
    <Page className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Offline"
        title="Downloads"
        facts={
          hasAny
            ? [countLabel(totalBooks, 'book'), formatBytes(totalSize)].join(
                ' · ',
              )
            : 'Books you can read without a connection'
        }
        actions={
          hasAny && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" />}>
                Delete all
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete every download?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All downloaded books leave this device and the queue is
                    cancelled. Your library and your progress stay as they are.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="secondary" />}>
                    Keep them
                  </AlertDialogClose>
                  <AlertDialogClose
                    render={<Button variant="destructive" />}
                    onClick={handleDeleteAll}
                  >
                    Delete all downloads
                  </AlertDialogClose>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      />

      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading your downloads…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="item" className="h-14" />
          ))}
        </div>
      ) : selectedGroup ? (
        <SeriesDetail
          group={selectedGroup}
          queueStatuses={statuses}
          onBack={() => setSelectedSeries(null)}
          onDeleteBook={handleDeleteBook}
        />
      ) : !hasAny ? (
        <Empty>
          <EmptyMedia>
            <DownloadIcon />
          </EmptyMedia>
          <EmptyTitle render={<h2 />}>Nothing downloaded yet</EmptyTitle>
          <EmptyDescription>
            Download volumes or chapters from a series page, and read them here
            without a connection.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          {activeQueue.length > 0 && (
            <section
              aria-labelledby="queue-title"
              className="flex flex-col gap-3"
            >
              <SectionTitle
                id="queue-title"
                title="Downloading"
                context={countLabel(activeQueue.length, 'book')}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearQueue()}
                  >
                    Cancel all
                  </Button>
                }
              />
              <ul className="m-0 flex list-none flex-col divide-y divide-border/60 border-y border-border/60 p-0">
                {activeQueue.map((qi) => (
                  <li key={qi.bookId}>
                    <QueueRow
                      status={statuses[qi.bookId]}
                      title={stripTitleZeros(qi.title)}
                      subtitle={qi.seriesName}
                      onPause={() => pauseDownload(qi.bookId)}
                      onResume={() => resumeDownload(qi.bookId)}
                      onCancel={() => cancelDownload(qi.bookId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-labelledby="series-title"
            className="flex flex-col gap-4"
          >
            <SectionTitle
              id="series-title"
              title="Series"
              context={countLabel(allGroups.length, 'series', 'series')}
              actions={
                <>
                  <ToggleGroup
                    aria-label="Sort by"
                    value={[sortBy]}
                    onValueChange={(v) => v[0] && setSortBy(v[0])}
                  >
                    <ToggleGroupItem value="name">A–Z</ToggleGroupItem>
                    <ToggleGroupItem value="date">Newest</ToggleGroupItem>
                    <ToggleGroupItem value="size">Largest</ToggleGroupItem>
                  </ToggleGroup>
                  <ToggleGroup
                    aria-label="Show"
                    value={[filterBy]}
                    onValueChange={(v) => v[0] && setFilterBy(v[0])}
                  >
                    <ToggleGroupItem value="all">All</ToggleGroupItem>
                    <ToggleGroupItem value="complete">Complete</ToggleGroupItem>
                    <ToggleGroupItem value="incomplete">
                      Partial
                    </ToggleGroupItem>
                  </ToggleGroup>
                </>
              }
            />
            {allGroups.length === 0 ? (
              <p className="m-0 py-8 text-center text-sm text-muted-foreground">
                No series match that filter.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                <AnimatePresence mode="popLayout" initial={false}>
                  {allGroups.map((group) => (
                    <motion.li
                      key={group.seriesId}
                      layout
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <SeriesRow
                        group={group}
                        activeCount={
                          group.books.filter(
                            (b) =>
                              statuses[b.bookId] &&
                              ['queued', 'downloading', 'paused'].includes(
                                statuses[b.bookId].status,
                              ),
                          ).length
                        }
                        onSelect={() => setSelectedSeries(group.seriesId)}
                        onDelete={() => handleDeleteSeries(group.seriesId)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  )
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
  errorComponent: RouteErrorComponent,
})
