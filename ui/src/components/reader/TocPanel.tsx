import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@zonsh/ui'
import type { BookChapter } from '@/lib/api'
import { useIsPhone } from '@/lib/use-media-query'
import { pad2, stripTitleZeros } from '@/lib/utils'

interface TocPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chapters: BookChapter[]
  currentPage: number
  onGoToPage: (page: number) => void
}

/** The chapters inside this book; the one being read is raised. */
export function TocPanel({
  open,
  onOpenChange,
  chapters,
  currentPage,
  onGoToPage,
}: TocPanelProps) {
  const phone = useIsPhone()

  return (
    <Drawer
      side={phone ? 'bottom' : 'right'}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Contents</DrawerTitle>
          <DrawerDescription>The chapters in this book.</DrawerDescription>
        </DrawerHeader>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
          {chapters.map((ch) => {
            const here =
              currentPage >= ch.start_page + 1 && currentPage <= ch.end_page + 1
            return (
              <li key={ch.chapter_number}>
                <button
                  type="button"
                  aria-current={here ? 'true' : undefined}
                  onClick={() => onGoToPage(ch.start_page + 1)}
                  className="flex min-h-(--control-h) w-full cursor-pointer items-center gap-4 rounded-button px-3 text-left material-row focus-ring"
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {pad2(ch.chapter_number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {stripTitleZeros(ch.title)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    p. {ch.start_page + 1}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </DrawerContent>
    </Drawer>
  )
}
