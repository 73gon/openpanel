/**
 * A whole novel, set once in an iframe: as pages side by side (CSS columns, turned by scrolling
 * the frame sideways) or as one long scroll. Chapters follow one another with no stop between
 * them; where the reader is comes back as a chapter and how far through it. The frame is
 * sandboxed without scripts; the app reaches into it (same origin) to set the type and to hear
 * taps, swipes, keys, links and scrolling.
 */
import { LATER } from './epub'
import type { EpubPosition } from './epub-position'

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
  /** A link in a chapter: its href as written, and the chapter it's in. */
  onLink: (href: string, external: boolean, chapter: number) => void
  onKey: (e: KeyboardEvent) => void
  onSwipe: (towards: 'left' | 'right') => void
  /** The wheel, in pages: a page at a time however hard it's turned. */
  onWheel: (forward: boolean) => void
  onPointerMove: (e: PointerEvent) => void
  /** The place shown changed: a page turned, the text scrolled or was set again. */
  onMove: () => void
}

/** The widest a line of text gets, in ems: past this, lines are hard to follow. */
const MAX_MEASURE_EM = 34
/** The id of the reader's own style element in the frame. */
const STYLE_ID = 'openpanel-reader'

export class BookView {
  /** The screen shown, from 0, and how many the book takes (paged mode). */
  page = 0
  pages = 1
  private layout: TextLayout | null = null
  /** The room beside each column, where a screen's text starts. */
  private side = 0
  /** Paged: the first screen of each chapter. Scroll: each chapter's top, in px. */
  private starts: number[] = []
  private sections: HTMLElement[] = []
  private observer: ResizeObserver | null = null
  private wheelAt = 0
  private relayoutTimer = 0
  private scrollFrame = 0
  private width = 0
  private height = 0

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly events: ViewEvents,
  ) {}

  private get doc(): Document | null {
    return this.frame.contentDocument
  }

  private get win(): Window | null {
    return this.frame.contentWindow
  }

  /** Sets the book in the frame, laid out, at a place in it. */
  async load(
    html: string,
    layout: TextLayout,
    at: EpubPosition,
  ): Promise<void> {
    this.observer?.disconnect()
    this.paint(layout)
    this.width = this.frame.clientWidth
    this.height = this.frame.clientHeight
    // The reader's styles go in with the book, so its first paint is already in the right type
    // and colours
    const { css } = readerCss(layout, this.width, this.height)
    const styled = html.replace(
      /<\/head>/i,
      `<style id="${STYLE_ID}">${css}</style></head>`,
    )
    await new Promise<void>((resolve) => {
      this.frame.onload = () => resolve()
      this.frame.srcdoc = styled
    })
    const doc = this.doc
    if (!doc) return
    this.sections = Array.from(
      doc.querySelectorAll<HTMLElement>('section.op-chapter'),
    )
    this.listen(doc)
    this.applyLayout(layout)
    await settle(doc)
    this.measure()
    this.goTo(at)

    // A picture whose size wasn't known moves the text when it loads: set it again, in place
    doc.addEventListener(
      'load',
      (e) => {
        if ((e.target as Element | null)?.localName !== 'img') return
        window.clearTimeout(this.relayoutTimer)
        this.relayoutTimer = window.setTimeout(() => this.relayout(), 120)
      },
      true,
    )
    // A frame that changes size sets the text again; an observer reports its first size too
    this.observer = new ResizeObserver(() => {
      const w = this.frame.clientWidth
      const h = this.frame.clientHeight
      if (w === this.width && h === this.height) return
      this.width = w
      this.height = h
      window.clearTimeout(this.relayoutTimer)
      this.relayoutTimer = window.setTimeout(() => this.relayout(), 60)
    })
    this.observer.observe(this.frame)
  }

  /** New type, colours or layout: the words at the top of the screen stay there. */
  setLayout(layout: TextLayout) {
    this.paint(layout)
    this.reflow(layout)
  }

  /** Where the reader is: the chapter at the top of the screen, and how far through it. */
  position(): EpubPosition {
    const n = this.sections.length
    if (!this.layout || n === 0) return { chapter: 0, fraction: 0 }
    if (this.layout.mode === 'paged') {
      const chapter = this.chapterAtPage(this.page)
      const start = this.starts[chapter]
      const end = chapter + 1 < n ? this.starts[chapter + 1] : this.pages
      return {
        chapter,
        fraction: end - start > 1 ? (this.page - start) / (end - start) : 0,
      }
    }
    const y = (this.win?.scrollY ?? 0) + this.layout.top
    let chapter = 0
    for (let i = 0; i < n; i++) if (this.starts[i] <= y + 1) chapter = i
    const top = this.starts[chapter]
    const height = this.sections[chapter].offsetHeight || 1
    return { chapter, fraction: clamp01((y - top) / height) }
  }

  /** Shows a place: a chapter and how far through it. */
  goTo(at: EpubPosition) {
    if (!this.layout || this.sections.length === 0) return
    const chapter = Math.max(0, Math.min(this.sections.length - 1, at.chapter))
    if (this.layout.mode === 'paged') {
      const start = this.starts[chapter]
      const end =
        chapter + 1 < this.sections.length
          ? this.starts[chapter + 1]
          : this.pages
      // The end of a chapter is its last page, not the next chapter's first
      const page =
        start + Math.floor(clamp01(at.fraction) * (end - start) + 1e-6)
      this.goToPage(Math.min(page, Math.max(start, end - 1)))
      return
    }
    const height = this.sections[chapter].offsetHeight
    this.scrollToY(
      this.starts[chapter] + clamp01(at.fraction) * height - this.layout.top,
    )
  }

  /** Shows an element of a chapter by its id (a link's or a contents entry's fragment). */
  goToElement(chapter: number, id: string): boolean {
    const section = this.sections[chapter]
    if (!section) return false
    const el = id
      ? section.querySelector(
          `[id="${CSS.escape(id)}"], [name="${CSS.escape(id)}"]`,
        )
      : section
    if (!el) return false
    return this.goToRect(el.getBoundingClientRect())
  }

  /** The next screen; false at the end of the book. */
  next(): boolean {
    if (!this.layout) return false
    if (this.layout.mode === 'paged') {
      if (this.page >= this.pages - 1) return false
      this.goToPage(this.page + 1, true)
      return true
    }
    if (this.atEnd()) return false
    this.win?.scrollBy({
      top: this.screenStep(),
      behavior: smooth(this.win),
    })
    return true
  }

  /** The screen before; false at the start of the book. */
  previous(): boolean {
    if (!this.layout) return false
    if (this.layout.mode === 'paged') {
      if (this.page <= 0) return false
      this.goToPage(this.page - 1, true)
      return true
    }
    if ((this.win?.scrollY ?? 0) <= 2) return false
    this.win?.scrollBy({
      top: -this.screenStep(),
      behavior: smooth(this.win),
    })
    return true
  }

  /** Scroll mode: a little, as an arrow key moves a page. */
  nudge(dy: number) {
    this.win?.scrollBy({ top: dy })
  }

  /** The last of the book is on screen. */
  atEnd(): boolean {
    if (!this.layout) return false
    if (this.layout.mode === 'paged') return this.page >= this.pages - 1
    const win = this.win
    const doc = this.doc
    if (!win || !doc) return false
    return win.scrollY + win.innerHeight >= doc.documentElement.scrollHeight - 4
  }

  destroy() {
    this.observer?.disconnect()
    this.observer = null
    window.clearTimeout(this.relayoutTimer)
    cancelAnimationFrame(this.scrollFrame)
  }

  // ── Inside ──

  private goToPage(page: number, animate = false) {
    this.page = Math.max(0, Math.min(this.pages - 1, page))
    const win = this.win
    win?.scrollTo({
      left: this.page * (this.frame.clientWidth || 1),
      top: 0,
      behavior: animate && win ? smooth(win) : 'instant',
    })
    this.moved()
  }

  private scrollToY(y: number) {
    this.win?.scrollTo({ top: Math.max(0, y), behavior: 'instant' })
    this.moved()
  }

  /** The place changed: its pictures (and the next chapters') load, and the reader hears of it. */
  private moved() {
    const { chapter } = this.position()
    for (let i = chapter - 1; i <= chapter + 2; i++) {
      const section = this.sections[i]
      if (!section) continue
      for (const el of Array.from(section.querySelectorAll(`[${LATER}]`))) {
        const url = el.getAttribute(LATER)!
        el.removeAttribute(LATER)
        if (el.localName === 'img') el.setAttribute('src', url)
        else
          el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url)
      }
    }
    this.events.onMove()
  }

  /** A screen's worth of scrolling, less a few lines that stay to read on from. */
  private screenStep(): number {
    const layout = this.layout!
    const view = (this.win?.innerHeight ?? 600) - layout.top - layout.bottom
    return Math.max(100, view - layout.fontSize * layout.lineHeight * 2)
  }

  private chapterAtPage(page: number): number {
    let chapter = 0
    for (let i = 0; i < this.starts.length; i++) {
      if (this.starts[i] <= page) chapter = i
      else break
    }
    return chapter
  }

  /** Shows the screen a rectangle (in the frame's viewport) is on. */
  private goToRect(rect: DOMRect): boolean {
    if (!this.layout) return false
    const win = this.win
    if (this.layout.mode === 'paged') {
      const x = rect.left + (win?.scrollX ?? 0)
      this.goToPage(Math.floor(x / (this.frame.clientWidth || 1)))
    } else {
      this.scrollToY(rect.top + (win?.scrollY ?? 0) - this.layout.top)
    }
    return true
  }

  /** Sets the text again for its new room or a late picture, keeping the reader's place. */
  private relayout() {
    if (this.layout) this.reflow(this.layout)
  }

  private reflow(layout: TextLayout) {
    const anchor = this.anchor()
    const at = this.position()
    this.applyLayout(layout)
    this.measure()
    if (!anchor || !this.goToRange(anchor)) this.goTo(at)
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
    const width = this.frame.clientWidth
    const height = this.frame.clientHeight
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
        const range = at(x, top + fontSize * dy)
        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) continue
        const rect = range.getBoundingClientRect()
        if (
          rect.left >= 0 &&
          rect.left < width &&
          rect.top >= 0 &&
          rect.top < height
        ) {
          return range
        }
      }
    }
    return null
  }

  /** Shows the screen a range of the text is on; false when it can't be placed. */
  private goToRange(range: Range): boolean {
    if (!range.startContainer.isConnected) return false
    let rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height && !rect.left && !rect.top) {
      const el =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      if (!el) return false
      rect = el.getBoundingClientRect()
    }
    return this.goToRect(rect)
  }

  /** The frame itself in the reader's colours, so nothing white shows before or around the text. */
  private paint(layout: TextLayout) {
    this.frame.style.background = layout.background
    this.frame.style.colorScheme = layout.dark ? 'dark' : 'light'
  }

  private applyLayout(layout: TextLayout) {
    this.layout = layout
    const doc = this.doc
    if (!doc) return
    let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = STYLE_ID
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
  }

  /** Where each chapter starts, and (paged) how many screens the book takes. */
  private measure() {
    const doc = this.doc
    const win = this.win
    if (!doc || !win || !this.layout) return
    if (this.layout.mode === 'scroll') {
      this.pages = 1
      this.page = 0
      const y = win.scrollY
      this.starts = this.sections.map((s) => s.getBoundingClientRect().top + y)
      return
    }
    const width = this.frame.clientWidth || 1
    const x = win.scrollX
    this.starts = this.sections.map((s) =>
      Math.max(0, Math.floor((s.getBoundingClientRect().left + x + 1) / width)),
    )
    // The text's right edge, wherever the last column ended
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    const right = range.getBoundingClientRect().right + x
    this.pages = Math.max(1, Math.ceil((right - 1) / width))
    this.page = Math.min(this.page, this.pages - 1)
  }

  private listen(doc: Document) {
    doc.addEventListener('keydown', (e) => this.events.onKey(e))
    doc.addEventListener('pointermove', (e) => this.events.onPointerMove(e))
    doc.addEventListener('click', (e) => {
      const target = e.target as Element | null
      const link = target?.closest?.('a')
      if (link) {
        e.preventDefault()
        const chapter = Number(
          link.closest('section.op-chapter')?.getAttribute('data-chapter') ?? 0,
        )
        if (link.hasAttribute('data-external')) {
          this.events.onLink(link.getAttribute('href') ?? '', true, chapter)
          return
        }
        const href = link.getAttribute('data-href')
        if (href) {
          this.events.onLink(href, false, chapter)
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
    // Scrolling reports the place, a frame at a time
    doc.defaultView?.addEventListener(
      'scroll',
      () => {
        if (this.layout?.mode !== 'scroll') return
        cancelAnimationFrame(this.scrollFrame)
        this.scrollFrame = requestAnimationFrame(() => this.moved())
      },
      { passive: true },
    )
  }
}

/**
 * The reader's own styles over the book's: the type and colours chosen, laid out as pages or
 * one scroll. Pages are whole pixels wide, so the hundredth screen sits where the first did.
 */
export function readerCss(
  layout: TextLayout,
  width: number,
  height: number,
): { css: string; side: number } {
  const { fontSize, margin, top, bottom } = layout
  const measure = fontSize * MAX_MEASURE_EM
  // Paged: two columns a screen when both get a full line, else one, at most a measure wide,
  // centred in its half (or the whole) of the screen
  const columns =
    layout.mode === 'paged' && width - margin * 4 >= measure * 1.6 ? 2 : 1
  const cell = width / columns
  const column = Math.floor(Math.min(measure, cell - margin * 2))
  const side = (cell - column) / 2
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
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
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
    .op-chapter { display: block; margin: 0 !important; padding: 0 !important; }
    ::selection { background: color-mix(in srgb, ${layout.color} 22%, transparent); }
  `
  if (layout.mode === 'scroll') {
    const css = `${shared}
      html { overflow-x: hidden !important; overflow-y: auto !important; height: auto !important; }
      body {
        max-width: ${Math.ceil(column + side * 2)}px !important;
        margin: 0 auto !important;
        padding: ${top}px ${Math.floor(side)}px ${bottom}px !important;
        height: auto !important;
      }
      /* Chapters run on, a quiet rule and some room between them */
      .op-chapter + .op-chapter {
        margin-top: 3.5em !important;
        padding-top: 3.5em !important;
        border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent) !important;
      }
      img, svg { max-height: 88vh !important; }
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
    /* Each chapter starts on a column of its own */
    .op-chapter + .op-chapter { break-before: column !important; }
  `
  return { css, side }
}

/** Until the book's fonts are in, or a moment has passed; pictures load as they're reached. */
async function settle(doc: Document): Promise<void> {
  await Promise.race([
    doc.fonts?.ready,
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ])
}

/** Smooth, unless the reader asked the system for less motion. */
function smooth(win: Window): ScrollBehavior {
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'instant'
    : 'smooth'
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
