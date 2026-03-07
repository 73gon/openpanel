import { useState, useEffect, useCallback } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download04Icon,
  Delete02Icon,
  Book02Icon,
  HardDrive,
  Alert02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  type DownloadMeta,
  getDownloads,
  deleteDownload,
  deleteAllDownloads,
  getStorageEstimate,
  formatBytes,
} from '@/lib/downloads'

function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadMeta[]>([])
  const [storage, setStorage] = useState({ usage: 0, quota: 0 })
  const [loading, setLoading] = useState(true)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [dl, est] = await Promise.all([getDownloads(), getStorageEstimate()])
    setDownloads(dl)
    setStorage(est)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleDelete = async (bookId: string) => {
    setDeletingId(bookId)
    try {
      await deleteDownload(bookId)
      await refresh()
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteAll = async () => {
    await deleteAllDownloads()
    setConfirmDeleteAll(false)
    await refresh()
  }

  const totalDownloadSize = downloads.reduce((s, d) => s + d.totalSize, 0)

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
        {downloads.length > 0 && (
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

      {/* Storage info */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <HugeiconsIcon
          icon={HardDrive}
          size={18}
          className="text-muted-foreground"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Storage used</span>
            <span className="font-medium">
              {formatBytes(totalDownloadSize)}
              {storage.quota > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  / {formatBytes(storage.quota)}
                </span>
              )}
            </span>
          </div>
          {storage.quota > 0 && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min((storage.usage / storage.quota) * 100, 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Downloads list */}
      {downloads.length === 0 ? (
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
            {downloads.map((dl) => (
              <motion.div
                key={dl.bookId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: dl.seriesId }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-muted">
                      <HugeiconsIcon
                        icon={Book02Icon}
                        size={16}
                        className="text-muted-foreground/40"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{dl.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dl.seriesName}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                        <span>{dl.pageCount} pages</span>
                        <span>·</span>
                        <span>{formatBytes(dl.totalSize)}</span>
                        {dl.downloadedPages < dl.pageCount && (
                          <>
                            <span>·</span>
                            <span className="text-amber-500">
                              Incomplete ({dl.downloadedPages}/{dl.pageCount})
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(dl.bookId)}
                    disabled={deletingId === dl.bookId}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} />
                  </Button>
                </div>
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
                This will remove all {downloads.length} downloaded items (
                {formatBytes(totalDownloadSize)}). This cannot be undone.
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
})
