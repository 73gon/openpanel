/**
 * One chapter of a novel, set in an iframe: as pages side by side (CSS columns, turned by
 * scrolling the frame sideways) or as one long page the reader scrolls. The frame is sandboxed
 * without scripts; the app reaches into it (same origin) to set the type and to hear taps,
 * swipes, keys and links.
 */

export interface TextLayout {
  mode: 'paged' | 'scroll'
  /** Font size in px. */
  fontSize: number
  lineHeight: number
  /** null keeps the book's own fonts. */
  fontFamily: string | null
  /** The least room on either side of the text, in px. */
  margin: number
  /** Room above and below the text, in px, clear of the reader's bars. */
  top: number
  bottom: number
  background: string
  color: string
  dark: boolean
}

export interface ViewEvents {
  /** A tap or click on the text: the third of the page it was in. */
  onTap: (zone: 'back' | 'middle' | 'forward') => void
  onLink: (href: string, external: boolean) => void
  onKey: (e: KeyboardEvent) => void
  onSwipe: (towards: 'left' | 'right') => void
  /** The wheel, in pages: a page at a time however hard it's turned. */
  onWheel: (forward: boolean) => void
  onPointerMove: (e: PointerEvent) => void
  /** The chapter's layout changed under the reader (an image loaded, the frame resized). */
  onRelayout: () => void
}

/** The widest a line of text gets, in ems: past this, lines are hard to follow. */
const MAX_MEASURE_EM = 34

export class EpubView {
  /** The page shown, from 0, and how many the chapter takes (paged mode). */
  page = 0
  pages = 1
  private layout: TextLayout | null = null
  /** The room beside each column, where a screen's text starts. */
  private side = 0
  private observer: ResizeObserver | null = null
  private wheelAt = 0

  constructor(
    private readonly frame: HTMLIFrameElement,
    /** The element that scrolls in scroll mode. */
    private readonly scroller: HTMLElement,
    private readonly events: ViewEvents,
  ) {}

  private get doc(): Document | null {
    return this.frame.contentDocument
  }

  /** Shows a chapter, laid out, at a place in it. */
  async show(
    html: string,
    layout: TextLayout,
    fraction: number,
  ): Promise<void> {
    this.observer?.disconnect()
    await new Promise<void>((resolve) => {
      this.frame.onload = () => resolve()
      this.frame.srcdoc = html
    })
    const doc = this.doc
    if (!doc) return
    this.listen(doc)
    this.applyLayout(layout)
    await settle(doc)
    this.measure()
    this.goToFraction(fraction)

    // Images that load late, and a frame that changes size, move the text
    const relayout = () => {
      if (this.layout) this.reflow(this.layout)
      this.events.onRelayout()
    }
    for (const img of Array.from(doc.images)) {
      if (!img.complete) img.addEventListener('load', relayout, { once: true })
    }
    // An observer reports the sizes it starts with; only a change moves the text
    let started = false
    this.observer = new ResizeObserver(() => {
      if (started) relayout()
      started = true
    })
    this.observer.observe(this.scroller)
    if (layout.mode === 'scroll') this.observer.observe(doc.body)
  }

  /** New type or colours: the place in the chapter stays. */
  setLayout(layout: TextLayout) {
    const scrollChanged = this.layout?.mode !== layout.mode
    this.reflow(layout)
    if (scrollChanged && this.doc) {
      this.observer?.disconnect()
      this.observer?.observe(this.scroller)
      if (layout.mode === 'scroll') this.observer?.observe(this.doc.body)
    }
  }

  /** Sets the text again, and brings back the words that were at the top of the screen. */
  private reflow(layout: TextLayout) {
    const anchor = this.anchor()
    const f = this.fraction()
    this.applyLayout(layout)
    this.measure()
    if (!anchor || !this.goToRange(anchor)) this.goToFraction(f)
  }

