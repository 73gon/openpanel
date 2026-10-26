import { useRef, type ReactNode } from 'react'
import { Button, Heading } from '@zonsh/ui'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { pad2 } from '@/lib/utils'

/**
 * A titled row that scrolls sideways: a Licht group title with a mono count, and round
 * secondary arrows on wider screens. The row runs out to the page's edges, under the gutter.
 */
export function Shelf({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: number
  /** A quiet link beside the arrows ("See all"). */
  action?: ReactNode
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)

  const scroll = (dir: 1 | -1) => {
    const el = scroller.current
    if (el)
      el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Heading level={4} as="h2" className="truncate">
            {title}
          </Heading>
          {count != null && (
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
              {pad2(count)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <div className="hidden gap-2 sm:flex">
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Scroll ${title} back`}
              onClick={() => scroll(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Scroll ${title} on`}
              onClick={() => scroll(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        className="scrollbar-hide -mx-6 flex snap-x gap-4 overflow-x-auto scroll-px-6 px-6 pb-2 sm:-mx-10 sm:scroll-px-10 sm:px-10 lg:-mx-16 lg:scroll-px-16 lg:px-16"
      >
        {children}
      </div>
    </section>
  )
}
