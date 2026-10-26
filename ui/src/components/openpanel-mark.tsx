import { cn } from '@/lib/utils'

/**
 * The OpenPanel mark: two panels, each with its tick, flat and in the current ink. `size` is
 * the mark's height. The geometry is the logo's own (public/logo-*.svg), cropped to the mark.
 */
export function OpenPanelMark({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="55 56 265 263"
      width={size}
      height={size}
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <path
        fill="currentColor"
        d="M55.2 112.7H226.6V56.3H263.4V112.7H319.8V149.5H55.2ZM57.4 225.6H319.8V262.4H207V318.7H170.2V262.4H57.4Z"
      />
    </svg>
  )
}

/** The mark beside the name, set in Licht like every headline. */
export function OpenPanelLogo({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <OpenPanelMark size={size} />
      <span
        className="font-heading leading-none font-light tracking-[-0.02em]"
        style={{ fontSize: Math.round(size * 1.05) }}
      >
        OpenPanel
      </span>
    </span>
  )
}
