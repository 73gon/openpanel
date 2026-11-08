import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openEpub, resolvePath, textLength } from './epub'

/** A ZIP of the given files: stored, except the ones named in `deflate`. */
async function makeZip(
  files: Record<string, string>,
  deflate: string[] = [],
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const raw = enc.encode(text)
    const method = deflate.includes(name) ? 8 : 0
    const data =
      method === 8
        ? new Uint8Array(
            await new Response(
              new Response(raw).body!.pipeThrough(
                new CompressionStream('deflate-raw'),
              ),
            ).arrayBuffer(),
          )
        : raw
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const dirSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, dirSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + dirSize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles>
</container>`

const opf = (nav: boolean) => `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Bookworm 1</dc:title></metadata>
  <manifest>
    ${nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="Text/one%20a.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/two.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="Images/pic.png" media-type="image/png"/>
    <item id="css" href="Styles/book.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx" page-progression-direction="ltr">
    <itemref idref="c1"/><itemref idref="c2"/>${nav ? '<itemref idref="nav" linear="no"/>' : ''}
  </spine>
</package>`

const chapterOne = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>One</title><link rel="stylesheet" href="../Styles/book.css"/><script>alert(1)</script></head>
<body class="chapter" onload="alert(2)">
  <h1 id="start">Chapter One</h1>
  <p onclick="steal()">Hello <a href="two.xhtml#middle">onwards</a> and <a href="https://example.com">out</a>.</p>
  <img src="../Images/pic.png" alt="A picture"/>
  <div/>
  <p>After the empty div.</p>
  <iframe src="https://example.com"></iframe>
</body></html>`

const chapterTwo = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="middle">Two &amp; more</p></body></html>`

const nav = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol>
  <li><a href="Text/one%20a.xhtml">Chapter One</a>
    <ol><li><a href="Text/two.xhtml#middle">The middle</a></li></ol></li>
  <li><a href="Text/two.xhtml">Chapter Two</a></li>
</ol></nav></body></html>`

const ncx = `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
  <navPoint><navLabel><text>From the NCX</text></navLabel><content src="Text/two.xhtml"/></navPoint>
</navMap></ncx>`

async function book(withNav = true) {
  return openEpub(
    await makeZip(
      {
        mimetype: 'application/epub+zip',
        'META-INF/container.xml': container,
        'OEBPS/content.opf': opf(withNav),
        'OEBPS/nav.xhtml': nav,
        'OEBPS/toc.ncx': ncx,
        'OEBPS/Text/one a.xhtml': chapterOne,
        'OEBPS/Text/two.xhtml': chapterTwo,
        'OEBPS/Images/pic.png': 'png bytes',
        'OEBPS/Styles/book.css': 'body { background: url(../Images/pic.png) }',
      },
      ['OEBPS/Text/one a.xhtml', 'OEBPS/content.opf'],
    ),
  )
}

describe('openEpub', () => {
  let made = 0
  beforeEach(() => {
    made = 0
    URL.createObjectURL = vi.fn(() => `blob:test/${++made}`)
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('reads the chapters in reading order, and how long each is', async () => {
    const epub = await book()
    expect(epub.title).toBe('Bookworm 1')
    expect(epub.rtl).toBe(false)
    expect(epub.chapters.map((c) => c.path)).toEqual([
      'OEBPS/Text/one a.xhtml',
      'OEBPS/Text/two.xhtml',
    ])
    expect(epub.chapters[1].chars).toBe('Two & more'.length)
    expect(epub.totalChars).toBe(
      epub.chapters[0].chars + epub.chapters[1].chars,
    )
  })

  it('reads the contents from the nav document, nested, else from the NCX', async () => {
    expect((await book()).toc).toEqual([
      { label: 'Chapter One', chapter: 0, fragment: '', depth: 0 },
      { label: 'The middle', chapter: 1, fragment: 'middle', depth: 1 },
      { label: 'Chapter Two', chapter: 1, fragment: '', depth: 0 },
    ])
    expect((await book(false)).toc).toEqual([
      { label: 'From the NCX', chapter: 1, fragment: '', depth: 0 },
    ])
  })

  it('makes the whole book one safe document, with its images and styles', async () => {
    const epub = await book()
    const html = await epub.bookDocument()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    expect(doc.querySelector('script, iframe, link')).toBeNull()
    expect(html).not.toMatch(/onload|onclick|alert|steal/)
    expect(doc.documentElement.lang).toBe('en')
    // Every chapter in order, each in a section that keeps its body's classes
    const sections = doc.querySelectorAll('section.op-chapter')
    expect([...sections].map((s) => s.getAttribute('data-chapter'))).toEqual([
      '0',
      '1',
    ])
    expect(sections[0].classList.contains('chapter')).toBe(true)
    expect(sections[1].querySelector('#middle')?.textContent).toBe('Two & more')
    // An empty XHTML element stays empty: what follows isn't swallowed into it
    expect(sections[0].querySelector('div')?.childNodes.length).toBe(0)
    expect(sections[0].querySelectorAll(':scope > p')).toHaveLength(2)

    // A picture waits to load until the reader nears it
    const img = doc.querySelector('img')
    expect(img?.hasAttribute('src')).toBe(false)
    expect(img?.getAttribute('data-op-src')).toMatch(/^blob:test\//)
    // The stylesheet is inline, once, its picture from the book
    const styles = doc.querySelectorAll('style')
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toMatch(/url\("blob:test\//)
    const links = doc.querySelectorAll('a')
    expect(links[0].getAttribute('data-href')).toBe('two.xhtml#middle')
    expect(links[1].hasAttribute('data-external')).toBe(true)

    epub.close()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('keeps a picture’s room when its size is known, and loads nothing from outside', async () => {
    const files: Record<string, string> = {
      'META-INF/container.xml': container,
      'OEBPS/content.opf': opf(false),
      'OEBPS/toc.ncx': ncx,
      'OEBPS/Text/one a.xhtml':
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="../Images/pic.png"/><img src="https://tracker.example/x.png"/></body></html>',
      'OEBPS/Text/two.xhtml': chapterTwo,
    }
    const epub = await openEpub({
      has: (path) => path in files || path === 'OEBPS/Images/pic.png',
      text: async (path) => files[path],
      url: async (path) => `/api/books/b/epub/${path}`,
      size: (path) =>
        path === 'OEBPS/Images/pic.png' ? { width: 800, height: 1200 } : null,
    })
    const doc = new DOMParser().parseFromString(
      await epub.bookDocument(),
      'text/html',
    )
    const [pic, outside] = doc.querySelectorAll('img')
    expect(pic.getAttribute('data-op-src')).toBe(
      '/api/books/b/epub/OEBPS/Images/pic.png',
    )
    expect([pic.getAttribute('width'), pic.getAttribute('height')]).toEqual([
      '800',
      '1200',
    ])
    expect(outside.hasAttribute('src')).toBe(false)
    expect(outside.hasAttribute('data-op-src')).toBe(false)
  })

  it('follows a link to the chapter and the place in it', async () => {
    const epub = await book()
    expect(epub.resolveLink(0, 'two.xhtml#middle')).toEqual({
      chapter: 1,
      fragment: 'middle',
    })
    expect(epub.resolveLink(1, '#middle')).toEqual({
      chapter: 1,
      fragment: 'middle',
    })
    expect(epub.resolveLink(0, 'https://example.com')).toBeNull()
    expect(epub.resolveLink(0, 'missing.xhtml')).toBeNull()
  })

  it('refuses a file that isn’t an EPUB', async () => {
    await expect(
      openEpub(new TextEncoder().encode('not a zip')),
    ).rejects.toThrow()
  })
})

describe('resolvePath', () => {
  it('resolves from the file’s folder and decodes the path', () => {
    expect(resolvePath('OEBPS/Text/a.xhtml', '../Images/b%20c.png#x')).toEqual({
      path: 'OEBPS/Images/b c.png',
      fragment: 'x',
    })
    expect(resolvePath('a.xhtml', 'b.xhtml')).toEqual({
      path: 'b.xhtml',
      fragment: '',
    })
  })
})

describe('textLength', () => {
  it('counts the text, not the markup', () => {
    expect(
      textLength(
        '<html><head><title>T</title></head><body><style>p{}</style><p>Hi &amp;   you</p></body></html>',
      ),
    ).toBe('Hi & you'.length)
  })
})
