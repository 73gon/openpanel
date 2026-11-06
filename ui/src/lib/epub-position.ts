/**
 * A place in an EPUB, and the page it counts as. The text has no pages of its own: the server
 * gives the book a length in pages from its characters, and a place is a chapter and how far
 * through it, so the book's progress, the page slider and bookmarks work as they do for a comic.
 */

export interface EpubPosition {
  chapter: number
  /** How far through the chapter, from 0 to 1. */
  fraction: number
}

/** A chapter of only a picture still takes a little room, so it can be landed on. */
const MIN_WEIGHT = 300

function weights(chars: number[]): number[] {
  return chars.map((c) => Math.max(c, MIN_WEIGHT))
}

/** How far through the whole book a place is, from 0 to 1. */
export function overallFraction(chars: number[], pos: EpubPosition): number {
  const w = weights(chars)
  const total = w.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  const before = w.slice(0, pos.chapter).reduce((a, b) => a + b, 0)
  return Math.min(
    1,
    (before + clamp01(pos.fraction) * (w[pos.chapter] ?? 0)) / total,
  )
}

/** The place that far through the book. */
export function positionAt(chars: number[], overall: number): EpubPosition {
  const w = weights(chars)
  const total = w.reduce((a, b) => a + b, 0)
  let left = clamp01(overall) * total
  for (let chapter = 0; chapter < w.length; chapter++) {
    if (left < w[chapter] || chapter === w.length - 1) {
      return { chapter, fraction: clamp01(left / w[chapter]) }
    }
    left -= w[chapter]
  }
  return { chapter: 0, fraction: 0 }
}

/** The page, from 1, that a place that far through the book is on. */
export function pageAt(overall: number, pageCount: number): number {
  return Math.max(1, Math.min(pageCount, Math.floor(overall * pageCount) + 1))
}

/** How far through the book a page starts. */
export function pageStart(page: number, pageCount: number): number {
  return pageCount > 0 ? clamp01((page - 1) / pageCount) : 0
}

/** A place as the server keeps it: "chapter:fraction". */
export function formatLocator(pos: EpubPosition): string {
  return `${pos.chapter}:${clamp01(pos.fraction).toFixed(4)}`
}

export function parseLocator(
  locator: string | null | undefined,
  chapterCount: number,
): EpubPosition | null {
  const match = /^(\d+):([\d.]+)$/.exec(locator ?? '')
  if (!match) return null
  const chapter = Number(match[1])
  const fraction = Number(match[2])
  if (chapter >= chapterCount || !Number.isFinite(fraction)) return null
  return { chapter, fraction: clamp01(fraction) }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
