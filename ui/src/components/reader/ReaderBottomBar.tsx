import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft, ArrowRight } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import type { Book, BookDetail } from '@/lib/api'
import type { ReadMode } from '@/lib/reader-store'

interface ReaderBottomBarProps {
  show: boolean
  book: BookDetail
  currentPage: number
  direction: 'ltr' | 'rtl'
  readMode: ReadMode
  prevBook: Book | null
  nextBook: Book | null
  goToPage: (page: number) => void
  goForward: () => void
  goBackward: () => void
  pauseHideTimer: () => void
  resumeHideTimer: () => void
}

export function ReaderBottomBar({
  show,
  book,
  currentPage,
  direction,
  readMode,
  prevBook,
  nextBook,
  goToPage,
  goForward,
  goBackward,
  pauseHideTimer,
  resumeHideTimer,
}: ReaderBottomBarProps) {
  return (
    <AnimatePresence>
      {show && (readMode === 'single' || readMode === 'double') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-border/50 bg-background/90 px-4 py-2 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={pauseHideTimer}
          onMouseLeave={resumeHideTimer}
        >
          <div className="flex items-center gap-2">
            {prevBook && (
              <Link to="/read/$bookId" params={{ bookId: prevBook.id }}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  <HugeiconsIcon icon={ArrowLeft} size={12} />
                  {prevBook.title}
                </Button>
              </Link>
            )}
          </div>

          {/* Slider + page arrows — desktop only */}
          <div className="hidden items-center gap-3 md:flex">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous page"
              onClick={(e) => {
                e.stopPropagation()
                if (direction === 'rtl') goForward()
                else goBackward()
              }}
              disabled={
                direction === 'rtl'
                  ? currentPage >= book.page_count
                  : currentPage <= 1
              }
            >
              <HugeiconsIcon icon={ArrowLeft} size={14} />
            </Button>

            <input
              type="range"
              min={1}
              max={book.page_count}
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className={`w-32 accent-primary ${direction === 'rtl' ? 'rotate-180' : ''}`}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Next page"
              onClick={(e) => {
                e.stopPropagation()
                if (direction === 'rtl') goBackward()
                else goForward()
              }}
              disabled={
                direction === 'rtl'
                  ? currentPage <= 1
                  : currentPage >= book.page_count
              }
            >
              <HugeiconsIcon icon={ArrowRight} size={14} />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {nextBook && (
              <Link to="/read/$bookId" params={{ bookId: nextBook.id }}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  {nextBook.title}
                  <HugeiconsIcon icon={ArrowRight} size={12} />
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
