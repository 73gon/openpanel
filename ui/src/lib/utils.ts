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

/** A list index for mono columns, so short numbers line up: 7 → "07", 120 → "120". */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