  /**
   * The words where reading is: near the top of the first column on screen. Each point tried
   * must land on text that's on screen; one in a margin can answer with the chapter's start.
   */
  private anchor(): Range | null {
    const doc = this.doc
    if (!doc || !this.layout) return null
    const { fontSize, top } = this.layout
    const paged = this.layout.mode === 'paged'
    const offset = paged
      ? 0
      : Math.max(0, this.scroller.scrollTop - this.frame.offsetTop)
    const width = this.frame.clientWidth
    const height = paged ? this.frame.clientHeight : this.scroller.clientHeight
    const caret = doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null
    }
    const at = (x: number, y: number): Range | null => {
      if (caret.caretRangeFromPoint) return caret.caretRangeFromPoint(x, y)
      const position = caret.caretPositionFromPoint?.(x, y)
      if (!position) return null
      const range = doc.createRange()
      range.setStart(position.offsetNode, position.offset)
      return range
    }
    const xs = paged
      ? [this.side + fontSize * 3, this.side + fontSize, width / 4]
      : [width / 2, width / 3]
    for (const dy of [0.8, 2.5, 5, 9]) {
      for (const x of xs) {
        const range = at(x, offset + top + fontSize * dy)
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) continue
        const rect = range.getBoundingClientRect()
        const y = rect.top - offset
        if (rect.left >= 0 && rect.left < width && y >= 0 && y < height) {
          return range
        }
      }
    }
    return null
  }

  /** Shows the screen a range of the text is on; false when it can't be placed. */
  private goToRange(range: Range): boolean {
    if (!this.layout || !range.startContainer.isConnected) return false
    let rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height && !rect.left && !rect.top) {
      const el =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      if (!el) return false
      rect = el.getBoundingClientRect()
    }
    if (this.layout.mode === 'paged') {
      const x = rect.left + (this.frame.contentWindow?.scrollX ?? 0)
      this.goToPage(Math.floor(x / (this.frame.clientWidth || 1)))
    } else {
      this.scroller.scrollTop =
        this.frame.offsetTop + rect.top - this.layout.top
    }
    return true
  }

  /** How far through the chapter the reader is, from 0 to 1. */
  fraction(): number {
    if (!this.layout) return 0
    if (this.layout.mode === 'paged')
      return this.pages > 1 ? this.page / this.pages : 0
    const room = this.frame.offsetHeight - this.scroller.clientHeight
    if (room <= 0) return 0
    return clamp01((this.scroller.scrollTop - this.frame.offsetTop) / room)
  }

  goToFraction(fraction: number) {
    if (!this.layout) return
    if (this.layout.mode === 'paged') {
      // The end of the chapter is its last page, not past it
      this.goToPage(
        Math.min(this.pages - 1, Math.floor(fraction * this.pages + 1e-6)),
      )
    } else {
      const room = this.frame.offsetHeight - this.scroller.clientHeight
      this.scroller.scrollTop =
        this.frame.offsetTop + Math.max(0, room) * clamp01(fraction)
    }
  }

  goToPage(page: number) {
    const win = this.frame.contentWindow
    this.page = Math.max(0, Math.min(this.pages - 1, page))
    win?.scrollTo(this.page * this.frame.clientWidth, 0)
  }

  /** Where an element of the chapter is, from 0 to 1, or null when there's no such element. */
  fractionOf(id: string): number | null {
    const doc = this.doc
    const el = id
      ? (doc?.getElementById(id) ?? doc?.getElementsByName(id)[0])
      : null
    if (!el || !this.layout || !doc) return null
    if (this.layout.mode === 'paged') {
      const x =
        el.getBoundingClientRect().left +
        (this.frame.contentWindow?.scrollX ?? 0)
      const page = Math.floor(x / this.frame.clientWidth)
      return this.pages > 1
        ? Math.min(page, this.pages - 1) / this.pages + 1e-6
        : 0
    }
    const room = this.frame.offsetHeight - this.scroller.clientHeight
    return room > 0 ? clamp01(el.getBoundingClientRect().top / room) : 0
  }

  /** The scroller is at the end of the chapter (scroll mode). */
  atEnd(): boolean {
    return (
      this.scroller.scrollTop + this.scroller.clientHeight >=
      this.frame.offsetTop + this.frame.offsetHeight - 4
    )
  }

  atStart(): boolean {
    return this.scroller.scrollTop <= this.frame.offsetTop + 4
  }

  destroy() {
    this.observer?.disconnect()
    this.observer = null
  }

  private applyLayout(layout: TextLayout) {
    this.layout = layout
    const doc = this.doc
    if (!doc) return
    let style = doc.getElementById(
      'openpanel-reader',
    ) as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = 'openpanel-reader'
    }
    // Last in the head, so it wins over the book's own styles of the same weight
    doc.head.append(style)
    const { css, side } = readerCss(
      layout,
      this.frame.clientWidth,
      this.frame.clientHeight,
    )
    style.textContent = css
    this.side = side
    if (layout.mode === 'scroll') {
      this.frame.style.height = '100%'
    } else {
      this.frame.style.height = ''
    }
  }

  private measure() {
    const doc = this.doc
    if (!doc || !this.layout) return
    if (this.layout.mode === 'scroll') {
      this.pages = 1
      this.page = 0
      this.frame.style.height = `${Math.ceil(doc.documentElement.scrollHeight)}px`
      return
    }
    // The text's right edge, wherever the last column ended
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    const right =
      range.getBoundingClientRect().right +
      (this.frame.contentWindow?.scrollX ?? 0)
    const width = this.frame.clientWidth || 1
    this.pages = Math.max(1, Math.ceil((right - 1) / width))
    this.goToPage(this.page)
  }

  private listen(doc: Document) {
    doc.addEventListener('keydown', (e) => this.events.onKey(e))
    doc.addEventListener('pointermove', (e) => this.events.onPointerMove(e))
    doc.addEventListener('click', (e) => {
      const link = (e.target as Element | null)?.closest?.('a')
      if (link) {
        e.preventDefault()
        if (link.hasAttribute('data-external')) {
          this.events.onLink(link.getAttribute('href') ?? '', true)
          return
        }
        const href = link.getAttribute('data-href')
        if (href) {
          this.events.onLink(href, false)
          return
        }
      }
      // Selecting text isn't a tap
      if (doc.getSelection()?.toString()) return
      const x = e.clientX / (this.frame.clientWidth || 1)
      this.events.onTap(x < 0.3 ? 'back' : x > 0.7 ? 'forward' : 'middle')
    })
    let start: { x: number; y: number; t: number } | null = null
    doc.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0]
        start = { x: t.clientX, y: t.clientY, t: Date.now() }
      },
      { passive: true },
    )
    doc.addEventListener('touchend', (e) => {
      if (!start || this.layout?.mode !== 'paged') return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (
        Math.abs(dx) > 50 &&
        Math.abs(dx) > Math.abs(dy) * 1.5 &&
        Date.now() - start.t < 500
      ) {
        // The click that follows a swipe isn't a tap
        e.preventDefault()
        this.events.onSwipe(dx < 0 ? 'left' : 'right')
      }
      start = null
    })
    doc.addEventListener(
      'wheel',
      (e) => {
        if (this.layout?.mode !== 'paged') return
        e.preventDefault()
        const now = Date.now()
        if (
          now - this.wheelAt < 350 ||
          Math.abs(e.deltaY) + Math.abs(e.deltaX) < 4
        )
          return
        this.wheelAt = now
        this.events.onWheel(
          (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0,
        )
      },
      { passive: false },
    )
  }
}

