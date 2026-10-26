import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A book or series cover. Every cover has the same shape: 5:7, square corners, its own fill and
 * a hairline edge. The image fades in once it has loaded; without one (or when it fails), the
 * fallback stands in — the title, or a book glyph.
 */
export function Cover({
  src,
  alt = '',
  loading = 'lazy',
  fallback,
  className,
  imgClassName,
  children,
}: {
  src?: string | null
  alt?: string
  loading?: 'lazy' | 'eager'
  fallback?: ReactNode
  className?: string
  imgClassName?: string
  /** Overlays laid over the art: a progress bar, a selection mark. */
  children?: ReactNode
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    // A cached image can finish before React attaches onLoad.
    const img = ref.current
    setLoaded(!!img && img.complete && img.naturalWidth > 0)
  }, [src])

  return (
    <div
      className={cn(
        'relative aspect-[5/7] overflow-hidden border border-border bg-muted',
        className,
      )}
    >
      {src && !failed ? (
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-[opacity,scale] duration-(--duration) ease-(--ease)',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ) : (
        <div className="flex size-full items-center justify-center p-3 text-center text-sm text-balance text-muted-foreground">
          {fallback ?? <BookIcon className="size-6 opacity-50" aria-hidden />}
        </div>
      )}
      {children}
    </div>
  )
}
