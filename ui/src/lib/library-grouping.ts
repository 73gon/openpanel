import { useQuery } from '@tanstack/react-query'
import { fetchPreferences } from './api'
import { queryKeys } from './query'

/**
 * How the library shows a story group (a folder holding the folders of a story's parts): as one
 * poster that opens to its parts, or every part on its own. Each reader's own choice, kept with
 * their preferences.
 */
export type LibraryGrouping = 'groups' | 'parts'

export function readGrouping(prefs: Record<string, unknown>): LibraryGrouping {
  return prefs.libraryGrouping === 'parts' ? 'parts' : 'groups'
}

export async function fetchLibraryGrouping(): Promise<LibraryGrouping> {
  return readGrouping(await fetchPreferences())
}

export const libraryGroupingQuery = {
  queryKey: queryKeys.libraryGrouping(),
  queryFn: fetchLibraryGrouping,
  staleTime: 60_000,
}

export function useLibraryGrouping(): LibraryGrouping {
  return useQuery(libraryGroupingQuery).data ?? 'groups'
}
