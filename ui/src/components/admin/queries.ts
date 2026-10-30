import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  checkForUpdates,
  fetchAdminOverview,
  fetchAdminProfiles,
  fetchAdminSettings,
  fetchBackups,
  fetchLibraries,
  fetchMetadataReview,
  fetchScanStatus,
  fetchVersion,
} from '@/lib/api'
import { invalidateAfterScan, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'

/** The state of the server, kept fresh while an administrator looks at it. */
export function useOverview() {
  const scanning = useAppStore((s) => s.scanRunning)
  return useQuery({
    queryKey: queryKeys.adminOverview(),
    queryFn: fetchAdminOverview,
    refetchInterval: scanning ? 2_000 : 30_000,
  })
}

/**
 * The scan, polled every second while one runs. When it ends, everything a scan changes is
 * fetched again, in case the server's notification didn't arrive.
 */
export function useScanStatus() {
  const scanning = useAppStore((s) => s.scanRunning)
  const setScanRunning = useAppStore((s) => s.setScanRunning)
  const query = useQuery({
    queryKey: queryKeys.scanStatus(),
    queryFn: fetchScanStatus,
    refetchInterval: (q) => (q.state.data?.running || scanning ? 1_000 : false),
  })

  const running = query.data?.running
  const wasRunning = useRef(running)
  useEffect(() => {
    if (running === undefined) return
    if (wasRunning.current && !running) invalidateAfterScan()
    wasRunning.current = running
    setScanRunning(running)
  }, [running, setScanRunning])

  return query
}

export function useMetadataReview() {
  return useQuery({
    queryKey: queryKeys.metadataReview(),
    queryFn: fetchMetadataReview,
    // While AniList is being asked again, show the matches as they change.
    refetchInterval: (q) => (q.state.data?.rematch.running ? 3_000 : false),
  })
}

/** Whether there is an update. The server keeps its answer 15 minutes; this, 5. */
export function useUpdateCheck() {
  return useQuery({
    queryKey: queryKeys.updateCheck(),
    queryFn: () => checkForUpdates(),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useVersion() {
  return useQuery({ queryKey: queryKeys.version(), queryFn: fetchVersion })
}

export function useLibraries() {
  return useQuery({ queryKey: queryKeys.libraries(), queryFn: fetchLibraries })
}

export function useProfiles() {
  return useQuery({
    queryKey: queryKeys.adminProfiles(),
    queryFn: fetchAdminProfiles,
    refetchInterval: 60_000,
  })
}

export function useAdminSettings() {
  return useQuery({
    queryKey: queryKeys.adminSettings(),
    queryFn: fetchAdminSettings,
  })
}

export function useBackups() {
  return useQuery({ queryKey: queryKeys.backups(), queryFn: fetchBackups })
}
