import { type DownloadItemStatus } from '@/lib/download-store'

interface CircularProgressProps {
  /** 0-1 fraction */
  progress: number
  /** Size of the circle in pixels */
  size?: number
  /** Stroke width in pixels */
  strokeWidth?: number
  /** Current download status */
  status?: DownloadItemStatus
  /** Called when the circle is clicked */
  onClick?: () => void
  className?: string
}

export function CircularProgress({
  progress,
  size = 28,
  strokeWidth = 3,
  status,
  onClick,
  className = '',
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - Math.min(progress, 1) * circumference

  const isComplete = status === 'complete'
  const isPaused = status === 'paused'
  const isError = status === 'error'
  const isQueued = status === 'queued'
  const isDownloading = status === 'downloading'

  // Color based on status
  const strokeColor = isComplete
    ? 'stroke-green-500'
    : isError
      ? 'stroke-red-500'
      : isPaused
        ? 'stroke-yellow-500'
        : 'stroke-primary'

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      type="button"
      aria-label={
        isComplete
          ? 'Downloaded'
          : isPaused
            ? 'Paused - tap to resume'
            : isDownloading
              ? 'Downloading - tap to pause'
              : isQueued
                ? 'Queued'
                : isError
                  ? 'Error - tap to retry'
                  : 'Download'
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={`transition-all duration-200 ${strokeColor}`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>

      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isComplete ? (
          // Downloaded checkmark — but user said no checkmark, use a download-done icon
          <DownloadedIcon size={size * 0.45} />
        ) : isPaused ? (
          <PauseIcon size={size * 0.35} />
        ) : isDownloading ? (
          <DownloadingIcon size={size * 0.35} />
        ) : isQueued ? (
          <QueuedIcon size={size * 0.35} />
        ) : isError ? (
          <ErrorIcon size={size * 0.35} />
        ) : null}
      </div>
    </button>
  )
}

function DownloadedIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="text-green-500"
    >
      {/* Down arrow with bar — "saved to device" icon */}
      <path
        d="M8 2v8m0 0L5 7m3 3l3-3M3 13h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="text-yellow-500"
    >
      <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function DownloadingIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="text-primary"
    >
      <path
        d="M8 3v6m0 0L5.5 6.5M8 9l2.5-2.5M3 12h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function QueuedIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="text-muted-foreground"
    >
      {/* Clock / waiting icon */}
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5v3.5l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ErrorIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="text-red-500"
    >
      <path
        d="M8 4v5M8 11v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
