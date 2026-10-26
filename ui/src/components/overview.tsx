import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@zonsh/ui'
import { cn } from '@/lib/utils'

/** A description kept to a few lines, with "Show more" when there is more than fits. */
export function Overview({
  text,
  lines = 3,
  className,
}: {
  text?: string | null
  lines?: 2 | 3 | 4
  className?: string
}) {
  const id = useId()
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Measured while clamped, and again whenever the width changes the line breaks.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded])

  if (!text) return null
  const clamp = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' }[
    lines
  ]

  return (
    <div className={className}>
      <p
        ref={ref}
        id={id}
        className={cn(
          'm-0 max-w-[65ch] text-[17px] leading-[1.6] text-foreground-soft',
          !expanded && clamp,
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <Button
          variant="link"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[15px] text-foreground"
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}
