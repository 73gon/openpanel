import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookmarkAdd01Icon,
  BookmarkMinus01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import type { Bookmark } from '@/lib/api'

interface BookmarksPanelProps {
  show: boolean
  onClose: () => void
  bookmarks: Bookmark[]
  currentPage: number
  isCurrentPageBookmarked: boolean
  onAddBookmark: () => void
  onDeleteBookmark: (id: number) => void
  onGoToPage: (page: number) => void
}

export function BookmarksPanel({
  show,
  onClose,
  bookmarks,
  currentPage,
  isCurrentPageBookmarked,
  onAddBookmark,
  onDeleteBookmark,
  onGoToPage,
}: BookmarksPanelProps) {
  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop to dismiss on outside click (mobile) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-29 md:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-3 top-1/2 z-30 max-h-[calc(100vh-5rem)] w-64 -translate-y-1/2 overflow-y-auto rounded-xl bg-background/90 shadow-lg backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-3 p-3">
              {/* Add / remove current page */}
              <button
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isCurrentPageBookmarked
                    ? 'border border-primary/30 bg-primary/20 text-primary'
                    : 'border border-white/10 bg-white/10 text-white/80 hover:bg-white/15'
                }`}
                onClick={() => {
                  if (isCurrentPageBookmarked) {
                    const bm = bookmarks.find((b) => b.page === currentPage)
                    if (bm) onDeleteBookmark(bm.id)
                  } else {
                    onAddBookmark()
                  }
                }}
              >
                <HugeiconsIcon
                  icon={
                    isCurrentPageBookmarked
                      ? BookmarkMinus01Icon
                      : BookmarkAdd01Icon
                  }
                  size={16}
                />
                {isCurrentPageBookmarked
                  ? `Remove page ${currentPage}`
                  : `Bookmark page ${currentPage}`}
              </button>

              {bookmarks.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">
                  No bookmarks yet
                </p>
              ) : (
                <div className="mt-2 space-y-1">
                  {bookmarks
                    .sort((a, b) => a.page - b.page)
                    .map((bm) => (
                      <div
                        key={bm.id}
                        className={`group flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 transition-colors ${
                          bm.page === currentPage
                            ? 'bg-primary/15 text-primary'
                            : 'text-white/70 hover:bg-white/10'
                        }`}
                        onClick={() => {
                          onGoToPage(bm.page)
                          onClose()
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <HugeiconsIcon
                            icon={BookmarkAdd01Icon}
                            size={14}
                            className="shrink-0 opacity-50"
                          />
                          <div>
                            <span className="text-sm font-medium">
                              Page {bm.page}
                            </span>
                            {bm.note && (
                              <p className="mt-0.5 text-xs opacity-60">
                                {bm.note}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          className="hover:opacity-100! flex h-6 w-6 items-center justify-center rounded text-red-400 opacity-0 transition-opacity group-hover:opacity-60"
                          aria-label="Remove bookmark"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteBookmark(bm.id)
                          }}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
