import type { ReactNode } from 'react'
import { Eyebrow } from '@zonsh/ui'
import { cn } from '@/lib/utils'

/**
 * The top of an app page: an eyebrow, the page's title in Licht, a mono line of facts and the
 * page's actions on the right (below the title when narrow).
 */
export function PageHeader({
  eyebrow,
  title,
  facts,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  /** Mono facts under the title: "248 series · 3 libraries". */
  facts?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-5',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="m-0 font-heading text-[30px] leading-[1.06] font-light tracking-[-0.02em] sm:text-[36px]">
          {title}
        </h1>
        {facts && (
          <p className="m-0 font-mono text-xs text-muted-foreground tabular-nums">
            {facts}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}

/** A section title inside a page: Licht at 22px, with mono context on the right. */
export function SectionTitle({
  id,
  title,
  context,
  actions,
  className,
}: {
  id?: string
  title: ReactNode
  context?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <h2
          id={id}
          className="m-0 font-heading text-[22px] leading-tight font-light tracking-[-0.01em]"
        >
          {title}
        </h2>
        {context && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {context}
          </span>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
