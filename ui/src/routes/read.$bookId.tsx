import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import {
  memo,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { Button, Card, Eyebrow, Heading, Skeleton, Spinner } from '@zonsh/ui'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  RotateCcwIcon,
} from 'lucide-react'
import {
  BookmarksPanel,
  ReaderBottomBar,
  ReaderTopBar,
  TocPanel,
} from '@/components/reader'
import {
  fetchBookDetail,
  fetchBooks,
  fetchProgress,
  updateProgress,
  getPageUrl,
  readerPageWidth,
  fetchBookmarks,
  createBookmark,
  deleteBookmark,
  fetchBookChapters,
  type BookDetail,
  type Book,
  type PartBook,
  type Bookmark,
  type BookChapter,
} from '@/lib/api'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { EpubReader } from '@/components/epub-reader'
import { queryClient, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { useReaderPrefs, type ReadMode, type FitMode } from '@/lib/reader-store'
import { useWakeLock } from '@/lib/use-wake-lock'
import {
  isBookDownloaded,
  getDownloadedPageUrl,
  getDownloadMeta,
} from '@/lib/downloads'
import { partName } from '@/lib/anilist'
import { buildSpreads, findSpread } from '@/lib/spreads'
import { useSeriesExit } from '@/lib/history-trail'
import { cn, stripTitleZeros } from '@/lib/utils'

export const Route = createFileRoute('/read/$bookId')({
  component: ReaderPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    ...(typeof search.page === 'number' ? { page: search.page } : {}),
  }),
})

/**
 * A comic's pages, or a novel's text: the book's format decides, once it's known. Moving from
 * one comic to the next keeps the comic reader, and its settings, in place.
 */
