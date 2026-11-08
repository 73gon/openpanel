/**
 * An EPUB, opened in the browser: its chapters in reading order, its table of contents, and the
 * whole book as one HTML document for the reader's frame. Scripts, frames and handlers are left
 * out, and the book's images, styles and fonts come from the book itself (the server's copy, or
 * blob URLs of a downloaded one), so nothing in a chapter reaches past the book.
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

/** Where a book's files come from: the server, one at a time, or a downloaded copy. */
export interface BookSource {
  has: (path: string) => boolean
  text: (path: string) => Promise<string>
  /** An address the reader's frame can load the file from: a picture, a font. */
  url: (path: string) => Promise<string | null>
  /** A picture's size, when it's known before the picture loads. */
  size?: (path: string) => { width: number; height: number } | null
  close?: () => void
}

export interface Epub {
  title: string | null
  chapters: EpubChapter[]
  toc: EpubTocEntry[]
  totalChars: number
  /** The book turns its pages right to left. */
  rtl: boolean
  /**
   * The whole book as one HTML document, for an iframe's srcdoc: each chapter a
   * `<section class="op-chapter" data-chapter="i">`, in reading order.
   */
  bookDocument: () => Promise<string>
  /** Where a link in a chapter goes: the chapter and the fragment. */
  resolveLink: (
    fromChapter: number,
    href: string,
  ) => { chapter: number; fragment: string } | null
  /** Lets go of what the book holds (a downloaded copy's blob URLs). */
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

/** A downloaded book's files, from its bytes: pictures and fonts as blob URLs. */
export function zipSource(data: ArrayBuffer | Uint8Array): BookSource {
  const zip = new ZipFile(
    data instanceof Uint8Array ? data : new Uint8Array(data),
  )
  const blobs = new Map<string, Promise<string | null>>()
  const made = new Set<string>()
  let closed = false
  return {
    has: (path) => zip.has(path),
    text: (path) => zip.text(path),
    url: (path) => {
      let url = blobs.get(path)
      if (!url) {
        url = zip.has(path)
          ? zip.bytes(path).then((bytes) => {
              const url = URL.createObjectURL(
                new Blob([bytes as BlobPart], {
                  type: MIME[extension(path)] ?? '',
                }),
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
    },
    close: () => {
      closed = true
      for (const url of made) URL.revokeObjectURL(url)
      made.clear()
      blobs.clear()
    },
  }
}

export async function openEpub(
  input: BookSource | ArrayBuffer | Uint8Array,
): Promise<Epub> {
  const source =
    input instanceof ArrayBuffer || input instanceof Uint8Array
      ? zipSource(input)
      : input
  // Each file is read once: the chapters are counted on opening and laid out after
  const texts = new Map<string, Promise<string>>()
  const text = (path: string) => {
    let t = texts.get(path)
    if (!t) {
      t = source.text(path)
      texts.set(path, t)
    }
    return t
  }

  const container = parseXml(await text('META-INF/container.xml'))
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('The book doesn’t say where its contents are')
  const opf = parseXml(await text(opfPath))

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
    .filter((path): path is string => !!path && source.has(path))
  if (paths.length === 0) throw new Error('The book has no chapters')

  const chapters: EpubChapter[] = await Promise.all(
    paths.map(async (path) => ({
      path,
      chars: textLength(await text(path)),
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
    if (nav && source.has(nav.path)) {
      toc = readNav(parseXhtml(await text(nav.path)), nav.path, chapterIndex)
    }
    if (toc.length === 0 && ncx && source.has(ncx.path)) {
      toc = readNcx(parseXml(await text(ncx.path)), ncx.path, chapterIndex)
    }
  } catch {
    // A book without a readable table of contents still reads
  }

  const title = byTag(opf, 'title')[0]?.textContent?.trim() || null

  return {
    title,
    chapters,
    toc,
    totalChars: chapters.reduce((sum, c) => sum + c.chars, 0),
    rtl: spine?.getAttribute('page-progression-direction') === 'rtl',
    bookDocument: async () =>
      bookDocument(
        await Promise.all(
          chapters.map(async (c) => ({
            path: c.path,
            doc: parseXhtml(await text(c.path)),
          })),
        ),
        source,
        text,
      ),
    resolveLink: (fromChapter, href) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
      const { path, fragment } = href.startsWith('#')
        ? { path: chapters[fromChapter].path, fragment: href.slice(1) }
        : resolvePath(chapters[fromChapter].path, href)
      const chapter = chapterIndex.get(path)
      return chapter === undefined ? null : { chapter, fragment }
    },
    close: () => {
      texts.clear()
      source.close?.()
    },
  }
}

/**
 * Where a picture's address waits until the reader nears it: `src` for an `<img>`, the
 * (xlink:)href for an SVG `<image>`.
 */
export const LATER = 'data-op-src'

/** Elements a book never brings into the reader. */
const UNSAFE =
  'script, iframe, frame, frameset, object, embed, form, base, meta, link, noscript'

/**
 * The book, rebuilt as one HTML document with only what's safe to show: the books' styles once
 * each, then every chapter in a section of its own.
 */
async function bookDocument(
  chapters: { path: string; doc: Document }[],
  source: BookSource,
  text: (path: string) => Promise<string>,
): Promise<string> {
  const out = document.implementation.createHTMLDocument('')
  const first = chapters[0]?.doc.documentElement
  const lang = first?.getAttribute('lang') ?? first?.getAttribute('xml:lang')
  if (lang) out.documentElement.lang = lang
  const dir = first?.getAttribute('dir')
  if (dir) out.documentElement.dir = dir

  // The book's own styles, inline and each once, their images and fonts from the book
  const sheets = new Set<string>()
  const styles: Promise<string>[] = []
  for (const { path, doc } of chapters) {
    const head = doc.head ?? doc.getElementsByTagName('head')[0]
    for (const el of Array.from(head?.querySelectorAll('link, style') ?? [])) {
      if (el.localName === 'style') {
        const css = el.textContent ?? ''
        if (sheets.has(css)) continue
        sheets.add(css)
        styles.push(rewriteCss(css, path, source))
      } else if (/\bstylesheet\b/i.test(el.getAttribute('rel') ?? '')) {
        const href = el.getAttribute('href')
        if (!href) continue
        const sheet = resolvePath(path, href).path
        if (sheets.has(sheet) || !source.has(sheet)) continue
        sheets.add(sheet)
        styles.push(
          text(sheet)
            .then((css) => rewriteCss(css, sheet, source))
            .catch(() => ''),
        )
      }
    }
  }
  for (const css of await Promise.all(styles)) {
    if (!css) continue
    const style = out.createElement('style')
    style.textContent = css
    out.head.append(style)
  }

  const pending: Promise<void>[] = []
  chapters.forEach(({ path, doc }, index) => {
    const section = out.createElement('section')
    section.className = 'op-chapter'
    section.dataset.chapter = String(index)
    const body = doc.body ?? doc.getElementsByTagName('body')[0]
    if (body) {
      // The chapter's own body classes stay with it, as the book's styles may ask for them
      const own = body.getAttribute('class')
      if (own) section.className += ` ${own}`
      for (const node of Array.from(body.childNodes)) {
        section.append(out.importNode(node, true))
      }
    }
    out.body.append(section)

    for (const el of Array.from(section.querySelectorAll(UNSAFE))) el.remove()
    for (const el of Array.from(section.querySelectorAll('style'))) {
      pending.push(
        rewriteCss(el.textContent ?? '', path, source).then((css) => {
          el.textContent = css
        }),
      )
    }

    for (const el of Array.from(section.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name)
        }
      }
      const local = el.localName.toLowerCase()
      const resource = (attr: string, ns?: string) => {
        const value = ns ? el.getAttributeNS(ns, 'href') : el.getAttribute(attr)
        if (!value || /^(data|blob):/i.test(value)) return
        // Nothing outside the book loads, not even a picture
        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
          el.removeAttribute(attr)
          return
        }
        const target = resolvePath(path, value).path
        if (local === 'img') {
          // Its room is kept before it loads, so the text around it doesn't move
          const size = source.size?.(target)
          if (size && !el.hasAttribute('width') && !el.hasAttribute('height')) {
            el.setAttribute('width', String(size.width))
            el.setAttribute('height', String(size.height))
          }
        }
        // A picture's address waits aside until the reader nears it (the frame runs no scripts,
        // so the browser's own lazy loading is off); the view puts it in place
        const picture = local === 'img' || local === 'image'
        if (picture) el.removeAttribute(attr)
        if (picture && ns) el.removeAttributeNS(ns, 'href')
        pending.push(
          source.url(target).then((url) => {
            if (!url) return
            if (picture) el.setAttribute(LATER, url)
            else if (ns) el.setAttributeNS(ns, 'xlink:href', url)
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
      if (local === 'img') el.setAttribute('decoding', 'async')
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
  })
  await Promise.all(pending)

  return `<!DOCTYPE html>${out.documentElement.outerHTML}`
}

/** CSS with each url() into the book replaced by the file's address; one out of the book is dropped. */
async function rewriteCss(
  css: string,
  path: string,
  source: BookSource,
): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
  const refs = new Set<string>()
  for (const [, , href] of css.matchAll(pattern)) {
    if (!/^(data|blob):/i.test(href) && !href.startsWith('#')) refs.add(href)
  }
  const urls = new Map<string, string | null>()
  await Promise.all(
    [...refs].map(async (href) =>
      urls.set(
        href,
        /^[a-z][a-z0-9+.-]*:/i.test(href)
          ? null
          : await source.url(resolvePath(path, href).path),
      ),
    ),
  )
  return (
    css
      .replace(pattern, (whole, _q, href: string) => {
        if (!urls.has(href)) return whole
        const url = urls.get(href)
        return url ? `url("${url}")` : 'none'
      })
      // An @import would fetch past the book
      .replace(/@import[^;]*;/gi, '')
  )
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
