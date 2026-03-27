import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