function ReaderPage() {
  const { bookId } = Route.useParams()
  const { page } = Route.useSearch()
  const format = useQuery({
    queryKey: queryKeys.bookFormat(bookId),
    queryFn: () =>
      fetchBookDetail(bookId)
        .then((detail) => detail.format ?? 'cbz')
        .catch(async () => (await getDownloadMeta(bookId))?.format ?? 'cbz'),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
  const epub = format.data === 'epub'
  if (format.isPlaceholderData ? epub : !format.data) {
    return <div className="h-dvh" />
  }
  return epub ? (
    <EpubReader key={bookId} bookId={bookId} initialPage={page} />
  ) : (
    <ComicReader />
  )
}

function ComicReader() {
  const { bookId } = Route.useParams()
  const currentBookId = useRef(bookId)
  useEffect(() => {
    currentBookId.current = bookId
  }, [bookId])
  const { page: initialPage } = Route.useSearch()
  const navigate = useNavigate()
  const setReaderActive = useAppStore((s) => s.setReaderActive)

  const [book, setBook] = useState<BookDetail | null>(null)
  const exit = useSeriesExit(book?.series_id ?? '')
  const [siblings, setSiblings] = useState<Book[]>([])
  // The books of the parts either side, when the series is a part of a story group
  const [partBooks, setPartBooks] = useState<{
    story: string
    prev: PartBook | null
    next: PartBook | null
  }>({ story: '', prev: null, next: null })
  const [currentPage, setCurrentPage] = useState(1)

  // Reader prefs from persisted store (Task 54)
  const readerPrefs = useReaderPrefs()
  const [readMode, setReadModeLocal] = useState<ReadMode>(readerPrefs.readMode)
  const [fitMode, setFitModeLocal] = useState<FitMode>(readerPrefs.fitMode)

  // Per-series direction (Task 55) — falls back to global default
  const seriesIdRef = useRef<string>('')
  const [direction, setDirectionLocal] = useState(readerPrefs.direction)

  // Sync local state with store and persist changes
  const setReadMode = useCallback(
    (mode: ReadMode) => {
      setReadModeLocal(mode)
      readerPrefs.setReadMode(mode)
    },
    [readerPrefs],
  )
  const setFitMode = useCallback(
    (mode: FitMode) => {
      setFitModeLocal(mode)
      readerPrefs.setFitMode(mode)
    },
    [readerPrefs],
  )
  const setDirection = useCallback(
    (dir: 'ltr' | 'rtl') => {
      setDirectionLocal(dir)
      // Save as per-series override when in a series context
      if (seriesIdRef.current) {
        readerPrefs.setSeriesDirection(seriesIdRef.current, dir)
      } else {
        readerPrefs.setDirection(dir)
      }
    },
    [readerPrefs],
  )

  useWakeLock(readerPrefs.keepScreenOn)

  // Past the last page in the paged modes: the book is done, the next one offered.
  const [ended, setEnded] = useState(false)

  // Full screen, where the browser has it (not iPhone Safari).
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

  const [showUI, setShowUI] = useState(true)
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set())
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())
  const [retries, setRetries] = useState<Record<number, number>>({})

  // Dynamic aspect ratio from first loaded page (default 2/3)
  const pageAspectRatio = useRef('2/3')

  // Double-page spread: track which pages are wide (landscape)
  const [widePages, setWidePages] = useState<Set<number>>(new Set())
  const markWide = useCallback((page: number) => {
    setWidePages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)))
  }, [])
  const spreads = useMemo(
    () =>
      book && readMode === 'double'
        ? buildSpreads(book.page_count, widePages)
        : [],
    [book, readMode, widePages],
  )
  const spreadIndex = findSpread(spreads, currentPage)
  /** The pages on screen in two-page mode. */
  const spread = spreads[spreadIndex] ?? [currentPage]

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [addingBookmark, setAddingBookmark] = useState(false)

  // Chapters (TOC)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [showToc, setShowToc] = useState(false)

  // While a panel or the settings menu is open, the keyboard belongs to it.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const overlayOpen = showBookmarks || showToc || settingsOpen

  // Offline page URLs (IDB blob URLs for downloaded books). The ref holds every URL made for
  // the open book, so each page is read from IndexedDB once and all are let go with the book.
  const [offlineUrls, setOfflineUrls] = useState<Map<string, string>>(new Map())
  const offlineUrlsRef = useRef<Map<string, string>>(new Map())
  const isOfflineBook = useRef(false)

  // Resolve page URL: IDB blob first, then server
  const resolvePageUrl = useCallback(
    (bid: string, page: number) => {
      const key = `${bid}-${page}`
      const version = bid === book?.id ? book.version : undefined
      return (
        offlineUrls.get(key) ||
        getPageUrl(bid, page, version, readerPageWidth())
      )
    },
    [offlineUrls, book],
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  /** The page the book opened on: in scroll mode the pages around it load first. */
  const startPage = useRef(1)
  /**
   * Whether scroll mode has reached the page the book opened on. Until then the pages above it
   * would be on screen for a moment, and the browser would fetch them first.
   */
  const [positioned, setPositioned] = useState(false)
  const pagedRef = useRef<HTMLDivElement>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to top whenever bookId changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }, [bookId])

  // Check if book is downloaded and preload IDB blob URLs
  useEffect(() => {
    let cancelled = false
    const urls = new Map<string, string>()
    offlineUrlsRef.current = urls
    async function loadOfflinePages() {
      const downloaded = await isBookDownloaded(bookId)
      if (!downloaded || cancelled) {
        if (!cancelled) isOfflineBook.current = false
        return
      }
      isOfflineBook.current = true
      // Load pages 1-10 upfront for instant rendering; the rest load lazily
      const preloadCount = 10
      for (let p = 1; p <= preloadCount; p++) {
        const url = await getDownloadedPageUrl(bookId, p)
        if (!url) continue
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        urls.set(`${bookId}-${p}`, url)
      }
      if (!cancelled) setOfflineUrls(new Map(urls))
    }
    loadOfflinePages()
    return () => {
      cancelled = true
      // The pages on screen are this book's, and the next book brings its own.
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      setOfflineUrls(new Map())
    }
  }, [bookId])

  // Mark reader as active
  useEffect(() => {
    setReaderActive(true)
    return () => {
      setReaderActive(false)
      // The last page saves half a second after it shows; then the shelves catch up.
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

  // Load book data
  useEffect(() => {
    let cancelled = false
    setBook(null)
    setPositioned(false)
    setEnded(false)
    setLoadedPages(new Set())
    setFailedPages(new Set())
    setRetries({})
    setWidePages(new Set())
    pageAspectRatio.current = '2/3'
    setBookmarks([])
    async function load() {
      try {
        // The book and where the reader left off arrive together, and the reader shows them
        // together: the first page asked for is the one it opens on.
        const [detail, prog] = await Promise.all([
          fetchBookDetail(bookId),
          fetchProgress(bookId),
        ])
        if (cancelled) return
        const savedPage = initialPage ?? (prog && prog.page > 0 ? prog.page : 1)
        startPage.current = savedPage
        setCurrentPage(savedPage)
        setBook(detail)
        // Known from the scan, so spreads are right before any image loads
        setWidePages(
          new Set(
            (detail.page_sizes ?? []).flatMap((size, i) =>
              size && size[0] > size[1] ? [i + 1] : [],
            ),
          ),
        )
        setLoadedPages(new Set())
        setFailedPages(new Set())
        pageAspectRatio.current = '2/3'

        // Apply per-series direction override (Task 55)
        seriesIdRef.current = detail.series_id
        const effectiveDir = readerPrefs.getEffectiveDirection(detail.series_id)
        setDirectionLocal(effectiveDir)

        // Scroll mode goes to the saved page as soon as the pages are laid out
        if (savedPage > 1) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = scrollRef.current?.querySelector(
                `[data-page="${savedPage}"]`,
              )
              if (el) {
                el.scrollIntoView({ behavior: 'instant', block: 'start' })
              }
              setPositioned(true)
            })
          })
        } else {
          setPositioned(true)
        }

        const [booksData, bmarks, chaptersData] = await Promise.all([
          fetchBooks(detail.series_id),
          fetchBookmarks(bookId).catch(() => [] as Bookmark[]),
          fetchBookChapters(bookId).catch(() => ({
            book_id: bookId,
            chapters: [] as BookChapter[],
          })),
        ])
        if (cancelled) return

        setSiblings(booksData.books)
        setPartBooks({
          story: booksData.group?.name ?? '',
          prev: booksData.group?.prev_part_book ?? null,
          next: booksData.group?.next_part_book ?? null,
        })
        setBookmarks(bmarks)
        setChapters(chaptersData.chapters)
      } catch (err) {
        console.error('Failed to load book:', err)
        // Offline fallback: try loading from IDB metadata
        const meta = await getDownloadMeta(bookId)
        if (meta && !cancelled) {
          isOfflineBook.current = true
          setBook({
            id: meta.bookId,
            title: meta.title,
            series_id: meta.seriesId,
            series_name: meta.seriesName,
            page_count: meta.pageCount,
            file_size: meta.totalSize,
            metadata: { writer: null, year: null, summary: null },
          })
          setCurrentPage(1)
          setSiblings([])
          setPartBooks({ story: '', prev: null, next: null })
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [bookId])

  // Save progress (debounced)
  const saveProgress = useCallback(
    (page: number) => {
      if (progressTimer.current) clearTimeout(progressTimer.current)
      progressTimer.current = setTimeout(() => {
        if (!book) return
        // In two-page mode the right-hand page is read too: the last spread finishes the book.
        const shown = spreads[findSpread(spreads, page)]
        const lastShown = shown ? shown[shown.length - 1] : page
        const isCompleted = lastShown >= book.page_count
        updateProgress(
          bookId,
          isCompleted ? book.page_count : page,
          isCompleted,
        ).catch(() => {})
      }, 500)
    },
    [book, bookId, spreads],
  )

  // Handle page change
  const goToPage = useCallback(
    (page: number) => {
      if (!book) return
      const clamped = Math.max(1, Math.min(page, book.page_count))
      setCurrentPage(clamped)
      saveProgress(clamped)

      // In scroll mode, scroll to the page element
      if (readMode === 'scroll' && scrollRef.current) {
        requestAnimationFrame(() => {
          const el = scrollRef.current?.querySelector(
            `[data-page="${clamped}"]`,
          )
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      }
    },
    [book, saveProgress, readMode],
  )

  // Navigation — always: forward = higher page, backward = lower page
  // Direction swapping is handled at the input level (keyboard, clicks, buttons)
  const goForward = useCallback(() => {
    if (!book) return
    // Two-page mode moves a spread at a time; a wide page is a spread of its own.
    const next =
      readMode === 'double'
        ? (spreads[spreadIndex + 1]?.[0] ?? book.page_count + 1)
        : currentPage + 1
    if (next > book.page_count) {
      // Past the end of a paged book: it's finished, whatever spread it ended on.
      if (readMode !== 'scroll') {
        // A page save still waiting would land after this one and un-finish the book.
        if (progressTimer.current) clearTimeout(progressTimer.current)
        setEnded(true)
        updateProgress(bookId, book.page_count, true).catch(() => {})
      }
      return
    }
    goToPage(next)
  }, [book, bookId, currentPage, goToPage, readMode, spreads, spreadIndex])

  const goBackward = useCallback(() => {
    if (ended) {
      setEnded(false)
      return
    }
    goToPage(
      readMode === 'double'
        ? (spreads[spreadIndex - 1]?.[0] ?? 1)
        : currentPage - 1,
    )
  }, [currentPage, ended, goToPage, readMode, spreads, spreadIndex])

  // The books on either side, for the bars, the end of a book and the [ ] keys. Past the
  // first or last book of a part of a story, the part before or after.
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

  // B toggles this page's bookmark; set once the bookmark handlers below exist.
  const toggleBookmarkRef = useRef<() => void>(() => {})

  // Paged modes: a new page starts at its top.
  useEffect(() => {
    pagedRef.current?.scrollTo(0, 0)
  }, [currentPage])

  // Scroll mode: track which page is visible
  useEffect(() => {
    if (readMode !== 'scroll' || !scrollRef.current || !book) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const page = parseInt(entry.target.getAttribute('data-page') || '1')
            setCurrentPage(page)
            saveProgress(page)
          }
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
      },
    )

    const images = scrollRef.current.querySelectorAll('[data-page]')
    images.forEach((img) => observer.observe(img))

    return () => observer.disconnect()
  }, [readMode, book, saveProgress])

  // Preload adjacent pages (and lazily resolve IDB URLs)
  useEffect(() => {
    if (!book) return
    const toPreload = [
      currentPage + 1,
      currentPage + 2,
      currentPage + 3,
      currentPage + 4,
      currentPage + 5,
      currentPage - 1,
      currentPage - 2,
    ].filter((p) => p >= 1 && p <= book.page_count)

    // For offline books, lazily resolve IDB blob URLs
    if (isOfflineBook.current) {
      const urls = offlineUrlsRef.current
      ;(async () => {
        let changed = false
        for (const p of [currentPage, ...toPreload]) {
          const key = `${bookId}-${p}`
          if (urls.has(key)) continue
          const url = await getDownloadedPageUrl(bookId, p)
          if (!url) continue
          // The book was closed meanwhile, or another pass got here first
          if (urls !== offlineUrlsRef.current || urls.has(key)) {
            URL.revokeObjectURL(url)
            continue
          }
          urls.set(key, url)
          changed = true
        }
        if (changed && urls === offlineUrlsRef.current) {
          setOfflineUrls(new Map(urls))
        }
      })()
    } else {
      for (const p of toPreload) {
        const img = new Image()
        // Two-page mode pairs pages by their shape: knowing the wide ones ahead keeps the
        // spreads from shifting when they come on screen.
        if (readMode === 'double') {
          img.onload = () => {
            if (
              img.naturalWidth > img.naturalHeight &&
              currentBookId.current === bookId
            ) {
              markWide(p)
            }
          }
        }
        img.src = resolvePageUrl(bookId, p)
      }
    }
  }, [
    readMode,
    currentPage,
    book,
    bookId,
    resolvePageUrl,
    offlineUrls,
    markWide,
  ])

  // Prefetch the next book's first pages (only when online), once this book's pages have had a
  // head start: at the addresses the next book will open with, so the browser has them then.
  useEffect(() => {
    if (siblings.length === 0 || isOfflineBook.current) return
    const idx = siblings.findIndex((b) => b.id === bookId)
    if (idx < 0 || idx >= siblings.length - 1) return
    const nextId = siblings[idx + 1].id
    let cancelled = false
    const timer = setTimeout(() => {
      fetchBookDetail(nextId)
        .then((next) => {
          if (cancelled) return
          for (let p = 1; p <= 3; p++) {
            const img = new Image()
            img.src = getPageUrl(nextId, p, next.version, readerPageWidth())
          }
        })
        .catch(() => {})
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [siblings, bookId])

  // Keyboard navigation
  useEffect(() => {
    const openBook = (target: Book | null) => {
      // Book to book replaces: the reader is one stop in the history, however many books it spans.
      if (target)
        navigate({
          to: '/read/$bookId',
          params: { bookId: target.id },
          replace: true,
        })
    }
    const handleKey = (e: KeyboardEvent) => {
      if (!book || overlayOpen || e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Typing in search, or a dialog over the reader, keeps its keys.
      if (useAppStore.getState().commandPaletteOpen) return
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return
      const dialog = target?.closest('[role="dialog"], [role="alertdialog"]')
      if (dialog && dialog.id !== 'book-end') return
      const forward =
        e.key === ' ' ||
        e.key === (direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight')
      const backward =
        e.key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')

      // At the end of a book: on to the next one, or back into this one. A held key stops
      // here, and Space presses the card's focused button rather than skipping past it.
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

      if (readMode === 'single' || readMode === 'double') {
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
      }
      switch (e.key) {
        case 'Home':
          e.preventDefault()
          goToPage(1)
          break
        case 'End':
          e.preventDefault()
          goToPage(book.page_count)
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
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    book,
    overlayOpen,
    readMode,
    direction,
    ended,
    goForward,
    goBackward,
    goToPage,
    prevBook,
    nextBook,
    toggleFullscreen,
    navigate,
    exit.leave,
  ])

  // Touch swipe navigation (single & double page modes)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchStartTime = useRef<number>(0)
  const swipeHandled = useRef(false)

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (readMode === 'scroll') return
      const touch = e.touches[0]
      touchStartX.current = touch.clientX
      touchStartY.current = touch.clientY
      touchStartTime.current = Date.now()
      swipeHandled.current = false
    },
    [readMode],
  )

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      if (
        readMode === 'scroll' ||
        touchStartX.current === null ||
        touchStartY.current === null ||
        swipeHandled.current
      ) {
        touchStartX.current = null
        touchStartY.current = null
        return
      }
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartX.current
      const deltaY = touch.clientY - touchStartY.current
      const elapsed = Date.now() - touchStartTime.current

      // Only register horizontal swipes: min 50px, mostly horizontal, within 500ms
      if (
        Math.abs(deltaX) > 50 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
        elapsed < 500
      ) {
        swipeHandled.current = true
        // The page follows the finger: right to left, the next page comes in from the left.
        const swipedLeft = deltaX < 0
        if (swipedLeft === (direction === 'ltr')) goForward()
        else goBackward()
      }

      touchStartX.current = null
      touchStartY.current = null
    },
    [readMode, direction, goForward, goBackward],
  )

  // Auto-hide UI — paused while the pointer is over the controls
  const uiHovered = useRef(false)
  const showUITemporarily = useCallback(() => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (!uiHovered.current) {
      hideTimer.current = setTimeout(() => setShowUI(false), 3000)
    }
  }, [])
  const pauseHideTimer = useCallback(() => {
    uiHovered.current = true
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])
  const resumeHideTimer = useCallback(() => {
    uiHovered.current = false
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowUI(false), 3000)
  }, [])
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  // Bookmark actions
  const handleAddBookmark = async () => {
    if (addingBookmark) return
    setAddingBookmark(true)
    try {
      const bm = await createBookmark(bookId, currentPage)
      // The reader may have moved on to another book while this was saving.
      if (bm.book_id !== currentBookId.current) return
      // The server answers with the stored row, which may already be listed.
      setBookmarks((prev) => [
        ...prev.filter((b) => b.id !== bm.id && b.page !== bm.page),
        bm,
      ])
    } catch {
    } finally {
      setAddingBookmark(false)
    }
  }

  const handleDeleteBookmark = async (bmId: string) => {
    try {
      await deleteBookmark(bmId)
      setBookmarks((prev) => prev.filter((b) => b.id !== bmId))
    } catch {}
  }

  const isCurrentPageBookmarked = bookmarks.some((b) => b.page === currentPage)
  toggleBookmarkRef.current = () => {
    const mark = bookmarks.find((b) => b.page === currentPage)
    if (mark) void handleDeleteBookmark(mark.id)
    else void handleAddBookmark()
  }

  // Fit mode classes
  const getFitClass = () => {
    switch (fitMode) {
      case 'width':
        return 'w-full max-w-3xl mx-auto'
      case 'height':
        return 'max-h-[calc(100dvh-6rem)] mx-auto'
      case 'original':
        return 'mx-auto'
    }
  }

  const retryPage = useCallback((page: number) => {
    setFailedPages((prev) => {
      const next = new Set(prev)
      next.delete(page)
      return next
    })
    setRetries((prev) => ({ ...prev, [page]: (prev[page] ?? 0) + 1 }))
  }, [])

  const markLoaded = useCallback(
    (page: number, width: number, height: number) => {
      if (width && height && pageAspectRatio.current === '2/3') {
        pageAspectRatio.current = `${width}/${height}`
      }
      setLoadedPages((prev) =>
        prev.has(page) ? prev : new Set(prev).add(page),
      )
    },
    [],
  )
  const markFailed = useCallback((page: number) => {
    setFailedPages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)))
  }, [])

  const bookmarkedPages = useMemo(
    () => new Set(bookmarks.map((b) => b.page)),
    [bookmarks],
  )

  /** In the paged modes, the page that didn't load and a way to ask for it again. */
  const failedNotice = (pages: number[]) => {
    const failed = pages.filter((p) => failedPages.has(p))
    if (failed.length === 0) return null
    return (
      <div
        className="absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="m-0 font-mono text-xs">
          {failed.length === 1
            ? `Page ${failed[0]} didn't load`
            : `Pages ${failed.join(' and ')} didn't load`}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => failed.forEach(retryPage)}
        >
          <RotateCcwIcon />
          Try again
        </Button>
      </div>
    )
  }

  /** A page's address, with a counter after a retry so the browser asks again. */
  const pageSrc = (page: number) => {
    const url = resolvePageUrl(bookId, page)
    const retry = retries[page]
    if (!retry || url.startsWith('blob:')) return url
    return `${url}${url.includes('?') ? '&' : '?'}retry=${retry}`
  }

  if (!book) {
    return (
      <div className="flex h-dvh items-center justify-center" aria-busy="true">
        <span className="sr-only">Opening the book…</span>
        <div className="flex w-56 flex-col items-center gap-4 sm:w-72">
          <Skeleton
            shape="item"
            className="w-full rounded-none"
            style={{ aspectRatio: '2/3' }}
          />
          <Skeleton shape="text" className="w-32" />
        </div>
      </div>
    )
  }

  const progressPct = Math.round((currentPage / book.page_count) * 100)
  const paged = readMode === 'single' || readMode === 'double'

  const bookmarkMark = (
    <span
      className="absolute top-14 right-4 z-10 flex size-8 items-center justify-center rounded-full material-raised"
      aria-label="This page is bookmarked"
    >
      <BookmarkIcon className="size-4 fill-current" />
    </span>
  )

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      onPointerMove={(e) => {
        // Only a mouse reveals the controls by moving; a tap toggles them (below).
        if (e.pointerType === 'mouse') showUITemporarily()
      }}
      onFocusCapture={() => setShowUI(true)}
      onClick={() => setShowUI((p) => !p)}
    >
      {/* Reading progress: a hairline along the top, from the side reading starts. */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex h-0.5',
          direction === 'rtl' && 'justify-end',
        )}
        aria-hidden
      >
        <div
          className="h-full bg-foreground/80 transition-[width] duration-300 ease-(--ease)"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* The controls float over the page and step back while reading. */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 transition-[opacity,translate] duration-(--duration-reveal) ease-(--ease)',
          showUI
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={pauseHideTimer}
        onMouseLeave={resumeHideTimer}
      >
        <ReaderTopBar
          book={book}
          currentPage={currentPage}
          bookmarkCount={bookmarks.length}
          pageBookmarked={isCurrentPageBookmarked}
          bookmarksOpen={showBookmarks}
          hasChapters={chapters.length > 0}
          tocOpen={showToc}
          readMode={readMode}
          fitMode={fitMode}
          direction={direction}
          onBookmarks={() => {
            setShowToc(false)
            setShowBookmarks((p) => !p)
          }}
          onToc={() => {
            setShowBookmarks(false)
            setShowToc((p) => !p)
          }}
          onReadMode={setReadMode}
          onFitMode={setFitMode}
          onDirection={setDirection}
          onSettingsOpenChange={setSettingsOpen}
          keepScreenOn={readerPrefs.keepScreenOn}
          onKeepScreenOn={readerPrefs.setKeepScreenOn}
          fullscreen={fullscreen}
          onFullscreen={
            document.fullscreenEnabled ? toggleFullscreen : undefined
          }
        />
      </div>

      {/* The panels render in a portal; their clicks still bubble here through React. */}
      <div onClick={(e) => e.stopPropagation()}>
        <BookmarksPanel
          open={showBookmarks}
          onOpenChange={setShowBookmarks}
          bookmarks={bookmarks}
          currentPage={currentPage}
          isCurrentPageBookmarked={isCurrentPageBookmarked}
          adding={addingBookmark}
          onAddBookmark={handleAddBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          onGoToPage={(page) => {
            goToPage(page)
            setShowBookmarks(false)
          }}
        />

        <TocPanel
          open={showToc}
          onOpenChange={setShowToc}
          chapters={chapters}
          currentPage={currentPage}
          onGoToPage={(page) => {
            goToPage(page)
            setShowToc(false)
          }}
        />
      </div>

      {/* Reader content */}
      {readMode === 'scroll' ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <ChapterNav
            prevBook={prevBook}
            nextBook={nextBook}
            className="pt-[calc(4.5rem+env(safe-area-inset-top,0px))] pb-6"
          />

          <div className="mx-auto max-w-4xl">
            {Array.from({ length: book.page_count }, (_, i) => i + 1).map(
              (page) => {
                const nearStart =
                  page >= startPage.current - 1 && page <= startPage.current + 3
                const loaded = loadedPages.has(page)
                return (
                  <ScrollPage
                    key={page}
                    page={page}
                    src={positioned || nearStart ? pageSrc(page) : undefined}
                    eager={nearStart}
                    retry={retries[page] ?? 0}
                    loaded={loaded}
                    failed={failedPages.has(page)}
                    bookmarked={bookmarkedPages.has(page)}
                    fitClass={getFitClass()}
                    fitMode={fitMode}
                    size={book.page_sizes?.[page - 1]}
                    fallbackRatio={pageAspectRatio.current}
                    onLoaded={markLoaded}
                    onFailed={markFailed}
                    onRetry={retryPage}
                  />
                )
              },
            )}
          </div>

          <ChapterNav
            prevBook={prevBook}
            nextBook={nextBook}
            end
            className="pt-10 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]"
          />
        </div>
      ) : (
        /* Paged modes scroll on their own: a page fit to the width can be taller than the
           screen. The tap zones span the whole page, so wheel and touch scroll over them too. */
        <div ref={pagedRef} className="min-h-0 flex-1 overflow-y-auto">
          {readMode === 'double' ? (
            /* Double page spread mode */
            <div
              className={cn(
                'relative flex min-h-full items-center justify-center gap-1 pt-12',
                direction === 'rtl' && 'flex-row-reverse',
              )}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* The spread's pages: two, or a wide page alone. A page found to be wide
                  re-pairs the spreads, and it moves to a spread of its own. */}
              {spread.map((page) => (
                <img
                  key={`${page}-${retries[page] ?? 0}`}
                  src={pageSrc(page)}
                  alt={`Page ${page}`}
                  className="max-h-[calc(100dvh-6rem)] max-w-[49%] object-contain"
                  onError={() => markFailed(page)}
                  onLoad={(e) => {
                    const img = e.currentTarget
                    if (img.naturalWidth > img.naturalHeight) markWide(page)
                  }}
                />
              ))}

              {isCurrentPageBookmarked && bookmarkMark}
              {failedNotice(spread)}

              <PageZones
                width="w-1/4"
                direction={direction}
                goForward={goForward}
                goBackward={goBackward}
              />
            </div>
          ) : (
            /* Single page mode */
            <div
              className={cn(
                'relative flex min-h-full items-center justify-center pt-12',
                direction === 'rtl' && 'flex-row-reverse',
              )}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img
                key={`${currentPage}-${retries[currentPage] ?? 0}`}
                src={pageSrc(currentPage)}
                alt={`Page ${currentPage}`}
                className={cn(
                  'max-w-full object-contain',
                  fitMode === 'width'
                    ? 'w-full'
                    : fitMode === 'height' &&
                        'h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)]',
                )}
                onError={() =>
                  setFailedPages((prev) => new Set(prev).add(currentPage))
                }
              />

              {isCurrentPageBookmarked && bookmarkMark}
              {failedNotice([currentPage])}

              <PageZones
                width="w-1/3"
                direction={direction}
                goForward={goForward}
                goBackward={goBackward}
              />
            </div>
          )}
        </div>
      )}

      {/* Bottom bar (single/double mode) */}
      {paged && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 transition-[opacity,translate] duration-(--duration-reveal) ease-(--ease)',
            showUI
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={pauseHideTimer}
          onMouseLeave={resumeHideTimer}
        >
          <ReaderBottomBar
            book={book}
            currentPage={currentPage}
            direction={direction}
            prevBook={prevBook}
            nextBook={nextBook}
            goToPage={goToPage}
            goForward={goForward}
            goBackward={goBackward}
          />
        </div>
      )}

      {/* The end of a paged book: the next one, or back to the series. */}
      {ended && paged && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation()
            setEnded(false)
          }}
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
                  <ArrowRightIcon
                    className={direction === 'rtl' ? '-scale-x-100' : undefined}
                  />
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

