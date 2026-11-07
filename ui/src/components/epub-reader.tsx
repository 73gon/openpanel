import { Link, useNavigate } from '@tanstack/react-router'
import {
  Badge,
  BadgeAnchor,
  Button,
  Card,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Eyebrow,
  Heading,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Spinner,
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from '@zonsh/ui'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  ListOrderedIcon,
  Maximize2Icon,
  Minimize2Icon,
  SlidersHorizontalIcon,
  SunMediumIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookmarksPanel, ReaderBottomBar } from '@/components/reader'
import {
  createBookmark,
  deleteBookmark,
  fetchBookDetail,
  fetchBookFile,
  fetchBookmarks,
  fetchBooks,
  fetchProgress,
  updateProgress,
  type Book,
  type BookDetail,
  type Bookmark,
  type PartBook,
} from '@/lib/api'
import { displaySeriesName, partName } from '@/lib/anilist'
import { getDownloadMeta, getDownloadedFile } from '@/lib/downloads'
import {
  CHARS_PER_PAGE,
  openEpub,
  type Epub,
  type EpubTocEntry,
} from '@/lib/epub'
import {
  formatLocator,
  overallFraction,
  pageAt,
  pageStart,
  parseLocator,
  positionAt,
  type EpubPosition,
} from '@/lib/epub-position'
import { EpubView, type TextLayout } from '@/lib/epub-view'
import { queryClient, queryKeys } from '@/lib/query'
import { useReaderPrefs, type TextPrefs } from '@/lib/reader-store'
import { useAppStore } from '@/lib/store'
import { useIsPhone } from '@/lib/use-media-query'
import { useWakeLock } from '@/lib/use-wake-lock'
import { useSeriesExit } from '@/lib/history-trail'
import { cn, stripTitleZeros } from '@/lib/utils'

const FONTS: Record<TextPrefs['font'], string | null> = {
  book: null,
  serif:
    "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
}
const LINE_HEIGHTS: Record<TextPrefs['lineHeight'], number> = {
  tight: 1.4,
  normal: 1.6,
  loose: 1.85,
}
const MARGINS: Record<TextPrefs['margins'], number> = {
  narrow: 16,
  normal: 32,
  wide: 64,
}
const SIZES: Array<{ value: number; label: string }> = [
  { value: 85, label: 'Small' },
  { value: 100, label: 'Medium' },
  { value: 115, label: 'Large' },
  { value: 130, label: 'Larger' },
  { value: 150, label: 'Largest' },
]
/** Warm paper, for a page that's easier on the eyes than white. */
const PAPER = { background: '#f4ecd8', color: '#3b3226' }

/** A book of another part of the story, as the bars show a book: titled with its part. */
function partBookAsBook(part: PartBook | null, story: string): Book | null {
  if (!part) return null
  const name = partName(part.series_name, part.series_anilist_id, story)
  return {
    id: part.id,
    title: `${name} · ${stripTitleZeros(part.title)}`,
    page_count: 0,
    sort_order: 0,
  }
}

/**
 * The reader for novels (EPUB). The whole file is read in the browser, one chapter at a time
 * shown in a frame, as pages turned sideways or one long scroll, in the reader's type. A place
 * is a chapter and how far through it, saved with the page it counts as.
 */
