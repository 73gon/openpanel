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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download04Icon,
  Delete02Icon,
  Book02Icon,
  Alert02Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  type SeriesDownloadGroup,
  getDownloadsBySeries,
  deleteDownload,
  deleteAllDownloads,
  deleteSeriesDownloads,
  getStorageEstimate,
  formatBytes,
  getDownloadedCover,
} from '@/lib/downloads'
import { useDownloadStore, type DownloadStatus } from '@/lib/download-store'
import { CircularProgress } from '@/components/ui/circular-progress'

// ── Swipe-to-delete item ──

function SwipeableItem({
  children,
  onDelete,
  itemKey,
}: {
  children: React.ReactNode
  onDelete: () => void
  itemKey: string
}) {
  const x = useMotionValue(0)
  const bgOpacity = useTransform(x, [-120, -60, 0], [1, 0.8, 0])
  const deleteScale = useTransform(x, [-120, -60, 0], [1, 0.8, 0.5])
  const isTouchDevice =
    typeof window !== 'undefined' && 'ontouchstart' in window

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -100) {
      onDelete()
    }
  }

  if (!isTouchDevice) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-lg bg-destructive px-4"
        style={{ opacity: bgOpacity }}
      >
        <motion.div style={{ scale: deleteScale }}>
          <HugeiconsIcon icon={Delete02Icon} size={20} className="text-white" />
        </motion.div>
      </motion.div>
      {/* Draggable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.3, right: 0 }}
        dragDirectionLock
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative"
        key={itemKey}
      >
        {children}
      </motion.div>
    </div>
  )
}

// ── Queue item with circular progress ──

function QueueBookItem({
  status,
  title,
  onPause,
  onResume,
  onCancel,
}: {
  status: DownloadStatus
  title: string
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const progress =
    status.totalPages > 0 ? status.downloadedPages / status.totalPages : 0

  return (
    <div className="flex items-center gap-3 py-1.5">
      <CircularProgress
        progress={progress}
        status={status.status}
        size={28}
        strokeWidth={3}
        onClick={() => {
          if (status.status === 'downloading') onPause()
          else if (status.status === 'paused') onResume()
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <p className="text-[10px] text-muted-foreground">
          {status.status === 'complete'
            ? formatBytes(status.totalSize)
            : status.status === 'error'
              ? 'Error'
              : status.status === 'paused'
                ? `Paused · ${status.downloadedPages}/${status.totalPages}`
                : status.status === 'queued'
                  ? 'Queued'
                  : `${status.downloadedPages}/${status.totalPages} pages`}
        </p>
      </div>
      {status.status !== 'complete' && (
        <button
          onClick={onCancel}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
          aria-label="Cancel download"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      )}
    </div>
  )
}

// ── Series group card (collapsed) ──

function SeriesGroupCard({
  group,
  queueStatuses,
  onSelect,
  onDelete,
}: {
  group: SeriesDownloadGroup
  queueStatuses: Record<string, DownloadStatus>
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

  // Count active/queued items for this series
  const activeCount = group.books.filter(
    (b) =>
      queueStatuses[b.bookId] &&
      ['queued', 'downloading', 'paused'].includes(
        queueStatuses[b.bookId].status,
      ),
  ).length

  return (
    <SwipeableItem onDelete={onDelete} itemKey={group.seriesId}>
      <button
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
      >
        <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <HugeiconsIcon
                icon={Book02Icon}
                size={16}
                className="text-muted-foreground/40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{group.seriesName}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              {group.completedBooks}/{group.totalBooks} books
            </span>
            <span>·</span>
            <span>{formatBytes(group.totalSize)}</span>
            {activeCount > 0 && (
              <>
                <span>·</span>
                <span className="text-primary">{activeCount} in queue</span>
              </>
            )}
          </div>
        </div>
        <HugeiconsIcon
          icon={ArrowLeft02Icon}
          size={16}
          className="shrink-0 rotate-180 text-muted-foreground"
        />
      </button>
    </SwipeableItem>
  )
}

// ── Series detail view (expanded) ──

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

  // Extract number from title for sorting
  const extractNumber = (title: string): number => {
    const match = title.match(/(\d+(\.\d+)?)/)
    return match ? parseFloat(match[1]) : Infinity
  }

  // Merge downloaded books with queue items
  const allBooks = [...group.books]
  // Add queued items not yet in metadata
  const queue = useDownloadStore((s) => s.queue)
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

  // Sort by chapter/volume number
  allBooks.sort((a, b) => extractNumber(a.title) - extractNumber(b.title))

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
        Back
      </button>
      <h2 className="mb-3 text-lg font-semibold">{group.seriesName}</h2>
      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {allBooks.map((book) => {
            const qs = queueStatuses[book.bookId]
            const isInQueue = !!qs && qs.status !== 'complete'
            const isComplete =
              book.downloadedPages === book.pageCount &&
              book.pageCount > 0 &&
              (!qs || qs.status === 'complete')

            if (isInQueue) {
              return (
                <motion.div
                  key={book.bookId}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -80 }}
                >
                  <QueueBookItem
                    status={qs}
                    title={book.title}
                    onPause={() => pauseDownload(book.bookId)}
                    onResume={() => resumeDownload(book.bookId)}
                    onCancel={() => cancelDownload(book.bookId)}
                  />
                </motion.div>
              )
            }

            const progress =
              book.pageCount > 0 ? book.downloadedPages / book.pageCount : 0

            return (
              <motion.div
                key={book.bookId}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -80 }}
              >
                <SwipeableItem
                  onDelete={() => onDeleteBook(book.bookId)}
                  itemKey={book.bookId}
                >
                  <div
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 cursor-pointer"
                    onClick={() => {
                      if (isComplete) {
                        navigate({
                          to: '/read/$bookId',
                          params: { bookId: book.bookId },
                        })
                      }
                    }}
                  >
                    <CircularProgress
                      progress={progress}
                      status={isComplete ? 'complete' : 'error'}
                      size={28}
                      strokeWidth={3}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{book.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(book.totalSize)}
                        {!isComplete && book.pageCount > 0 && (
                          <span className="text-amber-500">
                            {' '}
                            · Incomplete ({book.downloadedPages}/
                            {book.pageCount})
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => onDeleteBook(book.bookId)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Delete download"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                    </button>
                  </div>
                </SwipeableItem>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Main Downloads Page ──

type SortBy = 'name' | 'date' | 'size'
type FilterBy = 'all' | 'complete' | 'incomplete'

function DownloadsPage() {
  const [groups, setGroups] = useState<SeriesDownloadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [filterBy, setFilterBy] = useState<FilterBy>('all')

  const queue = useDownloadStore((s) => s.queue)
  const statuses = useDownloadStore((s) => s.statuses)
  const { pauseDownload, resumeDownload, cancelDownload, clearQueue } =
    useDownloadStore()

  const refresh = useCallback(async () => {
    const [grps] = await Promise.all([
      getDownloadsBySeries(),
      getStorageEstimate(),
    ])
    setGroups(grps)
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
    // If any status changed to complete, refresh
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
    setConfirmDeleteAll(false)
    setSelectedSeries(null)
    await refresh()
  }

  const handleDeleteBook = async (bookId: string) => {
    cancelDownload(bookId)
    await deleteDownload(bookId)
    await refresh()
  }

  const handleDeleteSeries = async (seriesId: string) => {
    // Cancel any queued items
    queue
      .filter((q) => q.seriesId === seriesId)
      .forEach((q) => cancelDownload(q.bookId))
    await deleteSeriesDownloads(seriesId)
    if (selectedSeries === seriesId) setSelectedSeries(null)
    await refresh()
  }

  const totalBooks = groups.reduce((s, g) => s + g.totalBooks, 0)
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

    // Filter
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

    // Sort
    const sorted = [...filtered]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.seriesName.localeCompare(b.seriesName))
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => b.totalSize - a.totalSize)
    } else if (sortBy === 'date') {
      const latestDate = (g: SeriesDownloadGroup) => {
        if (g.books.length === 0) return ''
        return g.books.reduce(
          (max, b) => (b.downloadedAt > max ? b.downloadedAt : max),
          '',
        )
      }
      sorted.sort((a, b) => latestDate(b).localeCompare(latestDate(a)))
    }
    return sorted
  }, [groups, queue, sortBy, filterBy])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <HugeiconsIcon
            icon={Download04Icon}
            size={20}
            className="text-muted-foreground"
          />
          <h1 className="text-xl font-semibold">Downloads</h1>
        </div>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Download04Icon}
            size={20}
            className="text-muted-foreground"
          />
          <h1 className="text-xl font-semibold">Downloads</h1>
        </div>
        {(totalBooks > 0 || queue.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDeleteAll(true)}
          >
            Delete All
          </Button>
        )}
      </div>

      {/* Sort / Filter controls */}
      {(totalBooks > 0 || queue.length > 0) && !selectedSeries && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(
              [
                ['name', 'A–Z'],
                ['date', 'Date'],
                ['size', 'Size'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSortBy(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(
              [
                ['all', 'All'],
                ['complete', 'Done'],
                ['incomplete', 'Partial'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilterBy(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterBy === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active queue summary */}
      {queue.length > 0 && !selectedSeries && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              Download Queue ({queue.length})
            </p>
            <button
              onClick={() => clearQueue()}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Cancel all
            </button>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {queue.map((qi) => {
              const qs = statuses[qi.bookId]
              if (!qs) return null
              return (
                <QueueBookItem
                  key={qi.bookId}
                  status={qs}
                  title={`${qi.seriesName} · ${qi.title}`}
                  onPause={() => pauseDownload(qi.bookId)}
                  onResume={() => resumeDownload(qi.bookId)}
                  onCancel={() => cancelDownload(qi.bookId)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Content */}
      {selectedGroup ? (
        <SeriesDetail
          group={selectedGroup}
          queueStatuses={statuses}
          onBack={() => setSelectedSeries(null)}
          onDeleteBook={handleDeleteBook}
        />
      ) : allGroups.length === 0 && queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HugeiconsIcon
            icon={Download04Icon}
            size={48}
            className="mb-4 text-muted-foreground/30"
          />
          <p className="text-muted-foreground">No downloads yet</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            Download chapters or volumes from a series page for offline reading.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {allGroups.map((group) => (
              <motion.div
                key={group.seriesId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.2 }}
              >
                <SeriesGroupCard
                  group={group}
                  queueStatuses={statuses}
                  onSelect={() => setSelectedSeries(group.seriesId)}
                  onDelete={() => handleDeleteSeries(group.seriesId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete all confirmation */}
      <AnimatePresence>
        {confirmDeleteAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
            onClick={() => setConfirmDeleteAll(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  size={20}
                  className="text-destructive"
                />
                <h3 className="font-semibold">Delete all downloads?</h3>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                This will remove all downloaded items and cancel queued
                downloads. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeleteAll(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                >
                  Delete All
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
  errorComponent: RouteErrorComponent,
})
