// AniList metadata helpers — data is now served by the backend.
// This file only contains display/format utilities.

import type { SeriesMetadata } from './api'

/** Strip year patterns from folder names for clean display. */
export function displaySeriesName(name: string): string {
  return (
    name
      .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, '')
      .replace(/\s*[-\u2013\u2014]\s*\d{4}\s*$/g, '')
      .trim() || name
  )
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
  if (!meta) return fallbackName
  return meta.title_english || meta.title_romaji || fallbackName
}

/** Get the romaji subtitle (if different from display title). */
export function getRomajiSubtitle(
  meta: SeriesMetadata | null,
): string | null {
  if (!meta) return null
  if (meta.title_english && meta.title_romaji) return meta.title_romaji
  return null
}
