const ANILIST_URL = 'https://graphql.anilist.co'

export interface AnilistMedia {
  id: number
  title: {
    romaji: string
    english: string | null
    native: string | null
  }
  coverImage: {
    extraLarge: string
    large: string
    medium: string
    color: string | null
  }
  bannerImage: string | null
  description: string | null
  genres: string[]
  status: string | null
  chapters: number | null
  volumes: number | null
  averageScore: number | null
  popularity: number | null
  startDate: { year: number | null; month: number | null; day: number | null }
  endDate: { year: number | null; month: number | null; day: number | null }
  staff: {
    edges: Array<{
      role: string
      node: { name: { full: string } }
    }>
  }
}

const SEARCH_QUERY = `
query SearchManga($search: String!) {
  Page(perPage: 5) {
    media(search: $search, type: MANGA, sort: [POPULARITY_DESC]) {
      id
      title { romaji english native }
      coverImage { extraLarge large medium color }
      bannerImage
      description(asHtml: false)
      genres
      status
      chapters
      volumes
      averageScore
      popularity
      startDate { year month day }
      endDate { year month day }
      staff(sort: RELEVANCE, perPage: 5) {
        edges {
          role
          node { name { full } }
        }
      }
    }
  }
}
`

// ── Name cleaning ──

/** Extract year from folder-name patterns like "(1999)", "[1999]", or "- 1999" */
function extractYear(name: string): number | null {
  const m = name.match(
    /[\(\[]\s*(\d{4})\s*[\)\]]|[-\u2013\u2014]\s*(\d{4})\s*$/,
  )
  if (!m) return null
  const y = parseInt(m[1] || m[2])
  return y >= 1900 && y <= 2100 ? y : null
}

function cleanSeriesName(name: string): string {
  return name
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s*[-\u2013\u2014]\s*\d{4}\s*$/g, '')
    .replace(/digital/gi, '')
    .replace(/colored?(\s+comics?)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip only year patterns for display (keeps other parenthetical content). */
export function displaySeriesName(name: string): string {
  return (
    name
      .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, '')
      .replace(/\s*[-\u2013\u2014]\s*\d{4}\s*$/g, '')
      .trim() || name
  )
}

function cacheKey(name: string): string {
  return cleanSeriesName(name).toLowerCase()
}

// ── IndexedDB persistent cache ──
// Stores AnilistMedia JSON + cover/banner blobs forever (no TTL).
// Data is only removed via syncMetadataCache() when series disappear.

const DB_NAME = 'read-anilist-cache'
const DB_VERSION = 1
const STORE_META = 'metadata' // key = cleaned name, value = { media, coverUrl, bannerUrl, ts }
const STORE_IMAGES = 'images' // key = image URL, value = Blob

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_META))
        db.createObjectStore(STORE_META)
      if (!db.objectStoreNames.contains(STORE_IMAGES))
        db.createObjectStore(STORE_IMAGES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbAllKeys(store: string): Promise<string[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).getAllKeys()
        req.onsuccess = () => resolve(req.result as string[])
        req.onerror = () => reject(req.error)
      }),
  )
}

// ── Image caching helpers ──

/** Download an image and store the blob in IndexedDB. Returns an object URL. */
async function cacheImage(url: string): Promise<string | null> {
  try {
    // Check if already cached
    const existing = await idbGet<Blob>(STORE_IMAGES, url)
    if (existing) return URL.createObjectURL(existing)

    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    await idbPut(STORE_IMAGES, url, blob)
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

/** Get a cached image blob URL, or fall back to the original remote URL. */
async function getCachedImageUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const blob = await idbGet<Blob>(STORE_IMAGES, url)
    if (blob) return URL.createObjectURL(blob)
  } catch {
    /* fall through */
  }
  return url
}

// ── In-memory fast-path ──

interface CachedEntry {
  media: AnilistMedia | null
  coverObjectUrl: string | null
  bannerObjectUrl: string | null
}

const memoryCache = new Map<string, CachedEntry>()

// ── Public API ──

/**
 * Get metadata for a series. Returns from persistent cache instantly if available.
 * Only fetches from Anilist if the series has never been cached.
 */
export async function searchManga(
  seriesName: string,
): Promise<AnilistMedia | null> {
  const key = cacheKey(seriesName)

  // 1. In-memory
  const mem = memoryCache.get(key)
  if (mem) return mem.media

  // 2. IndexedDB (persistent, no TTL)
  try {
    const stored = await idbGet<{
      media: AnilistMedia | null
      coverUrl: string | null
      bannerUrl: string | null
    }>(STORE_META, key)
    if (stored) {
      // Restore blob URLs for images
      const coverObjectUrl = await getCachedImageUrl(stored.coverUrl)
      const bannerObjectUrl = await getCachedImageUrl(stored.bannerUrl)
      memoryCache.set(key, {
        media: stored.media,
        coverObjectUrl,
        bannerObjectUrl,
      })
      return stored.media
    }
  } catch {
    /* continue to fetch */
  }

  // 3. Fetch from Anilist
  return fetchAndCache(seriesName)
}

