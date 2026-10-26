import { Link } from '@tanstack/react-router'
import { Button } from '@zonsh/ui'
import { PlayIcon, RotateCcwIcon } from 'lucide-react'
import type { SeriesContinueResponse } from '@/lib/api'
import { cn, stripTitleZeros } from '@/lib/utils'

/** The primary label names the outcome: "Read Volume 1", "Continue Chapter 34", "Read again". */
export function continueLabel(info: SeriesContinueResponse): string {
  const book = stripTitleZeros(info.book_title)
  if (info.action === 'start') return `Read ${book}`
  if (info.action === 'continue') return `Continue ${book}`
  return 'Read again'
}

/** The reader picks up where the reader stopped; starting or rereading opens page one. */
export function continueSearch(info: SeriesContinueResponse) {
  return { page: info.action === 'continue' ? info.page : 1 }
}

export function ContinueButton({ info }: { info: SeriesContinueResponse }) {
  return (
    <Button
      size="lg"
      nativeButton={false}
      render={
        <Link
          to="/read/$bookId"
          params={{ bookId: info.book_id }}
          search={continueSearch(info)}
        />
      }
    >
      {info.action === 'reread' ? <RotateCcwIcon /> : <PlayIcon />}
      {continueLabel(info)}
    </Button>
  )
}

/** The same action, floating in the corner once the page's own button has scrolled away. */
export function ContinueFab({
  info,
  visible,
}: {
  info: SeriesContinueResponse
  visible: boolean
}) {
  return (
    <div
      inert={!visible}
      data-slot="continue-fab"
      data-visible={visible || undefined}
      className={cn(
        'fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-30 transition-[opacity,translate] duration-(--duration-reveal) ease-(--ease) md:right-8 md:bottom-8',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      <ContinueButton info={info} />
    </div>
  )
}
