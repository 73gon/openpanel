import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strip leading zeros from chapter/volume titles for display.
 * "Volume 0007" → "Volume 7", "Chapter 0001" → "Chapter 1"
 * Preserves decimal numbers: "Volume 3.5" stays "Volume 3.5"
 * Does not affect sort order (sort_order field is independent).
 */
export function stripTitleZeros(title: string): string {
  return title.replace(
    /^(Volume|Chapter|Vol|Ch)\s+0*(\d+(?:\.\d+)?)/i,
    (_, prefix, num) => `${prefix} ${num}`,
  )
}

/** "1 volume", "12 volumes", "1,284 pages". Irregular units pass their plural ("series"). */
export function countLabel(
  count: number,
  unit: string,
  plural = `${unit}s`,
): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? unit : plural}`
}

/**
 * A timestamp from the server as a Date, or null when it is missing or unreadable.
 * SQLite's CURRENT_TIMESTAMP and datetime('now') give UTC without a zone ("2026-04-07 19:06:55"),
 * which Chrome reads as local time and Safari not at all, so those are marked as UTC.
 */
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
  const date = new Date(sqlite ? `${value.replace(' ', 'T')}Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A server timestamp through `format`, or null when there is no readable date to show. */
export function formatServerDate(
  format: Intl.DateTimeFormat,
  value: string | null | undefined,
): string | null {
  const date = parseServerDate(value)
  return date ? format.format(date) : null
}

/** A list index for mono columns, so short numbers line up: 7 → "07", 120 → "120". */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * How long ago a server timestamp was, in words: "just now", "12 minutes ago", "yesterday",
 * "5 days ago", then the date. Null when there is no readable date.
 */
export function timeAgo(
  value: string | null | undefined,
  now: number = Date.now(),
): string | null {
  const date = parseServerDate(value)
  if (!date) return null
  const seconds = Math.round((now - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 7) return relative.format(-days, 'day')
  return shortDate.format(date)
}

/** A span of time, in the two largest units: "45 s", "12 min", "3 h 20 min", "4 days". */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 1) return 'under a second'
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s} s`
  const minutes = Math.floor(s / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) {
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
  }
  return countLabel(Math.floor(hours / 24), 'day')
}

/** A browser's user agent in words: "Chrome on Windows", "Safari on iPhone". */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : /^curl\//.test(ua)
                ? 'curl'
                : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}
