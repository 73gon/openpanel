import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds — matches router preload stale time
      gcTime: 5 * 60_000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// ----- Query key factories -----

export const queryKeys = {
  // Home page
  continueReading: () => ['continueReading'] as const,
  recentlyAdded: (limit: number) => ['recentlyAdded', limit] as const,
  recentlyUpdated: (limit: number) => ['recentlyUpdated', limit] as const,
  preferences: () => ['preferences'] as const,
  genres: () => ['genres'] as const,

  // Library (infinite)
  allSeries: (filters: Record<string, unknown>) =>
    ['allSeries', filters] as const,

  // Series detail
  series: (id: string) => ['series', id] as const,
  seriesBooks: (id: string) => ['seriesBooks', id] as const,
  seriesMetadata: (id: string) => ['seriesMetadata', id] as const,
  seriesChapters: (id: string) => ['seriesChapters', id] as const,

  // Progress
  batchProgress: (bookIds: string[]) => ['batchProgress', bookIds] as const,
  progress: (bookId: string) => ['progress', bookId] as const,

  // Admin
  adminSettings: () => ['adminSettings'] as const,
  adminProfiles: () => ['adminProfiles'] as const,
  adminLogs: (filters: Record<string, unknown>) =>
    ['adminLogs', filters] as const,
  scanStatus: () => ['scanStatus'] as const,
  libraries: () => ['libraries'] as const,
  backups: () => ['backups'] as const,
} as const
