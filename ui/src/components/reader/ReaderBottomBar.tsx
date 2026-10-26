import { Link } from '@tanstack/react-router'
import { Button, DirectionProvider, Slider } from '@zonsh/ui'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type { Book, BookDetail } from '@/lib/api'
import type { ReadDirection } from '@/lib/reader-store'
import { stripTitleZeros } from '@/lib/utils'

interface ReaderBottomBarProps {
  book: BookDetail
  currentPage: number
  direction: ReadDirection
  prevBook: Book | null
  nextBook: Book | null
  goToPage: (page: number) => void
  goForward: () => void
  goBackward: () => void
}

/**
 * The page bar of the paged modes: the neighbouring books at the ends, page arrows and a
 * slider between them. Everything follows the reading direction: right to left, the next
 * page and the next book are on the left.
 */
export function ReaderBottomBar({
  book,
  currentPage,
  direction,
  prevBook,
  nextBook,
  goToPage,
  goForward,
  goBackward,
}: ReaderBottomBarProps) {
  const rtl = direction === 'rtl'
  const leftBook = rtl ? nextBook : prevBook
  const rightBook = rtl ? prevBook : nextBook
  const atStart = currentPage <= 1
  const atEnd = currentPage >= book.page_count

  return (
    <div className="pointer-events-none flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-4">
      <div
        role="group"
        aria-label="Pages"
        className="pointer-events-auto flex w-full max-w-2xl items-center gap-1 rounded-button p-1 surface-container shadow-overlay!"
      >
        <BookLink
          book={leftBook}
          side="left"
          label={rtl ? 'Next' : 'Previous'}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={rtl ? 'Next page' : 'Previous page'}
          onClick={rtl ? goForward : goBackward}
          disabled={rtl ? atEnd : atStart}
        >
          <ChevronLeftIcon />
        </Button>
        <DirectionProvider direction={direction}>
          <div dir={direction} className="min-w-0 flex-1 px-2">
            <Slider
              min={1}
              max={book.page_count}
              value={currentPage}
              onValueChange={(value) => goToPage(value)}
              thumbLabels={['Page']}
              className="w-full"
            />
          </div>
        </DirectionProvider>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={rtl ? 'Previous page' : 'Next page'}
          onClick={rtl ? goBackward : goForward}
          disabled={rtl ? atStart : atEnd}
        >
          <ChevronRightIcon />
        </Button>
        <BookLink
          book={rightBook}
          side="right"
          label={rtl ? 'Previous' : 'Next'}
        />
      </div>
    </div>
  )
}

function BookLink({
  book,
  side,
  label,
}: {
  book: Book | null
  side: 'left' | 'right'
  label: 'Previous' | 'Next'
}) {
  if (!book) return null
  const title = stripTitleZeros(book.title)
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link to="/read/$bookId" params={{ bookId: book.id }} />}
      aria-label={`${label}: ${title}`}
      className="shrink-0 max-md:px-2"
    >
      {side === 'left' && <ArrowLeftIcon />}
      <span className="max-w-32 truncate max-md:hidden">{title}</span>
      {side === 'right' && <ArrowRightIcon />}
    </Button>
  )
}
