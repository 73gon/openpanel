import { fetchEpubListing, getEpubFileUrl } from './api'
import type { BookSource } from './epub'

/**
 * A light novel read from the server one file at a time: its text when the book opens, each
 * picture only when the reader nears it. The files carry the book's version, so the browser keeps
 * them, and a book opened again comes from the cache.
 */
export async function remoteSource(bookId: string): Promise<BookSource> {
  const listing = await fetchEpubListing(bookId)
  const entries = new Map(listing.entries.map((e) => [e.path, e]))
  const url = (path: string) => getEpubFileUrl(bookId, path, listing.version)

  return {
    has: (path) => entries.has(path),
    text: async (path) => {
      const res = await fetch(url(path))
      if (!res.ok) throw new Error(`${path} couldn’t be loaded`)
      return res.text()
    },
    url: async (path) => (entries.has(path) ? url(path) : null),
    size: (path) => {
      const entry = entries.get(path)
      return entry?.width && entry.height
        ? { width: entry.width, height: entry.height }
        : null
    },
  }
}