export function EpubReader({
  bookId,
  initialPage,
}: {
  bookId: string
  initialPage?: number
}) {
  const navigate = useNavigate()
  const setReaderActive = useAppStore((s) => s.setReaderActive)
  const prefs = useReaderPrefs()
  const text = prefs.text
  useWakeLock(prefs.keepScreenOn)

  const [book, setBook] = useState<BookDetail | null>(null)
  const exit = useSeriesExit(book?.series_id ?? '')
  const [epub, setEpub] = useState<Epub | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<EpubPosition>({ chapter: 0, fraction: 0 })
  const [atBookEnd, setAtBookEnd] = useState(false)
  const [shown, setShown] = useState(false)
  const [ended, setEnded] = useState(false)

  const [siblings, setSiblings] = useState<Book[]>([])
  const [partBooks, setPartBooks] = useState<{
    story: string
    prev: PartBook | null
    next: PartBook | null
  }>({ story: '', prev: null, next: null })
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [addingBookmark, setAddingBookmark] = useState(false)

  const [showUI, setShowUI] = useState(true)
  const [showToc, setShowToc] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const overlayOpen = showToc || showBookmarks || settingsOpen

  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const viewRef = useRef<EpubView | null>(null)
  /** The chapter in the frame. */
  const chapterRef = useRef(0)
  /** Only the latest chapter asked for is shown. */
  const showToken = useRef(0)
  const startRef = useRef<EpubPosition | null>(null)
  const chapterCache = useRef(new Map<number, Promise<string>>())

  // ── Loading ──

  useEffect(() => {
    setReaderActive(true)
    return () => {
      setReaderActive(false)
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.continueReading(),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.seriesProgress(),
        })
      }, 800)
    }
  }, [setReaderActive])

  useEffect(() => {
    let cancelled = false
    let opened: Epub | null = null
    async function load() {
      try {
        let detail: BookDetail
        let progress: Awaited<ReturnType<typeof fetchProgress>> = null
        try {
          ;[detail, progress] = await Promise.all([
            fetchBookDetail(bookId),
            fetchProgress(bookId),
          ])
        } catch (err) {
          // Offline: a downloaded book still opens, from the start
          const meta = await getDownloadMeta(bookId)
          if (!meta) throw err
          detail = {
            id: meta.bookId,
            title: meta.title,
            series_id: meta.seriesId,
            series_name: meta.seriesName,
            page_count: 0,
            file_size: meta.totalSize,
            format: 'epub',
            metadata: { writer: null, year: null, summary: null },
          }
        }
        // A reply that isn't the book (an answer from a proxy, say) isn't read as one
        if (!detail?.id)
          throw new Error('The server didn’t say what this book is.')
        const data =
          (await getDownloadedFile(bookId)) ??
          (await fetchBookFile(bookId, detail.version))
        if (cancelled) return
        opened = await openEpub(data)
        if (cancelled) {
          opened.close()
          return
        }
        const chars = opened.chapters.map((c) => c.chars)
        const pageCount =
          detail.page_count > 0
            ? detail.page_count
            : Math.max(1, Math.ceil(opened.totalChars / CHARS_PER_PAGE))
        const pageCountOf = { ...detail, page_count: pageCount }

        // Where to open: a page asked for, the saved place, or the saved page
        const saved = parseLocator(progress?.locator, opened.chapters.length)
        startRef.current =
          initialPage !== undefined
            ? positionAt(chars, pageStart(initialPage, pageCount))
            : progress?.is_completed
              ? { chapter: 0, fraction: 0 }
              : (saved ??
                (progress && progress.page > 1
                  ? positionAt(chars, pageStart(progress.page, pageCount))
                  : { chapter: 0, fraction: 0 }))
        setBook(pageCountOf)
        setEpub(opened)

        const [booksData, marks] = await Promise.all([
          fetchBooks(detail.series_id).catch(() => null),
          fetchBookmarks(bookId).catch(() => [] as Bookmark[]),
        ])
        if (cancelled) return
        if (booksData) {
          setSiblings(booksData.books)
          setPartBooks({
            story: booksData.group?.name ?? '',
            prev: booksData.group?.prev_part_book ?? null,
            next: booksData.group?.next_part_book ?? null,
          })
        }
        setBookmarks(marks)
      } catch (err) {
        console.error('Failed to open book:', err)
        if (!cancelled) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'The book couldn’t be opened.',
          )
        }
      }
    }
    void load()
    return () => {
      cancelled = true
      opened?.close()
      chapterCache.current.clear()
    }
  }, [bookId, initialPage])

  // ── Layout ──

  const phone = useIsPhone()
  const [appColors, setAppColors] = useState({
    background: '#ffffff',
    color: '#111111',
    dark: false,
  })
  // The app's colours, read off the page, again whenever the theme changes
  useEffect(() => {
    const read = () => {
      const el = rootRef.current
      if (!el) return
      const style = getComputedStyle(el)
      setAppColors({
        background: style.backgroundColor,
        color: style.color,
        dark: luminance(style.backgroundColor) < 0.4,
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })
    return () => observer.disconnect()
  }, [book])

  const layout: TextLayout = useMemo(() => {
    const colors =
      text.theme === 'paper' ? { ...PAPER, dark: false } : appColors
    return {
      mode: text.layout,
      fontSize: Math.round((18 * text.size) / 100),
      lineHeight: LINE_HEIGHTS[text.lineHeight],
      fontFamily: FONTS[text.font],
      margin: Math.round(MARGINS[text.margins] * (phone ? 0.6 : 1)),
      top: text.layout === 'paged' ? 56 : 72,
      bottom: text.layout === 'paged' ? 44 : 96,
      background: colors.background,
      color: colors.color,
      dark: colors.dark,
    }
  }, [text, appColors, phone])
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // ── Position ──

  const chars = useMemo(() => epub?.chapters.map((c) => c.chars) ?? [], [epub])
  const pageCount = book?.page_count ?? 1
  // A screen holds more than one of the book's pages: one gone to (a bookmark, the slider) is
  // the one shown, until the reader moves on
  const [pinnedPage, setPinnedPage] = useState<number | null>(null)
  const currentPage =
    pinnedPage ?? pageAt(overallFraction(chars, pos), pageCount)

  /** Reads where the view is, after it moved. */
  const syncPosition = useCallback(() => {
    const view = viewRef.current
    if (!view || !epub) return
    const chapter = chapterRef.current
    const fraction = view.fraction()
    setPinnedPage(null)
    setPos({ chapter, fraction })
    const last = chapter === epub.chapters.length - 1
    setAtBookEnd(
      last &&
        (layoutRef.current.mode === 'paged'
          ? view.page >= view.pages - 1
          : view.atEnd()),
    )
  }, [epub])

  const chapterHtml = useCallback(
    (index: number) => {
      let html = chapterCache.current.get(index)
      if (!html && epub) {
        html = epub.chapterDocument(index)
        chapterCache.current.set(index, html)
        // A few chapters are kept: the one read and those either side
        for (const key of chapterCache.current.keys()) {
          if (Math.abs(key - index) > 1) chapterCache.current.delete(key)
        }
      }
      return html!
    },
    [epub],
  )

  /** Opens a chapter at a place in it: how far through, or an element by id. */
  const openChapter = useCallback(
    async (index: number, at: number | { fragment: string }) => {
      const view = viewRef.current
      if (!view || !epub) return
      const token = ++showToken.current
      setShown(false)
      const html = await chapterHtml(index)
      if (token !== showToken.current) return
      await view.show(html, layoutRef.current, typeof at === 'number' ? at : 0)
      if (token !== showToken.current) return
      if (typeof at !== 'number') {
        const f = view.fractionOf(at.fragment)
        if (f !== null) view.goToFraction(f)
      }
      chapterRef.current = index
      syncPosition()
      setShown(true)
      // The next chapter is made while this one is read
      if (index + 1 < epub.chapters.length) void chapterHtml(index + 1)
    },
    [epub, chapterHtml, syncPosition],
  )

  // The view, once the frame is there, and the first chapter
  useEffect(() => {
    const frame = frameRef.current
    const scroller = scrollerRef.current
    if (!epub || !frame || !scroller) return
    const view = new EpubView(frame, scroller, {
      onTap: (zone) => handlers.current.tap(zone),
      onLink: (href, external) => handlers.current.link(href, external),
      onKey: (e) => handlers.current.key(e),
      onSwipe: (towards) => handlers.current.swipe(towards),
      onWheel: (forward) => handlers.current.wheel(forward),
      onPointerMove: (e) => {
        if (e.pointerType === 'mouse') handlers.current.reveal()
      },
      onRelayout: () => handlers.current.sync(),
    })
    viewRef.current = view
    const start = startRef.current ?? { chapter: 0, fraction: 0 }
    void openChapter(start.chapter, start.fraction).then(() => {
      if (initialPage !== undefined) setPinnedPage(initialPage)
    })
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The page asked for counts once, when the book opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epub, openChapter])

  // New type, colours or layout: the same place, set again
  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false
      return
    }
    viewRef.current?.setLayout(layout)
    syncPosition()
  }, [layout, syncPosition])

  // Scroll mode reads the place as the reader scrolls
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || layout.mode !== 'scroll') return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncPosition)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [layout.mode, syncPosition])

  // ── Saving ──

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!book || !shown || ended) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateProgress(
        bookId,
        atBookEnd ? pageCount : currentPage,
        atBookEnd,
        formatLocator(pos),
      ).catch(() => {})
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [book, bookId, shown, ended, pos, atBookEnd, currentPage, pageCount])

  // ── Moving ──

  const currentIndex = siblings.findIndex((b) => b.id === bookId)
  const prevBook =
    currentIndex > 0
      ? siblings[currentIndex - 1]
      : currentIndex === 0
        ? partBookAsBook(partBooks.prev, partBooks.story)
        : null
  const nextBook =
    currentIndex >= 0 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : currentIndex >= 0 && currentIndex === siblings.length - 1
        ? partBookAsBook(partBooks.next, partBooks.story)
        : null

  const finish = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setEnded(true)
    updateProgress(
      bookId,
      pageCount,
      true,
      formatLocator({ chapter: chars.length - 1, fraction: 1 }),
    ).catch(() => {})
  }, [bookId, pageCount, chars.length])

  const goForward = useCallback(() => {
    const view = viewRef.current
    if (!view || !epub) return
    const chapter = chapterRef.current
    const lastChapter = chapter >= epub.chapters.length - 1
    if (layoutRef.current.mode === 'paged') {
      if (view.page < view.pages - 1) {
        view.goToPage(view.page + 1)
        syncPosition()
      } else if (!lastChapter) void openChapter(chapter + 1, 0)
      else finish()
      return
    }
    const scroller = scrollerRef.current
    if (scroller && !view.atEnd()) {
      scroller.scrollBy({
        top: scroller.clientHeight * 0.9,
        behavior: 'smooth',
      })
    } else if (!lastChapter) void openChapter(chapter + 1, 0)
    else finish()
  }, [epub, openChapter, syncPosition, finish])

  const goBackward = useCallback(() => {
    if (ended) {
      setEnded(false)
      return
    }
    const view = viewRef.current
    if (!view) return
    const chapter = chapterRef.current
    if (layoutRef.current.mode === 'paged') {
      if (view.page > 0) {
        view.goToPage(view.page - 1)
        syncPosition()
      } else if (chapter > 0) void openChapter(chapter - 1, 1)
      return
    }
    const scroller = scrollerRef.current
    if (scroller && !view.atStart()) {
      scroller.scrollBy({
        top: -scroller.clientHeight * 0.9,
        behavior: 'smooth',
      })
    } else if (chapter > 0) void openChapter(chapter - 1, 1)
  }, [ended, openChapter, syncPosition])

  /** To a page of the book, as the slider and bookmarks count them. */
  const goToPage = useCallback(
    async (page: number) => {
      const target = positionAt(chars, pageStart(page, pageCount))
      if (target.chapter === chapterRef.current && viewRef.current) {
        viewRef.current.goToFraction(target.fraction)
        syncPosition()
      } else {
        await openChapter(target.chapter, target.fraction)
      }
      setPinnedPage(page)
    },
    [chars, pageCount, openChapter, syncPosition],
  )

  const goToEntry = useCallback(
    (entry: { chapter: number; fragment: string }) => {
      if (entry.chapter < 0) return
      if (entry.chapter === chapterRef.current && viewRef.current) {
        const f = entry.fragment
          ? viewRef.current.fractionOf(entry.fragment)
          : 0
        viewRef.current.goToFraction(f ?? 0)
        syncPosition()
      } else {
        void openChapter(entry.chapter, { fragment: entry.fragment })
      }
    },
    [openChapter, syncPosition],
  )

  const openBook = useCallback(
    (target: Book | null) => {
      if (target)
        navigate({
          to: '/read/$bookId',
          params: { bookId: target.id },
          replace: true,
        })
    },
    [navigate],
  )

  // ── The controls ──

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uiHovered = useRef(false)
  const reveal = useCallback(() => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (!uiHovered.current) {
      hideTimer.current = setTimeout(() => setShowUI(false), 3000)
    }
  }, [])
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  const rtl = epub?.rtl ?? false

  // Keys, from the page and from inside the frame
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!book || overlayOpen || e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (useAppStore.getState().commandPaletteOpen) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return
      const dialog = target?.closest('[role="dialog"], [role="alertdialog"]')
      if (dialog && dialog.id !== 'book-end') return

      const forward =
        (e.key === ' ' && !e.shiftKey) ||
        e.key === 'PageDown' ||
        e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
      const backward =
        (e.key === ' ' && e.shiftKey) ||
        e.key === 'PageUp' ||
        e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')

      if (ended) {
        if (e.repeat) return
        const onControl = !!target?.closest('button, a, [role="button"]')
        if (forward && nextBook && !(e.key === ' ' && onControl)) {
          e.preventDefault()
          openBook(nextBook)
        } else if (backward || e.key === 'Escape') {
          e.preventDefault()
          setEnded(false)
        }
        return
      }
      if (forward) {
        e.preventDefault()
        goForward()
        return
      }
      if (backward) {
        e.preventDefault()
        goBackward()
        return
      }
      const scroller = scrollerRef.current
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          if (layoutRef.current.mode === 'scroll' && scroller) {
            e.preventDefault()
            scroller.scrollBy({ top: e.key === 'ArrowDown' ? 64 : -64 })
          }
          break
        case 'Home':
          e.preventDefault()
          void openChapter(0, 0)
          break
        case 'b':
        case 'B':
          e.preventDefault()
          toggleBookmarkRef.current()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case '[':
          openBook(prevBook)
          break
        case ']':
          openBook(nextBook)
          break
        case 'Escape':
          exit.leave()
          break
      }
    },
    [
      book,
      overlayOpen,
      rtl,
      ended,
      nextBook,
      prevBook,
      openBook,
      goForward,
      goBackward,
      openChapter,
      toggleFullscreen,
      navigate,
      exit.leave,
    ],
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // What the frame reports, handled with the latest state
  const handlers = useRef({
    tap: (_zone: 'back' | 'middle' | 'forward') => {},
    link: (_href: string, _external: boolean) => {},
    key: (_e: KeyboardEvent) => {},
    swipe: (_towards: 'left' | 'right') => {},
    wheel: (_forward: boolean) => {},
    reveal: () => {},
    sync: () => {},
  })
  handlers.current = {
    tap: (zone) => {
      if (zone === 'middle' || layoutRef.current.mode === 'scroll') {
        setShowUI((s) => !s)
        return
      }
      // Right to left, the left of the page goes on
      if ((zone === 'forward') !== rtl) goForward()
      else goBackward()
    },
    link: (href, external) => {
      if (external) {
        window.open(href, '_blank', 'noopener,noreferrer')
        return
      }
      const to = epub?.resolveLink(chapterRef.current, href)
      if (to) goToEntry(to)
    },
    key: handleKey,
    swipe: (towards) => {
      if ((towards === 'left') !== rtl) goForward()
      else goBackward()
    },
    wheel: (forward) => (forward ? goForward() : goBackward()),
    reveal,
    sync: syncPosition,
  }

  // ── Bookmarks ──

  const pageBookmarked = bookmarks.some((b) => b.page === currentPage)
  const handleAddBookmark = async () => {
    if (addingBookmark) return
    setAddingBookmark(true)
    try {
      const bm = await createBookmark(bookId, currentPage)
      setBookmarks((prev) => [
        ...prev.filter((b) => b.id !== bm.id && b.page !== bm.page),
        bm,
      ])
    } catch {
    } finally {
      setAddingBookmark(false)
    }
  }
  const handleDeleteBookmark = async (id: string) => {
    try {
      await deleteBookmark(id)
      setBookmarks((prev) => prev.filter((b) => b.id !== id))
    } catch {}
  }
  const toggleBookmarkRef = useRef<() => void>(() => {})
  toggleBookmarkRef.current = () => {
    const mark = bookmarks.find((b) => b.page === currentPage)
    if (mark) void handleDeleteBookmark(mark.id)
    else void handleAddBookmark()
  }

  // ── Showing ──

  const tocHere = useMemo(() => {
    if (!epub) return -1
    // The last entry at or before the place read
    let here = -1
    epub.toc.forEach((entry, i) => {
      if (entry.chapter >= 0 && entry.chapter <= pos.chapter) here = i
    })
    return here
  }, [epub, pos.chapter])
  const chapterLabel = tocHere >= 0 ? epub?.toc[tocHere].label : null

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-sm gap-4">
          <Heading level={4} as="h1">
            This book couldn’t be opened
          </Heading>
          <p className="m-0 text-sm text-muted-foreground">{error}</p>
          <Button variant="secondary" onClick={() => window.history.back()}>
            <ArrowLeftIcon />
            Back
          </Button>
        </Card>
      </div>
    )
  }

  const paper = text.theme === 'paper'
  const progressPct = Math.round(overallFraction(chars, pos) * 100)

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground"
      style={
        paper ? { background: PAPER.background, color: PAPER.color } : undefined
      }
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') reveal()
      }}
      onFocusCapture={() => setShowUI(true)}
    >
      {/* Reading progress: a hairline along the top. */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex h-0.5',
          rtl && 'justify-end',
        )}
        aria-hidden
      >
        <div
          className="h-full bg-current opacity-80 transition-[width] duration-300 ease-(--ease)"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {book && (
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-20 transition-[opacity,translate] duration-(--duration-reveal) ease-(--ease)',
            showUI
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-2 opacity-0',
          )}
          onMouseEnter={() => {
            uiHovered.current = true
            if (hideTimer.current) clearTimeout(hideTimer.current)
          }}
          onMouseLeave={() => {
            uiHovered.current = false
            reveal()
          }}
        >
          <EpubTopBar
            book={book}
            currentPage={currentPage}
            bookmarkCount={bookmarks.length}
            pageBookmarked={pageBookmarked}
            bookmarksOpen={showBookmarks}
            hasContents={(epub?.toc.length ?? 0) > 0}
            tocOpen={showToc}
            onBookmarks={() => {
              setShowToc(false)
              setShowBookmarks((p) => !p)
            }}
            onToc={() => {
              setShowBookmarks(false)
              setShowToc((p) => !p)
            }}
            text={text}
            onText={prefs.setText}
            onSettingsOpenChange={setSettingsOpen}
            keepScreenOn={prefs.keepScreenOn}
            onKeepScreenOn={prefs.setKeepScreenOn}
            fullscreen={fullscreen}
            onFullscreen={
              document.fullscreenEnabled ? toggleFullscreen : undefined
            }
          />
        </div>
      )}

      <BookmarksPanel
        open={showBookmarks}
        onOpenChange={setShowBookmarks}
        bookmarks={bookmarks}
        currentPage={currentPage}
        isCurrentPageBookmarked={pageBookmarked}
        adding={addingBookmark}
        onAddBookmark={handleAddBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onGoToPage={(page) => {
          goToPage(page)
          setShowBookmarks(false)
        }}
      />
      {epub && (
        <EpubTocPanel
          open={showToc}
          onOpenChange={setShowToc}
          entries={epub.toc}
          here={tocHere}
          pageOf={(entry) =>
            pageAt(
              overallFraction(chars, { chapter: entry.chapter, fraction: 0 }),
              pageCount,
            )
          }
          onGo={(entry) => {
            goToEntry(entry)
            setShowToc(false)
          }}
        />
      )}

      {/* The text: the frame fills the screen to turn pages, or grows with the chapter to scroll. */}
      <div
        ref={scrollerRef}
        className={cn(
          'relative min-h-0 flex-1',
          text.layout === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden',
        )}
      >
        <iframe
          ref={frameRef}
          title={book ? stripTitleZeros(book.title) : 'Book'}
          sandbox="allow-same-origin"
          className={cn(
            'block w-full border-0 transition-opacity duration-150',
            text.layout === 'paged' && 'absolute inset-0 h-full',
            shown ? 'opacity-100' : 'opacity-0',
          )}
        />
        {epub && text.layout === 'scroll' && shown && (
          <ChapterLink
            label={
              pos.chapter < epub.chapters.length - 1
                ? 'Next chapter'
                : nextBook
                  ? `Next: ${stripTitleZeros(nextBook.title)}`
                  : 'The end'
            }
            onClick={goForward}
            className="pt-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
          />
        )}
        {!shown && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Spinner />
            {!epub && 'Opening the book…'}
          </div>
        )}
      </div>

      {/* Where you are, quietly, while the controls are away */}
      {book && shown && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] font-mono text-[11px] tabular-nums opacity-60 transition-opacity',
            showUI && 'opacity-0',
          )}
          aria-hidden
        >
          <span className="truncate">
            {chapterLabel ? `${chapterLabel} · ` : ''}
            {currentPage} / {pageCount}
          </span>
        </div>
      )}

      {book && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 transition-[opacity,translate] duration-(--duration-reveal) ease-(--ease)',
            showUI
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
          onMouseEnter={() => {
            uiHovered.current = true
            if (hideTimer.current) clearTimeout(hideTimer.current)
          }}
          onMouseLeave={() => {
            uiHovered.current = false
            reveal()
          }}
        >
          <ReaderBottomBar
            book={book}
            currentPage={currentPage}
            direction={rtl ? 'rtl' : 'ltr'}
            prevBook={prevBook}
            nextBook={nextBook}
            goToPage={goToPage}
            goForward={goForward}
            goBackward={goBackward}
          />
        </div>
      )}

      {/* The end of the book: the next one, or back to the series. */}
      {ended && book && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={() => setEnded(false)}
        >
          <Card
            id="book-end"
            role="dialog"
            aria-labelledby="book-end-title"
            className="w-full max-w-sm gap-5"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Eyebrow as="p">End of {stripTitleZeros(book.title)}</Eyebrow>
            <Heading level={4} as="h2" id="book-end-title">
              {nextBook
                ? `Next: ${stripTitleZeros(nextBook.title)}`
                : 'That was the last one'}
            </Heading>
            {!nextBook && (
              <p className="m-0 text-sm text-muted-foreground">
                You've reached the end of what's here of this series.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {nextBook && (
                <Button
                  autoFocus
                  nativeButton={false}
                  render={
                    <Link
                      to="/read/$bookId"
                      params={{ bookId: nextBook.id }}
                      replace
                    />
                  }
                >
                  Read {stripTitleZeros(nextBook.title)}
                  <ArrowRightIcon />
                </Button>
              )}
              <Button
                variant="secondary"
                nativeButton={false}
                render={
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: book.series_id }}
                    replace
                    onClick={exit.onClick}
                  />
                }
              >
                Back to the series
              </Button>
              <Button variant="ghost" onClick={() => setEnded(false)}>
                Stay on this page
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function ChapterLink({
  label,
  onClick,
  className,
}: {
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <div className={cn('flex justify-center', className)}>
      <Button variant="secondary" size="sm" onClick={onClick}>
        {label}
      </Button>
    </div>
  )
}

/** Two floating toolbars, as the comic reader has: the book on the left, how it reads on the right. */
function EpubTopBar({
  book,
  currentPage,
  bookmarkCount,
  pageBookmarked,
  bookmarksOpen,
  hasContents,
  tocOpen,
  onBookmarks,
  onToc,
  text,
  onText,
  onSettingsOpenChange,
  keepScreenOn,
  onKeepScreenOn,
  fullscreen,
  onFullscreen,
}: {
  book: BookDetail
  currentPage: number
  bookmarkCount: number
  pageBookmarked: boolean
  bookmarksOpen: boolean
  hasContents: boolean
  tocOpen: boolean
  onBookmarks: () => void
  onToc: () => void
  text: TextPrefs
  onText: (text: Partial<TextPrefs>) => void
  onSettingsOpenChange: (open: boolean) => void
  keepScreenOn: boolean
  onKeepScreenOn: (on: boolean) => void
  fullscreen: boolean
  onFullscreen?: () => void
}) {
  const exit = useSeriesExit(book.series_id)
  const canKeepScreenOn =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator
  return (
    <div className="pointer-events-none flex items-start justify-between gap-3 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4">
      <Toolbar
        aria-label="Book"
        className="pointer-events-auto max-w-[min(32rem,58vw)] min-w-0 shadow-overlay!"
      >
        <ToolbarButton
          nativeButton={false}
          render={
            <Link
              to="/series/$seriesId"
              params={{ seriesId: book.series_id }}
              replace
              onClick={exit.onClick}
            />
          }
          aria-label="Back to the series"
        >
          <ArrowLeftIcon />
        </ToolbarButton>
        <div className="min-w-0 pr-2 pl-1">
          <p className="m-0 truncate text-[13px] leading-tight text-foreground">
            {stripTitleZeros(book.title)}
          </p>
          <p className="m-0 truncate font-mono text-[11px] leading-tight text-muted-foreground">
            {displaySeriesName(book.series_name)}
          </p>
        </div>
      </Toolbar>

      <Toolbar
        aria-label="Reader"
        className="pointer-events-auto shrink-0 shadow-overlay!"
      >
        <span
          className="px-2 font-mono text-xs whitespace-nowrap text-foreground-soft tabular-nums"
          aria-label={`Page ${currentPage} of ${book.page_count}`}
        >
          {currentPage}
          <span className="text-muted-foreground"> / {book.page_count}</span>
        </span>
        <ToolbarSeparator />
        <BadgeAnchor>
          <ToolbarButton
            aria-label={
              bookmarkCount
                ? `Bookmarks, ${bookmarkCount}${pageBookmarked ? ', this page is bookmarked' : ''}`
                : 'Bookmarks'
            }
            aria-pressed={bookmarksOpen}
            onClick={onBookmarks}
          >
            <BookmarkIcon
              className={pageBookmarked ? 'fill-current' : undefined}
            />
          </ToolbarButton>
          <Badge
            size="sm"
            count={bookmarkCount}
            variant="secondary"
            aria-hidden
          />
        </BadgeAnchor>
        {hasContents && (
          <ToolbarButton
            aria-label="Contents"
            aria-pressed={tocOpen}
            onClick={onToc}
          >
            <ListOrderedIcon />
          </ToolbarButton>
        )}
        {onFullscreen && (
          <ToolbarButton
            aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
            aria-pressed={fullscreen}
            onClick={onFullscreen}
            className="max-sm:hidden"
          >
            {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </ToolbarButton>
        )}
        <Menu onOpenChange={onSettingsOpenChange}>
          <ToolbarButton render={<MenuTrigger />} aria-label="Text settings">
            <SlidersHorizontalIcon />
          </ToolbarButton>
          <MenuContent
            align="end"
            className="max-h-[min(36rem,80dvh)] min-w-60 overflow-y-auto"
          >
            <TextChoice
              label="Layout"
              value={text.layout}
              options={[
                ['paged', 'Pages'],
                ['scroll', 'Scroll'],
              ]}
              onChange={(layout) => onText({ layout })}
            />
            <MenuSeparator />
            <TextChoice
              label="Text size"
              value={String(text.size)}
              options={SIZES.map((s) => [String(s.value), s.label])}
              onChange={(size) => onText({ size: Number(size) })}
            />
            <MenuSeparator />
            <TextChoice
              label="Font"
              value={text.font}
              options={[
                ['serif', 'Serif'],
                ['sans', 'Sans serif'],
                ['book', 'The book’s own'],
              ]}
              onChange={(font) => onText({ font })}
            />
            <MenuSeparator />
            <TextChoice
              label="Line spacing"
              value={text.lineHeight}
              options={[
                ['tight', 'Tight'],
                ['normal', 'Normal'],
                ['loose', 'Loose'],
              ]}
              onChange={(lineHeight) => onText({ lineHeight })}
            />
            <MenuSeparator />
            <TextChoice
              label="Margins"
              value={text.margins}
              options={[
                ['narrow', 'Narrow'],
                ['normal', 'Normal'],
                ['wide', 'Wide'],
              ]}
              onChange={(margins) => onText({ margins })}
            />
            <MenuSeparator />
            <TextChoice
              label="Colours"
              value={text.theme}
              options={[
                ['app', 'As the app'],
                ['paper', 'Paper'],
              ]}
              onChange={(theme) => onText({ theme })}
            />
            {canKeepScreenOn && (
              <>
                <MenuSeparator />
                <MenuCheckboxItem
                  checked={keepScreenOn}
                  onCheckedChange={onKeepScreenOn}
                >
                  <SunMediumIcon />
                  Keep the screen on
                </MenuCheckboxItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </Toolbar>
    </div>
  )
}

function TextChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<[T, string]>
  onChange: (value: T) => void
}) {
  return (
    <MenuGroup>
      <MenuGroupLabel>{label}</MenuGroupLabel>
      <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
        {options.map(([v, text]) => (
          <MenuRadioItem key={v} value={v}>
            {text}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuGroup>
  )
}

/** The book's own table of contents, nested as it is; the part being read is raised. */
function EpubTocPanel({
  open,
  onOpenChange,
  entries,
  here,
  pageOf,
  onGo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: EpubTocEntry[]
  here: number
  pageOf: (entry: EpubTocEntry) => number
  onGo: (entry: EpubTocEntry) => void
}) {
  const phone = useIsPhone()
  return (
    <Drawer
      side={phone ? 'bottom' : 'right'}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Contents</DrawerTitle>
          <DrawerDescription>The chapters in this book.</DrawerDescription>
        </DrawerHeader>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
          {entries.map((entry, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={entry.chapter < 0}
                aria-current={i === here ? 'true' : undefined}
                onClick={() => onGo(entry)}
                className="flex min-h-(--control-h) w-full cursor-pointer items-center gap-4 rounded-button px-3 text-left material-row focus-ring disabled:cursor-default disabled:opacity-50"
                style={{ paddingInlineStart: `${0.75 + entry.depth * 1}rem` }}
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {entry.label}
                </span>
                {entry.chapter >= 0 && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    p. {pageOf(entry)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </DrawerContent>
    </Drawer>
  )
}

/** How light a CSS colour is, from 0 to 1: from its lightness in oklch, oklab or lab, else its rgb. */
function luminance(color: string): number {
  const numbers = (color.match(/-?[\d.]+%?/g) ?? []).map((n) =>
    n.endsWith('%') ? Number(n.slice(0, -1)) / 100 : Number(n),
  )
  if (/^ok(lch|lab)\(/.test(color)) return numbers[0] ?? 1
  if (/^(lch|lab)\(/.test(color)) return (numbers[0] ?? 100) / 100
  const [r = 255, g = 255, b = 255] = numbers
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
