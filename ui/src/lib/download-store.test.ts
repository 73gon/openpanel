import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = val
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock fetch and indexedDB before importing
globalThis.fetch = vi.fn()
globalThis.indexedDB = {
  open: () => {
    const req = {
      result: null,
      onupgradeneeded: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    }
    setTimeout(() => req.onerror?.(), 0)
    return req
  },
} as unknown as IDBFactory

// Create a fake IDB transaction mock
const fakeObjectStore = () => ({
  count: (_key: string) => {
    const req = {
      result: 0,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    }
    setTimeout(() => req.onsuccess?.(), 0)
    return req
  },
  put: () => {
    const req = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    }
    setTimeout(() => req.onsuccess?.(), 0)
    return req
  },
  get: () => {
    const req = {
      result: null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    }
    setTimeout(() => req.onsuccess?.(), 0)
    return req
  },
})
const fakeDB = {
  transaction: () => ({
    objectStore: fakeObjectStore,
    oncomplete: null,
    onerror: null,
  }),
  close: vi.fn(),
}

// Mock the downloads module to prevent IndexedDB usage
vi.mock('./downloads', () => ({
  openDB: vi.fn().mockResolvedValue(fakeDB),
  saveMetadata: vi.fn().mockResolvedValue(undefined),
  downloadCover: vi.fn().mockResolvedValue(undefined),
  downloadBook: vi.fn().mockResolvedValue(undefined),
  getDownloads: vi.fn().mockResolvedValue([]),
  getDownloadMeta: vi.fn().mockResolvedValue(null),
  deleteDownload: vi.fn().mockResolvedValue(undefined),
  deleteAllDownloads: vi.fn().mockResolvedValue(undefined),
  isBookDownloaded: vi.fn().mockResolvedValue(false),
  getDownloadedPage: vi.fn().mockResolvedValue(null),
  getStorageEstimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
  formatBytes: vi.fn().mockReturnValue('0 B'),
  getDownloadsBySeries: vi.fn().mockResolvedValue([]),
  getDownloadedCover: vi.fn().mockResolvedValue(null),
  getDownloadedPageUrl: vi.fn().mockResolvedValue(null),
  deleteSeriesDownloads: vi.fn().mockResolvedValue(undefined),
}))

// Mock api to prevent real calls
vi.mock('./api', () => ({
  addAdminLog: vi.fn().mockResolvedValue(undefined),
}))

const { useDownloadStore } = await import('./download-store')

describe('useDownloadStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    useDownloadStore.setState({
      queue: [],
      statuses: {},
      processing: false,
    })
  })

  it('starts with empty queue', () => {
    const s = useDownloadStore.getState()
    expect(s.queue).toEqual([])
    expect(s.processing).toBe(false)
  })

  it('addToQueue adds items and creates status entries', () => {
    useDownloadStore.getState().addToQueue([
      {
        bookId: 'b1',
        title: 'Book 1',
        seriesId: 's1',
        seriesName: 'Series',
        pageCount: 20,
      },
      {
        bookId: 'b2',
        title: 'Book 2',
        seriesId: 's1',
        seriesName: 'Series',
        pageCount: 30,
      },
    ])
    const s = useDownloadStore.getState()
    expect(s.queue).toHaveLength(2)
    expect(s.queue[0].bookId).toBe('b1')
    expect(s.statuses['b1']).toBeDefined()
    expect(s.statuses['b1'].status).toBe('queued')
    expect(s.statuses['b1'].totalPages).toBe(20)
  })

  it('addToQueue skips duplicates', () => {
    useDownloadStore
      .getState()
      .addToQueue([
        {
          bookId: 'b1',
          title: 'Book 1',
          seriesId: 's1',
          seriesName: 'S',
          pageCount: 10,
        },
      ])
    useDownloadStore
      .getState()
      .addToQueue([
        {
          bookId: 'b1',
          title: 'Book 1',
          seriesId: 's1',
          seriesName: 'S',
          pageCount: 10,
        },
      ])
    expect(useDownloadStore.getState().queue).toHaveLength(1)
  })

  it('removeFromQueue removes item', () => {
    useDownloadStore.getState().addToQueue([
      {
        bookId: 'b1',
        title: 'Book 1',
        seriesId: 's1',
        seriesName: 'S',
        pageCount: 10,
      },
      {
        bookId: 'b2',
        title: 'Book 2',
        seriesId: 's1',
        seriesName: 'S',
        pageCount: 10,
      },
    ])
    useDownloadStore.getState().removeFromQueue('b1')
    const s = useDownloadStore.getState()
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0].bookId).toBe('b2')
  })

  it('clearQueue empties everything', () => {
    useDownloadStore
      .getState()
      .addToQueue([
        {
          bookId: 'b1',
          title: 'Book 1',
          seriesId: 's1',
          seriesName: 'S',
          pageCount: 10,
        },
      ])
    useDownloadStore.getState().clearQueue()
    const s = useDownloadStore.getState()
    expect(s.queue).toHaveLength(0)
    expect(Object.keys(s.statuses)).toHaveLength(0)
  })

  it('_setStatus updates partial status', () => {
    useDownloadStore
      .getState()
      .addToQueue([
        {
          bookId: 'b1',
          title: 'Book 1',
          seriesId: 's1',
          seriesName: 'S',
          pageCount: 20,
        },
      ])
    useDownloadStore
      .getState()
      ._setStatus('b1', { status: 'downloading', downloadedPages: 5 })
    const st = useDownloadStore.getState().statuses['b1']
    expect(st.status).toBe('downloading')
    expect(st.downloadedPages).toBe(5)
    expect(st.totalPages).toBe(20)
  })
})
