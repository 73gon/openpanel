// AniList metadata helpers — data is now served by the backend.
// This file only contains display/format utilities.

import type { SeriesMetadata } from './api'

/**
 * A folder's name made fit to show: without its year ("(2018)") or a trailing AniList ID, as in
 * "Jujutsu Kaisen (2018) - 101517". An ID is any trailing " - " and four to seven digits, known
 * or not; a shorter number ("Part - 2") stays.
 */
export function displaySeriesName(
  name: string,
  anilistId?: number | null,
): string {
  let cleaned = name
    .replace(/\s*[-\u2013\u2014]\s*\d{4,7}\s*$/, '')
    .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, '')
    .replace(/\s*[-\u2013\u2014]\s*\d{4}\s*$/g, '')
  if (anilistId) {
    cleaned = cleaned.replace(
      new RegExp(`\\s*[-\\u2013\\u2014]\\s*${anilistId}\\s*$`),
      '',
    )
  }
  return cleaned.trim() || name
}

/**
 * A part of a story group by its own words, "Part 2 - Battle Tendency", where its name begins
 * with the story's; otherwise its name as it is.
 */
export function partName(
  name: string,
  anilistId: number | null | undefined,
  storyName: string,
): string {
  const full = displaySeriesName(name, anilistId)
  const story = displaySeriesName(storyName)
  if (full.toLowerCase().startsWith(story.toLowerCase())) {
    const rest = full.slice(story.length).replace(/^[\s\-\u2013\u2014:·]+/, '')
    if (rest) return rest
  }
  return full
}

export function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  const map: Record<string, string> = {
    FINISHED: 'Finished',
    RELEASING: 'Releasing',
    NOT_YET_RELEASED: 'Not Yet Released',
    CANCELLED: 'Cancelled',
    HIATUS: 'Hiatus',
  }
  return map[status] ?? status
}

/** Get the display title from server metadata. */
export function getDisplayTitle(
  meta: SeriesMetadata | null,
  fallbackName: string,
): string {
  if (!meta) return displaySeriesName(fallbackName)
  return (
    meta.title_english ||
    meta.title_romaji ||
    displaySeriesName(fallbackName, meta.anilist_id)
  )
}

/** Get the romaji subtitle (if different from display title). */
export function getRomajiSubtitle(meta: SeriesMetadata | null): string | null {
  if (!meta?.title_english || !meta.title_romaji) return null
  // "Berserk" under "Berserk" says nothing.
  const plain = (title: string) =>
    title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return plain(meta.title_romaji) === plain(meta.title_english)
    ? null
    : meta.title_romaji
}
