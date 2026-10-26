import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@zonsh/ui'
import { BookmarkMinusIcon, BookmarkPlusIcon, XIcon } from 'lucide-react'
import type { Bookmark } from '@/lib/api'
import { useIsPhone } from '@/lib/use-media-query'

interface BookmarksPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookmarks: Bookmark[]
  currentPage: number
  isCurrentPageBookmarked: boolean
  onAddBookmark: () => void
  onDeleteBookmark: (id: string) => void
  onGoToPage: (page: number) => void
}

/** This book's bookmarks: a side panel on wide screens, a bottom sheet on a phone. */
export function BookmarksPanel({
  open,
  onOpenChange,
  bookmarks,
  currentPage,
  isCurrentPageBookmarked,
  onAddBookmark,
  onDeleteBookmark,
  onGoToPage,
}: BookmarksPanelProps) {
  const phone = useIsPhone()
  const sorted = [...bookmarks].sort((a, b) => a.page - b.page)
  const current = bookmarks.find((b) => b.page === currentPage)

  return (
    <Drawer
      side={phone ? 'bottom' : 'right'}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Bookmarks</DrawerTitle>
          <DrawerDescription>Pages you marked in this book.</DrawerDescription>
        </DrawerHeader>

        {isCurrentPageBookmarked && current ? (
          <Button
            variant="secondary"
            onClick={() => onDeleteBookmark(current.id)}
          >
            <BookmarkMinusIcon />
            Remove the bookmark on page {currentPage}
          </Button>
        ) : (
          <Button onClick={onAddBookmark}>
            <BookmarkPlusIcon />
            Bookmark page {currentPage}
          </Button>
        )}

        {sorted.length === 0 ? (
          <Empty className="py-8 md:py-10">
            <EmptyTitle render={<h3 />} className="text-xl md:text-xl">
              No bookmarks yet
            </EmptyTitle>
            <EmptyDescription>
              Bookmark a page to find your way back to it.
            </EmptyDescription>
          </Empty>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-border/60 p-0 pt-3">
            {sorted.map((bm) => (
              <li key={bm.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-current={bm.page === currentPage ? 'true' : undefined}
                  onClick={() => onGoToPage(bm.page)}
                  className="flex min-h-(--control-h) min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-button px-3 text-left material-row focus-ring"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    Page {bm.page}
                  </span>
                  <span className="min-w-0 truncate text-sm">
                    {bm.note || (bm.page === currentPage ? 'You are here' : '')}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove the bookmark on page ${bm.page}`}
                  onClick={() => onDeleteBookmark(bm.id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DrawerContent>
    </Drawer>
  )
}