/** Invisible tap zones on either side of a page: the side the reading goes towards turns forward. */
/**
 * One page of scroll mode. Memoised: a long book has hundreds, and the reader re-renders on
 * every page turn and every page that loads, which only touches the pages it concerns.
 */
/**
 * The space a page takes before it loads: the box its image will fill under the fit mode (see
 * getFitClass), from its size in the scan, so the view stays still as pages above it load.
 * Without a size, the shape of the first page loaded, at full width.
 */
function placeholderStyle(
  fitMode: FitMode,
  size: [number, number] | null | undefined,
  fallbackRatio: string,
): CSSProperties {
  if (!size) return { aspectRatio: fallbackRatio }
  const [width, height] = size
  const shape = { aspectRatio: `${width}/${height}`, marginInline: 'auto' }
  switch (fitMode) {
    case 'width':
      return { ...shape, width: '100%', maxWidth: '48rem' }
    case 'height':
      return {
        ...shape,
        height: `min(${height}px, calc(100dvh - 6rem))`,
        width: 'auto',
        maxWidth: '100%',
      }
    case 'original':
      return { ...shape, width: `${width}px`, maxWidth: '100%' }
  }
}

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

const ScrollPage = memo(function ScrollPage({
  page,
  src,
  eager,
  retry,
  loaded,
  failed,
  bookmarked,
  fitClass,
  fitMode,
  size,
  fallbackRatio,
  onLoaded,
  onFailed,
  onRetry,
}: {
  page: number
  /** Undefined until the page may load. */
  src: string | undefined
  eager: boolean
  /** Bumped by "Try again", so the image is made anew. */
  retry: number
  loaded: boolean
  failed: boolean
  bookmarked: boolean
  fitClass: string | undefined
  fitMode: FitMode
  /** The page's size from the scan, which sets the space it takes before it loads. */
  size: [number, number] | null | undefined
  /** The shape for a page of unknown size. */
  fallbackRatio: string
  onLoaded: (page: number, width: number, height: number) => void
  onFailed: (page: number) => void
  onRetry: (page: number) => void
}) {
  return (
    <div
      data-page={page}
      className="relative w-full"
      style={
        loaded ? undefined : placeholderStyle(fitMode, size, fallbackRatio)
      }
    >
      <img
        key={retry}
        src={src}
        alt={`Page ${page}`}
        className={cn(
          fitClass,
          'block',
          loaded
            ? 'relative'
            : 'absolute inset-0 h-full w-full object-contain opacity-0',
        )}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={(e) =>
          onLoaded(
            page,
            e.currentTarget.naturalWidth,
            e.currentTarget.naturalHeight,
          )
        }
        onError={() => onFailed(page)}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          {failed ? (
            <div
              className="flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="m-0 font-mono text-xs">Page {page} didn't load</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRetry(page)}
              >
                <RotateCcwIcon />
                Try again
              </Button>
            </div>
          ) : (
            <Spinner label={`Loading page ${page}`} />
          )}
        </div>
      )}
      {bookmarked && (
        <span
          className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full material-raised"
          aria-label="This page is bookmarked"
        >
          <BookmarkIcon className="size-4 fill-current" />
        </span>
      )}
    </div>
  )
})

