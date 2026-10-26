import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ClockIcon,
  DownloadIcon,
  PauseIcon,
  RotateCcwIcon,
} from 'lucide-react'
import type { DownloadItemStatus } from '@/lib/download-store'
import { cn } from '@/lib/utils'

const LABELS: Record<DownloadItemStatus | 'none', string> = {
  none: 'Download',
  queued: 'Queued',
  downloading: 'Downloading, tap to pause',
  paused: 'Paused, tap to resume',
  complete: 'Downloaded',
  error: 'Download failed, tap to retry',
}

/**
 * A book's download state as a small round control: a hairline ring that fills in the ink as
 * pages arrive. Colour marks the states people look for — saved in green, paused in amber,
 * failed in red — always with the icon and the label beside it.
 */
export function DownloadIndicator({
  progress = 0,
  status,
  size = 28,
  onClick,
  className,
}: {
  /** 0–1 */
  progress?: number
  /** Nothing yet: the control offers the download. */
  status?: DownloadItemStatus
  size?: number
  onClick?: () => void
  className?: string
}) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const shown = status === 'complete' ? 1 : status ? Math.min(progress, 1) : 0
  const Icon = {
    none: DownloadIcon,
    queued: ClockIcon,
    downloading: ArrowDownIcon,
    paused: PauseIcon,
    complete: ArrowDownToLineIcon,
    error: RotateCcwIcon,
  }[status ?? 'none']

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LABELS[status ?? 'none']}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full focus-ring transition-colors duration-(--duration) ease-(--ease)',
        status === 'complete'
          ? 'text-success'
          : status === 'paused'
            ? 'text-warning'
            : status === 'error'
              ? 'text-destructive'
              : status === 'downloading'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--field-edge)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          className="transition-[stroke-dashoffset] duration-200 ease-(--ease)"
        />
      </svg>
      <Icon size={Math.round(size * 0.45)} className="relative" />
    </button>
  )
}
