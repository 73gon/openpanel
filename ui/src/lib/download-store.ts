/**
 * Global download queue store using Zustand.
 * Manages download queue, active downloads, pause/resume/cancel.
 * Downloads are processed sequentially from the queue.
 */

import { create } from 'zustand'
import { useAppStore } from './store'
import { addAdminLog } from './api'

// ── Types ──

export type DownloadItemStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'complete'
  | 'error'

export interface QueueItem {
  bookId: string
  title: string
  seriesId: string
  seriesName: string
  pageCount: number
  coverUrl?: string // thumbnail URL to download
}

export interface DownloadStatus {
  bookId: string
  status: DownloadItemStatus
  downloadedPages: number
  totalPages: number
  totalSize: number
}

interface DownloadStore {
  // State
  queue: QueueItem[]
  statuses: Record<string, DownloadStatus>
  processing: boolean

  // Actions
  addToQueue: (items: QueueItem[]) => void
  removeFromQueue: (bookId: string) => void
  clearQueue: () => void
  pauseDownload: (bookId: string) => void
  resumeDownload: (bookId: string) => void
  cancelDownload: (bookId: string) => void

  // Internal
  _setStatus: (bookId: string, status: Partial<DownloadStatus>) => void
  _setProcessing: (processing: boolean) => void
  _removeQueueItem: (bookId: string) => void
}

// AbortControllers for active downloads – keyed by bookId
const abortControllers = new Map<string, AbortController>()
// Set of paused bookIds
const pausedSet = new Set<string>()
// Retry config
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000 // exponential: 1s, 2s, 4s

// ── Persistence helpers ──
const QUEUE_KEY = 'op-download-queue'
const STATUS_KEY = 'op-download-statuses'

function persistState(
  queue: QueueItem[],
  statuses: Record<string, DownloadStatus>,
) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    localStorage.setItem(STATUS_KEY, JSON.stringify(statuses))
  } catch {}
}

function loadPersistedState(): {
  queue: QueueItem[]
  statuses: Record<string, DownloadStatus>
} {
  try {
    const q = localStorage.getItem(QUEUE_KEY)
    const s = localStorage.getItem(STATUS_KEY)
    const queue: QueueItem[] = q ? JSON.parse(q) : []
    const statuses: Record<string, DownloadStatus> = s ? JSON.parse(s) : {}
    // Any item that was 'downloading' when we closed should become 'queued' so it resumes
    for (const [id, st] of Object.entries(statuses)) {
      if (st.status === 'downloading') {
        statuses[id] = { ...st, status: 'queued' }
      }
    }
    return { queue, statuses }
  } catch {
    return { queue: [], statuses: {} }
  }
}

const persisted = loadPersistedState()

export const useDownloadStore = create<DownloadStore>()((set, get) => ({
  queue: persisted.queue,
  statuses: persisted.statuses,
  processing: false,

  addToQueue: (items) => {
    const { queue, statuses } = get()
    const newItems = items.filter(
      (item) =>
        !queue.some((q) => q.bookId === item.bookId) &&
        statuses[item.bookId]?.status !== 'downloading',
    )
    if (newItems.length === 0) return

    const newStatuses = { ...statuses }
    for (const item of newItems) {
      if (
        !newStatuses[item.bookId] ||
        newStatuses[item.bookId].status === 'error'
      ) {
        newStatuses[item.bookId] = {
          bookId: item.bookId,
          status: 'queued',
          downloadedPages: 0,
          totalPages: item.pageCount,
          totalSize: 0,
        }
      }
    }

    set({ queue: [...queue, ...newItems], statuses: newStatuses })

    // Start processing if not already
    if (!get().processing) {
      processQueue()
    }
  },

  removeFromQueue: (bookId) => {
    set((s) => ({
      queue: s.queue.filter((q) => q.bookId !== bookId),
    }))
  },

  clearQueue: () => {
    // Cancel all active downloads
    for (const [id, controller] of abortControllers) {
      controller.abort()
      abortControllers.delete(id)
    }
    pausedSet.clear()
    set({ queue: [], statuses: {}, processing: false })
  },

  pauseDownload: (bookId) => {
    pausedSet.add(bookId)
    const controller = abortControllers.get(bookId)
    if (controller) {
      controller.abort()
      abortControllers.delete(bookId)
    }
    set((s) => ({
      statuses: {
        ...s.statuses,
        [bookId]: { ...s.statuses[bookId], status: 'paused' },
      },
    }))
  },

  resumeDownload: (bookId) => {
    pausedSet.delete(bookId)
    const status = get().statuses[bookId]
    if (status?.status === 'paused') {
      set((s) => ({
        statuses: {
          ...s.statuses,
          [bookId]: { ...s.statuses[bookId], status: 'queued' },
        },
      }))
      // Re-add to front of queue if not already there
      const { queue } = get()
      const item = queue.find((q) => q.bookId === bookId)
      if (!item) {
        // Need to reconstruct from status — find in queue or create minimal
        // This shouldn't happen normally since paused items stay in queue
      }
      if (!get().processing) {
        processQueue()
      }
    }
  },

  cancelDownload: (bookId) => {
    pausedSet.delete(bookId)
    const controller = abortControllers.get(bookId)
    if (controller) {
      controller.abort()
      abortControllers.delete(bookId)
    }
    set((s) => {
      const newStatuses = { ...s.statuses }
      delete newStatuses[bookId]
      return {
        queue: s.queue.filter((q) => q.bookId !== bookId),
        statuses: newStatuses,
      }
    })
  },

  _setStatus: (bookId, partial) => {
    set((s) => ({
      statuses: {
        ...s.statuses,
        [bookId]: { ...s.statuses[bookId], ...partial },
      },
    }))
  },

  _setProcessing: (processing) => set({ processing }),

  _removeQueueItem: (bookId) => {
    set((s) => ({
      queue: s.queue.filter((q) => q.bookId !== bookId),
    }))
  },
}))

