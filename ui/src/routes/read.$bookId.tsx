import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import {
  useState,
  useEffect,
  useCallback,
  useRef,
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
  fetchBookmarks,
  createBookmark,
  deleteBookmark,
  fetchBookChapters,
  type BookDetail,
  type Book,
  type Bookmark,
  type BookChapter,
} from '@/lib/api'
import { queryClient, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { useReaderPrefs, type ReadMode, type FitMode } from '@/lib/reader-store'
import { useWakeLock } from '@/lib/use-wake-lock'
import {
  isBookDownloaded,
  getDownloadedPageUrl,
  getDownloadMeta,
} from '@/lib/downloads'
import { cn, stripTitleZeros } from '@/lib/utils'

export const Route = createFileRoute('/read/$bookId')({
  component: ReaderPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    ...(typeof search.page === 'number' ? { page: search.page } : {}),
  }),
})

function ReaderPage() {
  const { bookId } = Route.useParams()
  const currentBookId = useRef(bookId)
  useEffect(() => {
    currentBookId.current = bookId
  }, [bookId])
  const { page: initialPage } = Route.useSearch()
  const navigate = useNavigate()
  const setReaderActive = useAppStore((s) => s.setReaderActive)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [siblings, setSiblings] = useState<Book[]>([])
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

  // Offline page URLs (IDB blob URLs for downloaded books)
  const [offlineUrls, setOfflineUrls] = useState<Map<string, string>>(new Map())
  const isOfflineBook = useRef(false)

  // Resolve page URL: IDB blob first, then server
  const resolvePageUrl = useCallback(
    (bid: string, page: number) => {
      const key = `${bid}-${page}`
      return offlineUrls.get(key) || getPageUrl(bid, page)
    },
    [offlineUrls],
  )

  const scrollRef = useRef<HTMLDivElement>(null)
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
    async function loadOfflinePages() {
      const downloaded = await isBookDownloaded(bookId)
      if (!downloaded || cancelled) {
        isOfflineBook.current = false
        return
      }
      isOfflineBook.current = true
      // Load pages 1-10 upfront for instant rendering; the rest load lazily
      const urls = new Map<string, string>()
      const preloadCount = 10
      for (let p = 1; p <= preloadCount; p++) {
        const url = await getDownloadedPageUrl(bookId, p)
        if (url && !cancelled) urls.set(`${bookId}-${p}`, url)
      }
      if (!cancelled) setOfflineUrls(new Map(urls))
    }
    loadOfflinePages()
    return () => {
      cancelled = true
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
    setEnded(false)
    setLoadedPages(new Set())
    setFailedPages(new Set())
    setRetries({})
    pageAspectRatio.current = '2/3'
    setBookmarks([])
    async function load() {
      try {
        const detail = await fetchBookDetail(bookId)
        if (cancelled) return
        setBook(detail)
        setLoadedPages(new Set())
        setFailedPages(new Set())
        pageAspectRatio.current = '2/3'

        // Apply per-series direction override (Task 55)
        seriesIdRef.current = detail.series_id
        const effectiveDir = readerPrefs.getEffectiveDirection(detail.series_id)
        setDirectionLocal(effectiveDir)

        const [prog, booksData, bmarks, chaptersData] = await Promise.all([
          fetchProgress(bookId),
          fetchBooks(detail.series_id),
          fetchBookmarks(bookId).catch(() => [] as Bookmark[]),
          fetchBookChapters(bookId).catch(() => ({
            book_id: bookId,
            chapters: [] as BookChapter[],
          })),
        ])
        if (cancelled) return

        const savedPage = initialPage ?? (prog && prog.page > 0 ? prog.page : 1)
        setCurrentPage(savedPage)
        setSiblings(booksData.books)
        setBookmarks(bmarks)
        setChapters(chaptersData.chapters)

        if (savedPage > 1) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const el = scrollRef.current?.querySelector(
                `[data-page="${savedPage}"]`,
              )
              if (el) {
                el.scrollIntoView({ behavior: 'instant', block: 'start' })
              }
            })
          })
        }
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
        const lastShown =
          readMode === 'double' && !widePages.has(page) ? page + 1 : page
        const isCompleted = lastShown >= book.page_count
        updateProgress(
          bookId,
          isCompleted ? book.page_count : page,
          isCompleted,
        ).catch(() => {})
      }, 500)
    },
    [book, bookId, readMode, widePages],
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
    const step = readMode === 'double' && !widePages.has(currentPage) ? 2 : 1
    if (currentPage + step > book.page_count) {
      // Past the end of a paged book: it's finished, whatever spread it ended on.
      if (readMode !== 'scroll') {
        // A page save still waiting would land after this one and un-finish the book.
        if (progressTimer.current) clearTimeout(progressTimer.current)
        setEnded(true)
        updateProgress(bookId, book.page_count, true).catch(() => {})
      }
      return
    }
    goToPage(currentPage + step)
  }, [book, bookId, currentPage, goToPage, readMode, widePages])

  const goBackward = useCallback(() => {
    if (ended) {
      setEnded(false)
      return
    }
    const step = readMode === 'double' && !widePages.has(currentPage) ? 2 : 1
    goToPage(currentPage - step)
  }, [currentPage, ended, goToPage, readMode, widePages])

  // The books on either side, for the bars, the end of a book and the [ ] keys.
  const currentIndex = siblings.findIndex((b) => b.id === bookId)
  const prevBook = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextBook =
    currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null

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
  }, [readMode, book, loadedPages.size, saveProgress])

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
      ;(async () => {
        const newUrls = new Map(offlineUrls)
        let changed = false
        for (const p of toPreload) {
          const key = `${bookId}-${p}`
          if (!newUrls.has(key)) {
            const url = await getDownloadedPageUrl(bookId, p)
            if (url) {
              newUrls.set(key, url)
              changed = true
            }
          }
        }
        if (changed) setOfflineUrls(newUrls)
      })()
    } else {
      for (const p of toPreload) {
        const img = new Image()
        img.src = resolvePageUrl(bookId, p)
      }
    }
  }, [readMode, currentPage, book, bookId, resolvePageUrl, offlineUrls])

  // Prefetch adjacent chapters (only when online)
  useEffect(() => {
    if (siblings.length === 0 || isOfflineBook.current) return
    const idx = siblings.findIndex((b) => b.id === bookId)
    const adjacentIds: string[] = []
    if (idx > 0) adjacentIds.push(siblings[idx - 1].id)
    if (idx < siblings.length - 1) adjacentIds.push(siblings[idx + 1].id)
    for (const adjId of adjacentIds) {
      fetchBookDetail(adjId).catch(() => {})
      for (let p = 1; p <= 3; p++) {
        const img = new Image()
        img.src = resolvePageUrl(adjId, p)
      }
    }
  }, [siblings, bookId, resolvePageUrl])

  // Keyboard navigation
  useEffect(() => {
    const openBook = (target: Book | null) => {
      if (target) navigate({ to: '/read/$bookId', params: { bookId: target.id } })
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
      const backward = e.key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')

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
          navigate({
            to: '/series/$seriesId',
            params: { seriesId: book.series_id },
          })
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

  const retryPage = (page: number) => {
    setFailedPages((prev) => {
      const next = new Set(prev)
      next.delete(page)
      return next
    })
    setRetries((prev) => ({ ...prev, [page]: (prev[page] ?? 0) + 1 }))
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
              (page) => (
                <div
                  key={page}
                  data-page={page}
                  className="relative w-full"
                  style={
                    !loadedPages.has(page)
                      ? { aspectRatio: pageAspectRatio.current }
                      : undefined
                  }
                >
                  <img
                    key={retries[page] ?? 0}
                    src={pageSrc(page)}
                    alt={`Page ${page}`}
                    className={cn(
                      getFitClass(),
                      'block',
                      loadedPages.has(page)
                        ? 'relative'
                        : 'absolute inset-0 h-full w-full object-contain opacity-0',
                    )}
                    loading={page <= 5 ? 'eager' : 'lazy'}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (
                        img.naturalWidth &&
                        img.naturalHeight &&
                        pageAspectRatio.current === '2/3'
                      ) {
                        pageAspectRatio.current = `${img.naturalWidth}/${img.naturalHeight}`
                      }
                      setLoadedPages((prev) => new Set(prev).add(page))
                    }}
                    onError={() => {
                      setFailedPages((prev) => new Set(prev).add(page))
                    }}
                  />
                  {!loadedPages.has(page) && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      {failedPages.has(page) ? (
                        <div
                          className="flex flex-col items-center gap-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="m-0 font-mono text-xs">
                            Page {page} didn't load
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => retryPage(page)}
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
                  {bookmarks.some((b) => b.page === page) && (
                    <span
                      className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full material-raised"
                      aria-label="This page is bookmarked"
                    >
                      <BookmarkIcon className="size-4 fill-current" />
                    </span>
                  )}
                </div>
              ),
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
              {/* Left page (or only page if wide) */}
              <img
                key={`left-${currentPage}`}
                src={pageSrc(currentPage)}
                alt={`Page ${currentPage}`}
                className="max-h-[calc(100dvh-6rem)] max-w-[49%] object-contain"
                onLoad={(e) => {
                  const img = e.currentTarget
                  if (img.naturalWidth > img.naturalHeight) {
                    setWidePages((prev) => new Set(prev).add(currentPage))
                  }
                }}
              />
              {/* Right page (only if current isn't wide and next exists) */}
              {!widePages.has(currentPage) &&
                currentPage + 1 <= book.page_count && (
                  <img
                    key={`right-${currentPage + 1}`}
                    src={pageSrc(currentPage + 1)}
                    alt={`Page ${currentPage + 1}`}
                    className="max-h-[calc(100dvh-6rem)] max-w-[49%] object-contain"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth > img.naturalHeight) {
                        setWidePages((prev) =>
                          new Set(prev).add(currentPage + 1),
                        )
                      }
                    }}
                  />
                )}

              {isCurrentPageBookmarked && bookmarkMark}

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
              />

              {isCurrentPageBookmarked && bookmarkMark}

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
                    <Link to="/read/$bookId" params={{ bookId: nextBook.id }} />
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
          render={<Link to="/read/$bookId" params={{ bookId: prevBook.id }} />}
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
          render={<Link to="/read/$bookId" params={{ bookId: nextBook.id }} />}
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