function PageZones({
  width,
  direction,
  goForward,
  goBackward,
}: {
  width: string
  direction: 'ltr' | 'rtl'
  goForward: () => void
  goBackward: () => void
}) {
  const left = direction === 'rtl' ? goForward : goBackward
  const right = direction === 'rtl' ? goBackward : goForward
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        className={cn(
          'absolute top-12 bottom-0 left-0 cursor-w-resize opacity-0',
          width,
        )}
        onClick={(e) => {
          e.stopPropagation()
          left()
        }}
        aria-label={direction === 'rtl' ? 'Next page' : 'Previous page'}
      />
      <button
        type="button"
        tabIndex={-1}
        className={cn(
          'absolute top-12 right-0 bottom-0 cursor-e-resize opacity-0',
          width,
        )}
        onClick={(e) => {
          e.stopPropagation()
          right()
        }}
        aria-label={direction === 'rtl' ? 'Previous page' : 'Next page'}
      />
    </>
  )
}

/** The neighbouring books, above and below the pages in scroll mode. */
function ChapterNav({
  prevBook,
  nextBook,
  end,
  className,
}: {
  prevBook: Book | null
  nextBook: Book | null
  /** After the last page: the next book is the way on. */
  end?: boolean
  className?: string
}) {
  if (!prevBook && !nextBook && !end) return null
  return (
    <nav
      aria-label={end ? 'After this book' : 'Before this book'}
      className={cn(
        'flex flex-wrap items-center justify-center gap-3 px-4',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {prevBook && (
        <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={
            <Link to="/read/$bookId" params={{ bookId: prevBook.id }} replace />
          }
        >
          <ArrowLeftIcon />
          {stripTitleZeros(prevBook.title)}
        </Button>
      )}
      {nextBook ? (
        <Button
          variant={end ? 'primary' : 'secondary'}
          size={end ? 'default' : 'sm'}
          nativeButton={false}
          render={
            <Link to="/read/$bookId" params={{ bookId: nextBook.id }} replace />
          }
        >
          {end
            ? `Continue to ${stripTitleZeros(nextBook.title)}`
            : stripTitleZeros(nextBook.title)}
          <ArrowRightIcon />
        </Button>
      ) : (
        end && <Eyebrow as="p">End of the series</Eyebrow>
      )}
    </nav>
  )
}
