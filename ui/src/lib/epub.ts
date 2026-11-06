/**
 * An EPUB, opened in the browser: its chapters in reading order, its table of contents, and
 * each chapter as a page of its own for the reader's frame. Scripts, frames and handlers are
 * left out, and the book's images, styles and fonts come from blob URLs, so nothing in a
 * chapter reaches past the book.
 */
import { ZipFile } from './zip'

/** About the characters of text on a printed page; the server counts a book's pages with it. */
export const CHARS_PER_PAGE = 1500

export interface EpubChapter {
  /** The chapter's path in the archive. */
  path: string
  /** Its length in characters of text, which weighs it in the book's progress. */
  chars: number
}

export interface EpubTocEntry {
  label: string
  /** The chapter it opens, by index, or -1 when it points outside the reading order. */
  chapter: number
  /** The element it points at in that chapter, if any. */
  fragment: string
  depth: number
}

export interface Epub {
  title: string | null
  chapters: EpubChapter[]
  toc: EpubTocEntry[]
  totalChars: number
  /** The book turns its pages right to left. */
  rtl: boolean
  /** A chapter as a whole HTML document, for an iframe's srcdoc. */
  chapterDocument: (index: number) => Promise<string>
  /** Where a link in a chapter goes: the chapter and the fragment. */
  resolveLink: (
    fromChapter: number,
    href: string,
  ) => { chapter: number; fragment: string } | null
  /** Lets go of the blob URLs the book's chapters use. */
  close: () => void
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  css: 'text/css',
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

const OPS_NS = 'http://www.idpf.org/2007/ops'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export async function openEpub(data: ArrayBuffer | Uint8Array): Promise<Epub> {
  const zip = new ZipFile(
    data instanceof Uint8Array ? data : new Uint8Array(data),
  )

  const container = parseXml(await zip.text('META-INF/container.xml'))
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('The book doesn’t say where its contents are')
  const opf = parseXml(await zip.text(opfPath))

  const items = new Map<
    string,
    { path: string; type: string; properties: string }
  >()
  for (const item of byTag(opf, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    items.set(id, {
      path: resolvePath(opfPath, href).path,
      type: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spine = byTag(opf, 'spine')[0]
  const paths = byTag(opf, 'itemref')
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .map((ref) => items.get(ref.getAttribute('idref') ?? '')?.path)
    .filter((path): path is string => !!path && zip.has(path))
  if (paths.length === 0) throw new Error('The book has no chapters')

  const chapters: EpubChapter[] = await Promise.all(
    paths.map(async (path) => ({
      path,
      chars: textLength(await zip.text(path)),
    })),
  )
  const chapterIndex = new Map(chapters.map((c, i) => [c.path, i]))

  // The table of contents: EPUB 3's nav document, else EPUB 2's NCX
  let toc: EpubTocEntry[] = []
  const nav = [...items.values()].find((item) =>
    item.properties.split(/\s+/).includes('nav'),
  )
  const ncx =
    items.get(spine?.getAttribute('toc') ?? '') ??
    [...items.values()].find((item) => item.type === 'application/x-dtbncx+xml')
  try {
    if (nav && zip.has(nav.path)) {
      toc = readNav(
        parseXhtml(await zip.text(nav.path)),
        nav.path,
        chapterIndex,
      )
    }
    if (toc.length === 0 && ncx && zip.has(ncx.path)) {
      toc = readNcx(parseXml(await zip.text(ncx.path)), ncx.path, chapterIndex)
    }
  } catch {
    // A book without a readable table of contents still reads
  }

  const blobs = new Map<string, Promise<string | null>>()
  const made = new Set<string>()
  let closed = false
  const blobUrl = (path: string): Promise<string | null> => {
    let url = blobs.get(path)
    if (!url) {
      url = zip.has(path)
        ? zip.bytes(path).then(async (bytes) => {
            const type = MIME[extension(path)] ?? ''
            const body =
              type === 'text/css'
                ? await rewriteCss(
                    new TextDecoder().decode(bytes),
                    path,
                    blobUrl,
                  )
                : bytes
            const url = URL.createObjectURL(
              new Blob([body as BlobPart], { type }),
            )
            // One made after the book closed is let go at once
            if (closed) URL.revokeObjectURL(url)
            else made.add(url)
            return url
          })
        : Promise.resolve(null)
      blobs.set(path, url)
    }
    return url
  }

  const title = byTag(opf, 'title')[0]?.textContent?.trim() || null

  return {
    title,
    chapters,
    toc,
    totalChars: chapters.reduce((sum, c) => sum + c.chars, 0),
    rtl: spine?.getAttribute('page-progression-direction') === 'rtl',
    chapterDocument: async (index) => {
      const path = chapters[index].path
      return chapterDocument(parseXhtml(await zip.text(path)), path, blobUrl)
    },
    resolveLink: (fromChapter, href) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
      const { path, fragment } = href.startsWith('#')
        ? { path: chapters[fromChapter].path, fragment: href.slice(1) }
        : resolvePath(chapters[fromChapter].path, href)
      const chapter = chapterIndex.get(path)
      return chapter === undefined ? null : { chapter, fragment }
    },
    close: () => {
      closed = true
      for (const url of made) URL.revokeObjectURL(url)
      made.clear()
      blobs.clear()
    },
  }
}

/** A chapter, rebuilt as an HTML document with only what's safe to show. */
async function chapterDocument(
  source: Document,
  path: string,
  blobUrl: (path: string) => Promise<string | null>,
): Promise<string> {
  const out = document.implementation.createHTMLDocument('')
  const lang =
    source.documentElement.getAttribute('lang') ??
    source.documentElement.getAttribute('xml:lang')
  if (lang) out.documentElement.lang = lang
  const dir = source.documentElement.getAttribute('dir')
  if (dir) out.documentElement.dir = dir

  // The book's own styles, inline, their images and fonts from the book
  const head = source.head ?? source.getElementsByTagName('head')[0]
  for (const el of Array.from(head?.querySelectorAll('link, style') ?? [])) {
    let css: string | null = null
    if (el.localName === 'style') {
      css = await rewriteCss(el.textContent ?? '', path, blobUrl)
    } else if (/\bstylesheet\b/i.test(el.getAttribute('rel') ?? '')) {
      const href = el.getAttribute('href')
      const url = href ? await blobUrl(resolvePath(path, href).path) : null
      if (url) {
        const link = out.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        out.head.append(link)
      }
    }
    if (css) {
      const style = out.createElement('style')
      style.textContent = css
      out.head.append(style)
    }
  }

  const body = source.body ?? source.getElementsByTagName('body')[0]
  if (body) {
    for (const attr of Array.from(body.attributes)) {
      if (!attr.name.toLowerCase().startsWith('on')) {
        out.body.setAttribute(attr.name, attr.value)
      }
    }
    for (const node of Array.from(body.childNodes)) {
      out.body.append(out.importNode(node, true))
    }
  }

  for (const el of Array.from(
    out.body.querySelectorAll(
      'script, iframe, frame, frameset, object, embed, form, base, meta, link, style',
    ),
  )) {
    if (el.localName === 'style') {
      el.textContent = await rewriteCss(el.textContent ?? '', path, blobUrl)
    } else {
      el.remove()
    }
  }

  const pending: Promise<void>[] = []
  for (const el of Array.from(out.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    const local = el.localName.toLowerCase()
    const resource = (attr: string, ns?: string) => {
      const value = ns ? el.getAttributeNS(ns, 'href') : el.getAttribute(attr)
      if (!value || /^(data|blob|https?):/i.test(value)) return
      pending.push(
        blobUrl(resolvePath(path, value).path).then((url) => {
          if (!url) return
          if (ns) el.setAttributeNS(ns, 'xlink:href', url)
          else el.setAttribute(attr, url)
        }),
      )
    }
    if (
      local === 'img' ||
      local === 'source' ||
      local === 'audio' ||
      local === 'video'
    ) {
      resource('src')
      el.removeAttribute('srcset')
    }
    if (local === 'video') resource('poster')
    if (local === 'image' || local === 'use') {
      if (el.hasAttributeNS(XLINK_NS, 'href')) resource('href', XLINK_NS)
      else resource('href')
    }
    if (local === 'a' && el.hasAttribute('href')) {
      const href = el.getAttribute('href')!
      // The reader follows links itself; one out of the book opens in a new tab
      if (/^https?:/i.test(href)) el.setAttribute('data-external', '')
      else el.setAttribute('data-href', href)
    }
  }
  await Promise.all(pending)

  return `<!DOCTYPE html>${out.documentElement.outerHTML}`
}

/** CSS with each url() into the book replaced by the resource's blob URL. */
async function rewriteCss(
  css: string,
  path: string,
  blobUrl: (path: string) => Promise<string | null>,
): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
  const refs = new Set<string>()
  for (const [, , href] of css.matchAll(pattern)) {
    if (!/^(data|blob|https?):/i.test(href) && !href.startsWith('#'))
      refs.add(href)
  }
  const urls = new Map<string, string | null>()
  await Promise.all(
    [...refs].map(async (href) =>
      urls.set(href, await blobUrl(resolvePath(path, href).path)),
    ),
  )
  return css.replace(pattern, (whole, _q, href: string) => {
    const url = urls.get(href)
    return url ? `url("${url}")` : whole
  })
}

function readNav(
  doc: Document,
  navPath: string,
  chapters: Map<string, number>,
): EpubTocEntry[] {
  const navs = Array.from(doc.getElementsByTagName('nav'))
  const toc =
    navs.find(
      (nav) =>
        (nav.getAttributeNS(OPS_NS, 'type') ??
          nav.getAttribute('epub:type')) === 'toc',
    ) ?? navs[0]
  const list = toc ? childByTag(toc, 'ol') : null
  const entries: EpubTocEntry[] = []
  const walk = (ol: Element, depth: number) => {
    for (const li of Array.from(ol.children)) {
      if (li.localName !== 'li') continue
      const link = childByTag(li, 'a') ?? childByTag(li, 'span')
      const label = link?.textContent?.replace(/\s+/g, ' ').trim()
      const href = link?.getAttribute('href')
      if (label) entries.push(entry(label, href, navPath, chapters, depth))
      const sub = childByTag(li, 'ol')
      if (sub) walk(sub, depth + 1)
    }
  }
  if (list) walk(list, 0)
  return entries
}

function readNcx(
  doc: Document,
  ncxPath: string,
  chapters: Map<string, number>,
): EpubTocEntry[] {
  const entries: EpubTocEntry[] = []
  const walk = (parent: Element, depth: number) => {
    for (const point of Array.from(parent.children)) {
      if (point.localName !== 'navPoint') continue
      const label = byTag(point, 'text')[0]
        ?.textContent?.replace(/\s+/g, ' ')
        .trim()
      const href = byTag(point, 'content')[0]?.getAttribute('src')
      if (label) entries.push(entry(label, href, ncxPath, chapters, depth))
      walk(point, depth + 1)
    }
  }
  const map = byTag(doc, 'navMap')[0]
  if (map) walk(map, 0)
  return entries
}

function entry(
  label: string,
  href: string | null | undefined,
  from: string,
  chapters: Map<string, number>,
  depth: number,
): EpubTocEntry {
  const { path, fragment } = href
    ? resolvePath(from, href)
    : { path: '', fragment: '' }
  return { label, chapter: chapters.get(path) ?? -1, fragment, depth }
}

/** An href relative to a file in the archive, as a path in the archive and a fragment. */
export function resolvePath(
  from: string,
  href: string,
): { path: string; fragment: string } {
  const [target, ...rest] = href.split('#')
  const parts = from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  let path = parts.join('/')
  try {
    path = decodeURIComponent(path)
  } catch {
    // Not percent-encoded after all
  }
  return { path, fragment: rest.join('#') }
}

/** The characters of text in a chapter, counted as the server counts them. */
export function textLength(html: string): number {
  const at = html.search(/<body[\s>]/i)
  return (at >= 0 ? html.slice(at) : html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;\s]{1,9};/g, '&')
    .replace(/\s+/g, ' ')
    .trim().length
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

/** A chapter as XHTML, as the format says it is, or as HTML when it isn't well-formed. */
function parseXhtml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  return doc.getElementsByTagName('parsererror').length > 0
    ? new DOMParser().parseFromString(text, 'text/html')
    : doc
}

function byTag(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name))
}

function childByTag(parent: Element, name: string): Element | null {
  return Array.from(parent.children).find((c) => c.localName === name) ?? null
}

function extension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}