// ── Persist on every state change ──
useDownloadStore.subscribe((state) => {
  persistState(state.queue, state.statuses)
})

// ── Resume any pending downloads on startup ──
if (persisted.queue.length > 0) {
  // Defer to next tick so the store is fully initialized
  setTimeout(() => {
    const { queue, statuses, processing } = useDownloadStore.getState()
    const hasWork = queue.some((q) => statuses[q.bookId]?.status === 'queued')
    if (hasWork && !processing) {
      processQueue()
    }
  }, 500)
}

// ── Queue processor ──

async function processQueue() {
  const store = useDownloadStore.getState()
  if (store.processing) return
  store._setProcessing(true)

  while (true) {
    const { queue, statuses } = useDownloadStore.getState()

    // Find next item to process (queued status, not paused)
    const next = queue.find(
      (q) =>
        statuses[q.bookId]?.status === 'queued' && !pausedSet.has(q.bookId),
    )
    if (!next) break

    await downloadItem(next)
  }

  useDownloadStore.getState()._setProcessing(false)
}

async function downloadItem(item: QueueItem) {
  const { _setStatus, _removeQueueItem } = useDownloadStore.getState()
  const token = useAppStore.getState().token

  const controller = new AbortController()
  abortControllers.set(item.bookId, controller)

  // Import DB functions dynamically to avoid circular deps
  const { openDB, saveMetadata, downloadCover } = await import('./downloads')
  const db = await openDB()

  // Verify actual IDB page count to handle partial writes
  const verifiedPages = await countExistingPages(db, item.bookId, item.pageCount)

  const existingStatus = useDownloadStore.getState().statuses[item.bookId]
  const startPage = verifiedPages + 1

  _setStatus(item.bookId, {
    status: 'downloading',
    totalPages: item.pageCount,
    downloadedPages: verifiedPages,
  })

  let downloadedPages = verifiedPages
  let totalSize = existingStatus?.totalSize ?? 0

  // Request persistence on first download
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist()
    }
  } catch {}

  // Download cover if not already cached
  try {
    await downloadCover(db, `/api/books/${item.bookId}/thumbnail`, token)
    if (item.seriesId) {
      await downloadCover(db, `/api/series/${item.seriesId}/thumbnail`, token)
    }
  } catch {
    // Non-critical, continue with pages
  }

  for (let page = startPage; page <= item.pageCount; page++) {
    // Check if paused or cancelled
    if (pausedSet.has(item.bookId) || controller.signal.aborted) {
      // Save partial metadata
      await saveMetadata(db, {
        bookId: item.bookId,
        title: item.title,
        seriesName: item.seriesName,
        seriesId: item.seriesId,
        pageCount: item.pageCount,
        downloadedPages,
        totalSize,
        downloadedAt: new Date().toISOString(),
      })
      db.close()
      abortControllers.delete(item.bookId)

      if (pausedSet.has(item.bookId)) {
        _setStatus(item.bookId, {
          status: 'paused',
          downloadedPages,
          totalSize,
        })
      }
      return
    }

    try {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      // Retry loop with exponential backoff
      let blob: Blob | null = null
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`/api/books/${item.bookId}/pages/${page}`, {
            headers,
            signal: controller.signal,
          })
          if (!res.ok) throw new Error(`Page ${page}: ${res.status}`)
          blob = await res.blob()
          break // success
        } catch (fetchErr) {
          if (controller.signal.aborted || pausedSet.has(item.bookId)) throw fetchErr
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * Math.pow(2, attempt)
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
          throw fetchErr
        }
      }
      if (!blob) throw new Error(`Page ${page}: failed after retries`)

      totalSize += blob.size

      // Store page blob in IDB
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pages', 'readwrite')
        tx.objectStore('pages').put(blob, `${item.bookId}-${page}`)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      downloadedPages = page
      _setStatus(item.bookId, {
        downloadedPages,
        totalSize,
        status: 'downloading',
      })
    } catch (err) {
      if (controller.signal.aborted || pausedSet.has(item.bookId)) {
        await saveMetadata(db, {
          bookId: item.bookId,
          title: item.title,
          seriesName: item.seriesName,
          seriesId: item.seriesId,
          pageCount: item.pageCount,
          downloadedPages,
          totalSize,
          downloadedAt: new Date().toISOString(),
        })
        db.close()
        abortControllers.delete(item.bookId)
        if (pausedSet.has(item.bookId)) {
          _setStatus(item.bookId, {
            status: 'paused',
            downloadedPages,
            totalSize,
          })
        }
        return
      }

      // Real error
      await saveMetadata(db, {
        bookId: item.bookId,
        title: item.title,
        seriesName: item.seriesName,
        seriesId: item.seriesId,
        pageCount: item.pageCount,
        downloadedPages,
        totalSize,
        downloadedAt: new Date().toISOString(),
      })
      db.close()
      abortControllers.delete(item.bookId)
      _setStatus(item.bookId, { status: 'error', downloadedPages, totalSize })
      _removeQueueItem(item.bookId)
      addAdminLog(
        'error',
        'download',
        `Download failed: ${item.seriesName} - ${item.title}`,
        `Page ${downloadedPages}/${item.pageCount}, ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
      return
    }
  }

  // Complete
  await saveMetadata(db, {
    bookId: item.bookId,
    title: item.title,
    seriesName: item.seriesName,
    seriesId: item.seriesId,
    pageCount: item.pageCount,
    downloadedPages: item.pageCount,
    totalSize,
    downloadedAt: new Date().toISOString(),
  })
  db.close()
  abortControllers.delete(item.bookId)
  _setStatus(item.bookId, {
    status: 'complete',
    downloadedPages: item.pageCount,
    totalSize,
  })
  _removeQueueItem(item.bookId)
  addAdminLog(
    'info',
    'download',
    `Downloaded: ${item.seriesName} - ${item.title}`,
    `${item.pageCount} pages, ${(totalSize / 1024 / 1024).toFixed(1)} MB`,
  )
}

// ── IDB page verification helper ──

async function countExistingPages(
  db: IDBDatabase,
  bookId: string,
  pageCount: number,
): Promise<number> {
  // Check which pages actually exist in IDB to handle partial writes
  let count = 0
  for (let p = 1; p <= pageCount; p++) {
    const exists = await new Promise<boolean>((resolve) => {
      const tx = db.transaction('pages', 'readonly')
      const req = tx.objectStore('pages').count(`${bookId}-${p}`)
      req.onsuccess = () => resolve(req.result > 0)
      req.onerror = () => resolve(false)
    })
    if (exists) {
      count = p // pages are sequential, last existing = count
    } else {
      break // stop at first missing page
    }
  }
  return count
}

// ── Online/offline auto-pause/resume ──

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    // Pause all active downloads when going offline
    const { queue, statuses } = useDownloadStore.getState()
    for (const qi of queue) {
      const s = statuses[qi.bookId]
      if (s?.status === 'downloading') {
        useDownloadStore.getState().pauseDownload(qi.bookId)
      }
    }
  })

  window.addEventListener('online', () => {
    // Resume queued/paused downloads when back online
    const { queue, statuses, processing } = useDownloadStore.getState()
    let resumed = false
    for (const qi of queue) {
      const s = statuses[qi.bookId]
      if (s?.status === 'paused' || s?.status === 'queued') {
        pausedSet.delete(qi.bookId)
        useDownloadStore.getState()._setStatus(qi.bookId, { status: 'queued' })
        resumed = true
      }
    }
    // Also retry errored items
    for (const [id, s] of Object.entries(statuses)) {
      if (s.status === 'error') {
        useDownloadStore.getState()._setStatus(id, { status: 'queued' })
        // Re-add to queue if not present
        if (!queue.find((q) => q.bookId === id)) {
          // Can't fully reconstruct queue item, but the status will allow retry if re-queued
        }
        resumed = true
      }
    }
    if (resumed && !processing) {
      processQueue()
    }
  })
}
