import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Art behind the top of a page. Rather than a scrim in --background (which can't match the
 * grained page ground and leaves a seam), the art itself fades with a mask: full strength
 * near the top, into the ground below; dimmed on the left, where the title and text sit.
 */
const MASK_IMAGE = [
  'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
  'linear-gradient(to right, rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.32) 45%, rgb(0 0 0 / 0.75))',
].join(', ')

const MASK: CSSProperties = {
  maskImage: MASK_IMAGE,
  maskComposite: 'intersect',
  WebkitMaskImage: MASK_IMAGE,
  WebkitMaskComposite: 'source-in',
}

export function Backdrop({
  src,
  className,
}: {
  src: string | null | undefined
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  if (!src) return null
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 top-0', className)}
      style={MASK}
    >
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        className={cn(
          'size-full object-cover transition-opacity duration-700 ease-(--ease)',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
