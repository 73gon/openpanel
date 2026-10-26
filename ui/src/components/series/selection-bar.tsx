import { Spinner, Toolbar, ToolbarButton, ToolbarSeparator } from '@zonsh/ui'
import { CheckIcon, CircleDashedIcon } from 'lucide-react'

/** The actions on the books ticked in select mode, floating at the bottom of the screen. */
export function SelectionBar({
  count,
  total,
  busy,
  onSelectAll,
  onMark,
  onDone,
}: {
  count: number
  total: number
  busy: boolean
  onSelectAll: () => void
  onMark: (completed: boolean) => void
  onDone: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 md:bottom-8">
      <Toolbar
        aria-label="Selected books"
        className="max-w-full shadow-overlay!"
      >
        <span
          role="status"
          className="px-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {count} of {total}
        </span>
        <ToolbarButton onClick={onSelectAll} disabled={count === total}>
          Select all
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton
          onClick={() => onMark(true)}
          disabled={!count || busy}
          aria-label="Mark read"
        >
          <CheckIcon />
          <span className="max-sm:hidden">Mark read</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onMark(false)}
          disabled={!count || busy}
          aria-label="Mark unread"
        >
          <CircleDashedIcon />
          <span className="max-sm:hidden">Mark unread</span>
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton onClick={onDone}>
          {busy ? <Spinner size="sm" label="Saving" /> : 'Done'}
        </ToolbarButton>
      </Toolbar>
    </div>
  )
}
