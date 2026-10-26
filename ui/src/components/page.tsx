import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** The column every app page sits in: the zon page width and gutters, clear of the notch. */
export function Page({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'container-page pt-[calc(2rem+env(safe-area-inset-top,0px))] pb-16 sm:pt-12 md:pt-14',
        className,
      )}
      {...props}
    />
  )
}