/** Force-refresh metadata for a single series (clears all caches first). */
export async function refreshManga(
  seriesName: string,
): Promise<AnilistMedia | null> {
  const key = cacheKey(seriesName)
  // Clear old cached images
  try {
    const stored = await idbGet<{
      coverUrl: string | null
      bannerUrl: string | null
    }>(STORE_META, key)
    if (stored?.coverUrl) await idbDelete(STORE_IMAGES, stored.coverUrl)
    if (stored?.bannerUrl) await idbDelete(STORE_IMAGES, stored.bannerUrl)
  } catch {
    /* ignore */
  }
  // Clear old metadata + memory cache
  await idbDelete(STORE_META, key).catch(() => {})
  memoryCache.delete(key)
  // Re-fetch from Anilist
  return fetchAndCache(seriesName)
}

async function fetchAndCache(seriesName: string): Promise<AnilistMedia | null> {
  const key = cacheKey(seriesName)
  const cleaned = cleanSeriesName(seriesName)
  const year = extractYear(seriesName)
  console.log(year, cleaned)
  if (!cleaned) return null

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { search: cleaned },
      }),
    })

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[anilist] Rate limited, skipping', seriesName)
        return null
      }
      return null
    }

    const json = await res.json()
    const candidates: AnilistMedia[] = json?.data?.Page?.media ?? []
    console.log(candidates)
    if (candidates.length === 0) return null

    // Pick best candidate: prefer year match, otherwise take most popular (first)
    let media: AnilistMedia = candidates[0]

    if (year) {
      const yearMatch = candidates.find((c) => c.startDate?.year === year)
      if (yearMatch) media = yearMatch
    }

    // Persist metadata
    const coverUrl =
      media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? null
    const bannerUrl = media?.bannerImage ?? null
    await idbPut(STORE_META, key, {
      media,
      coverUrl,
      bannerUrl,
      ts: Date.now(),
    })

    // Download and cache images
    let coverObjectUrl: string | null = null
    let bannerObjectUrl: string | null = null
    if (coverUrl) coverObjectUrl = await cacheImage(coverUrl)
    if (bannerUrl) bannerObjectUrl = await cacheImage(bannerUrl)

    memoryCache.set(key, { media, coverObjectUrl, bannerObjectUrl })
    return media
  } catch {
    return null
  }
}

/**
 * Sync the metadata cache with the current series list.
 * - Fetches metadata for series not yet cached (with rate-limit-friendly delays).
 * - Removes cached metadata + images for series no longer in the library.
 * Returns the number of new series fetched and stale entries removed.
 */
export async function syncMetadataCache(
  currentSeriesNames: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ fetched: number; removed: number }> {
  const currentKeys = new Set(currentSeriesNames.map(cacheKey))
  const cachedKeys = new Set(await idbAllKeys(STORE_META))

  // Find new series to fetch
  const toFetch = currentSeriesNames.filter(
    (name) => !cachedKeys.has(cacheKey(name)),
  )
  // Find stale entries to remove
  const toRemove = [...cachedKeys].filter((k) => !currentKeys.has(k))

  let fetched = 0

  // Fetch new series with delay to avoid rate limiting
  for (const name of toFetch) {
    await fetchAndCache(name)
    fetched++
    onProgress?.(fetched, toFetch.length)
    // 1.5s delay between requests to respect Anilist rate limits (90 req/min)
    if (fetched < toFetch.length) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  // Remove stale entries
  for (const key of toRemove) {
    // Get the stored metadata to find image URLs to delete
    try {
      const stored = await idbGet<{
        coverUrl: string | null
        bannerUrl: string | null
      }>(STORE_META, key)
      if (stored?.coverUrl) await idbDelete(STORE_IMAGES, stored.coverUrl)
      if (stored?.bannerUrl) await idbDelete(STORE_IMAGES, stored.bannerUrl)
    } catch {
      /* ignore */
    }
    await idbDelete(STORE_META, key)
    memoryCache.delete(key)
  }

  return { fetched, removed: toRemove.length }
}

/**
 * Get the locally-cached cover URL (blob URL if available, otherwise remote).
 * Synchronous fast-path from memory; falls back to IndexedDB lookup.
 */
export function getAnilistCover(media: AnilistMedia | null): string | null {
  if (!media) return null
  // Check memory cache for blob URL
  for (const entry of memoryCache.values()) {
    if (entry.media?.id === media.id && entry.coverObjectUrl)
      return entry.coverObjectUrl
  }
  return media.coverImage?.extraLarge ?? media.coverImage?.large ?? null
}

/**
 * Get the remote (non-blob) cover URL — safe to persist across sessions.
 */
export function getAnilistCoverRemote(
  media: AnilistMedia | null,
): string | null {
  if (!media) return null
  return media.coverImage?.extraLarge ?? media.coverImage?.large ?? null
}

/**
 * Get the locally-cached banner URL (blob URL if available, otherwise remote).
 */
export function getAnilistBanner(media: AnilistMedia | null): string | null {
  if (!media) return null
  for (const entry of memoryCache.values()) {
    if (entry.media?.id === media.id && entry.bannerObjectUrl)
      return entry.bannerObjectUrl
  }
  return media.bannerImage ?? null
}

export function formatStatus(status: string | null): string {
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

export function getAuthor(media: AnilistMedia | null): string | null {
  if (!media?.staff?.edges) return null
  const story = media.staff.edges.find(
    (e) =>
      e.role.toLowerCase().includes('story') ||
      e.role.toLowerCase().includes('original'),
  )
  return (
    story?.node?.name?.full ?? media.staff.edges[0]?.node?.name?.full ?? null
  )
}
