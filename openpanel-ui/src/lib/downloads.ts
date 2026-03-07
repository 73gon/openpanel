/**
 * Offline download system using IndexedDB for storing manga pages as blobs.
 * Uses navigator.storage.persist() for eviction protection.
 */

import { useAppStore } from './store'

const DB_NAME = 'openpanel-downloads'
const DB_VERSION = 1
const PAGES_STORE = 'pages'
const META_STORE = 'metadata'

// ── Types ──

export interface DownloadMeta {
  bookId: string
  title: string
  seriesName: string
  seriesId: string
  pageCount: number
  downloadedPages: number
  totalSize: number
  downloadedAt: string
}

export interface DownloadProgress {
  bookId: string
  downloaded: number
  total: number
  status: 'downloading' | 'complete' | 'error'
}

// ── Database ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PAGES_STORE)) {
        db.createObjectStore(PAGES_STORE)
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'bookId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── Storage persistence ──

let persistenceRequested = false

async function requestPersistence() {
  if (persistenceRequested) return
  persistenceRequested = true
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist()
    }
  } catch {
    // Silently fail - persistence is best-effort
  }
}

// ── Download a book ──

export async function downloadBook(
  bookId: string,
  pageCount: number,
  title: string,
  seriesName: string,
  seriesId: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  await requestPersistence()

  const db = await openDB()
  const token = useAppStore.getState().token

  let downloadedPages = 0
  let totalSize = 0

  const report = (status: DownloadProgress['status'] = 'downloading') => {
    onProgress?.({
      bookId,
      downloaded: downloadedPages,
      total: pageCount,
      status,
    })
  }

  report('downloading')

  // Download pages sequentially to avoid flooding the server
  for (let page = 1; page <= pageCount; page++) {
    try {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/books/${bookId}/pages/${page}`, { headers })
      if (!res.ok)
        throw new Error(`Failed to fetch page ${page}: ${res.status}`)

      const blob = await res.blob()
      totalSize += blob.size

      // Store in IDB
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PAGES_STORE, 'readwrite')
        const store = tx.objectStore(PAGES_STORE)
        store.put(blob, `${bookId}-${page}`)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      downloadedPages = page
      report('downloading')
    } catch (err) {
      // Save partial metadata
      await saveMetadata(db, {
        bookId,
        title,
        seriesName,
        seriesId,
        pageCount,
        downloadedPages,
        totalSize,
        downloadedAt: new Date().toISOString(),
      })
      db.close()
      report('error')
      throw err
    }
  }

  // Save final metadata
  await saveMetadata(db, {
    bookId,
    title,
    seriesName,
    seriesId,
    pageCount,
    downloadedPages: pageCount,
    totalSize,
    downloadedAt: new Date().toISOString(),
  })

  db.close()
  report('complete')
}

// ── Delete a download ──

export async function deleteDownload(bookId: string): Promise<void> {
  const db = await openDB()

  // Get metadata to know page count
  const meta = await new Promise<DownloadMeta | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const store = tx.objectStore(META_STORE)
      const req = store.get(bookId)
      req.onsuccess = () => resolve(req.result as DownloadMeta | undefined)
      req.onerror = () => reject(req.error)
    },
  )

  const pageCount = meta?.pageCount ?? 0

  // Delete all pages
  const tx = db.transaction(PAGES_STORE, 'readwrite')
  const store = tx.objectStore(PAGES_STORE)
  for (let page = 1; page <= pageCount; page++) {
    store.delete(`${bookId}-${page}`)
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // Delete metadata
  const metaTx = db.transaction(META_STORE, 'readwrite')
  metaTx.objectStore(META_STORE).delete(bookId)
  await new Promise<void>((resolve, reject) => {
    metaTx.oncomplete = () => resolve()
    metaTx.onerror = () => reject(metaTx.error)
  })

  db.close()
}

// ── Delete all downloads ──

export async function deleteAllDownloads(): Promise<void> {
  const db = await openDB()

  const tx1 = db.transaction(PAGES_STORE, 'readwrite')
  tx1.objectStore(PAGES_STORE).clear()
  await new Promise<void>((resolve, reject) => {
    tx1.oncomplete = () => resolve()
    tx1.onerror = () => reject(tx1.error)
  })

  const tx2 = db.transaction(META_STORE, 'readwrite')
  tx2.objectStore(META_STORE).clear()
  await new Promise<void>((resolve, reject) => {
    tx2.oncomplete = () => resolve()
    tx2.onerror = () => reject(tx2.error)
  })

  db.close()
}

// ── Query downloads ──

export async function getDownloads(): Promise<DownloadMeta[]> {
  const db = await openDB()
  const tx = db.transaction(META_STORE, 'readonly')
  const store = tx.objectStore(META_STORE)

  return new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => {
      db.close()
      resolve(req.result as DownloadMeta[])
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function isBookDownloaded(bookId: string): Promise<boolean> {
  const db = await openDB()
  const tx = db.transaction(META_STORE, 'readonly')
  const store = tx.objectStore(META_STORE)

  return new Promise((resolve, reject) => {
    const req = store.get(bookId)
    req.onsuccess = () => {
      db.close()
      const meta = req.result as DownloadMeta | undefined
      resolve(meta != null && meta.downloadedPages === meta.pageCount)
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function getDownloadedPage(
  bookId: string,
  page: number,
): Promise<string | null> {
  const db = await openDB()
  const tx = db.transaction(PAGES_STORE, 'readonly')
  const store = tx.objectStore(PAGES_STORE)

  return new Promise((resolve, reject) => {
    const req = store.get(`${bookId}-${page}`)
    req.onsuccess = () => {
      db.close()
      const blob = req.result as Blob | undefined
      if (blob) {
        resolve(URL.createObjectURL(blob))
      } else {
        resolve(null)
      }
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function getStorageEstimate(): Promise<{
  usage: number
  quota: number
}> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  }
  return { usage: 0, quota: 0 }
}

// ── Helpers ──

function saveMetadata(db: IDBDatabase, meta: DownloadMeta): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    const store = tx.objectStore(META_STORE)
    store.put(meta)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const val = bytes / Math.pow(k, i)
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