/** The reader's own styles over the book's: the type and colours chosen, laid out as pages or one scroll. */
export function readerCss(
  layout: TextLayout,
  width: number,
  height: number,
): { css: string; side: number } {
  const { fontSize, margin, top, bottom } = layout
  const measure = fontSize * MAX_MEASURE_EM
  // Paged: two columns a screen when both get a full line, else one, at most a measure wide,
  // with the room left over on either side
  const columns =
    layout.mode === 'paged' && width - margin * 4 >= measure * 1.6 ? 2 : 1
  const column = Math.min(measure, (width - margin * 2 * columns) / columns)
  const side = (width - column * columns) / (2 * columns)
  const textHeight = Math.max(100, height - top - bottom)
  const font = layout.fontFamily
    ? `font-family: ${layout.fontFamily} !important;`
    : ''

  const shared = `
    :root { color-scheme: ${layout.dark ? 'dark' : 'light'}; }
    html {
      font-size: ${fontSize}px !important;
      background: ${layout.background} !important;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
    }
    body {
      font-size: 1rem !important;
      line-height: ${layout.lineHeight} !important;
      color: ${layout.color} !important;
      background: transparent !important;
      ${font}
      margin: 0 !important;
      box-sizing: border-box !important;
      overflow-wrap: break-word;
      hyphens: auto;
      -webkit-hyphens: auto;
    }
    body * {
      color: inherit !important;
      background-color: transparent !important;
      border-color: color-mix(in srgb, currentColor 25%, transparent) !important;
      max-width: 100%;
    }
    ${font ? 'body :not(code, pre, kbd, samp) { font-family: inherit !important; }' : ''}
    p, li, blockquote, dd { line-height: inherit !important; }
    a { text-decoration-color: color-mix(in srgb, currentColor 45%, transparent) !important; }
    img, svg, video {
      max-width: 100% !important;
      max-height: ${textHeight}px !important;
      height: auto;
      object-fit: contain;
      break-inside: avoid;
    }
    svg { height: auto !important; }
    ::selection { background: color-mix(in srgb, ${layout.color} 22%, transparent); }
  `
  if (layout.mode === 'scroll') {
    const css = `${shared}
      html { overflow: hidden !important; height: auto !important; }
      body {
        max-width: ${Math.ceil(column + side * 2)}px !important;
        margin: 0 auto !important;
        padding: ${top}px ${Math.floor(side)}px ${bottom}px !important;
        height: auto !important;
      }
    `
    return { css, side }
  }
  const css = `${shared}
    html { height: 100% !important; overflow: hidden !important; }
    body {
      width: ${width}px !important;
      max-width: none !important;
      height: ${height}px !important;
      padding: ${top}px ${side}px ${bottom}px !important;
      column-width: ${column}px !important;
      column-gap: ${side * 2}px !important;
      column-fill: auto !important;
      overflow: visible !important;
    }
  `
  return { css, side }
}

/** Until the chapter's fonts and images are in, or a moment has passed. */
async function settle(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
    .filter((img) => !img.complete)
    .map((img) => img.decode().catch(() => {}))
  await Promise.race([
    Promise.all([doc.fonts?.ready, ...images]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ])
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
