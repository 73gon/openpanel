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
