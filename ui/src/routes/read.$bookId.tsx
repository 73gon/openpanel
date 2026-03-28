import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft,
  ArrowRight,
  Settings01Icon,
  Loading03Icon,
  BookmarkAdd01Icon,
  LeftToRightListNumberIcon,
} from '@hugeicons/core-free-icons'
import { BookmarksPanel, TocPanel, ReaderBottomBar } from '@/components/reader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useAppStore } from '@/lib/store'
import { useReaderPrefs, type ReadMode, type FitMode } from '@/lib/reader-store'
import {
  isBookDownloaded,
  getDownloadedPageUrl,
  getDownloadMeta,
} from '@/lib/downloads'

export const Route = createFileRoute('/read/$bookId')({
  component: ReaderPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    ...(typeof search.page === 'number' ? { page: search.page } : {}),
  }),
})

function ReaderPage() {
  const { bookId } = Route.useParams()
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

  const [showUI, setShowUI] = useState(true)
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set())
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())

  // Dynamic aspect ratio from first loaded page (default 2/3)
  const pageAspectRatio = useRef('2/3')

  // Double-page spread: track which pages are wide (landscape)
  const [widePages, setWidePages] = useState<Set<number>>(new Set())

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarkNote, setBookmarkNote] = useState('')

  // Chapters (TOC)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [showToc, setShowToc] = useState(false)

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
      // We'll load pages lazily as needed rather than all at once
      // But preload first few pages for instant display
      const urls = new Map<string, string>()
      // Load pages 1-10 upfront for instant rendering
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

  // Mark reader as active (hides mobile nav)
  useEffect(() => {
    setReaderActive(true)
    return () => setReaderActive(false)
  }, [setReaderActive])

  // Load book data
  useEffect(() => {
    let cancelled = false
    setBook(null)
    setLoadedPages(new Set())
    setFailedPages(new Set())
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
        const isCompleted = page >= book.page_count
        updateProgress(bookId, page, isCompleted).catch(() => {})
      }, 500)
    },
    [book, bookId],
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
    const step = readMode === 'double' && !widePages.has(currentPage) ? 2 : 1
    goToPage(currentPage + step)
  }, [currentPage, goToPage, readMode, widePages])

  const goBackward = useCallback(() => {
    const step = readMode === 'double' && !widePages.has(currentPage) ? 2 : 1
    goToPage(currentPage - step)
  }, [currentPage, goToPage, readMode, widePages])

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
    const handleKey = (e: KeyboardEvent) => {
      if (!book) return
      if (readMode === 'single' || readMode === 'double') {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault()
          if (direction === 'rtl') goBackward()
          else goForward()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (direction === 'rtl') goForward()
          else goBackward()
        }
      }
      if (e.key === 'Escape') {
        navigate({
          to: '/series/$seriesId',
          params: { seriesId: book.series_id },
        })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [book, readMode, direction, goForward, goBackward, navigate])

  // Auto-hide UI — paused while hovering over controls
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

  // Bookmark actions
  const handleAddBookmark = async () => {
    try {
      const bm = await createBookmark(
        bookId,
        currentPage,
        bookmarkNote || undefined,
      )
      setBookmarks((prev) => [...prev, bm])
      setBookmarkNote('')
    } catch {}
  }

  const handleDeleteBookmark = async (bmId: string) => {
    try {
      await deleteBookmark(bmId)
      setBookmarks((prev) => prev.filter((b) => b.id !== bmId))
    } catch {}
  }

  const isCurrentPageBookmarked = bookmarks.some((b) => b.page === currentPage)

  // Find prev/next book
  const currentIndex = siblings.findIndex((b) => b.id === bookId)
  const prevBook = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextBook =
    currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null

  // Fit mode classes
  const getFitClass = () => {
    switch (fitMode) {
      case 'width':
        return 'w-full max-w-3xl mx-auto'
      case 'height':
        return 'max-h-[calc(100vh-6rem)] mx-auto'
      case 'original':
        return 'mx-auto'
    }
  }

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto w-72" style={{ aspectRatio: '2/3' }} />
          <Skeleton className="mx-auto h-4 w-32" />
        </div>
      </div>
    )
  }

  const progressPct = Math.round((currentPage / book.page_count) * 100)

  return (
    <div
      className="relative flex h-full flex-col overflow-x-hidden bg-background"
      onMouseMove={showUITemporarily}
      onClick={() => {
        if (readMode === 'single') setShowUI((p) => !p)
      }}
    >
      {/* Top bar — two floating islands */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-3 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={pauseHideTimer}
            onMouseLeave={resumeHideTimer}
          >
            {/* Left island */}
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-background/90 px-3 py-1.5 backdrop-blur-sm shadow-lg max-w-[50%]">
              <Link
                to="/series/$seriesId"
                params={{ seriesId: book.series_id }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Back to series"
                >
                  <HugeiconsIcon icon={ArrowLeft} size={14} />
                </Button>
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">
                  {book.title}
                </p>
                <p className="truncate text-xs text-muted-foreground leading-tight">
                  {book.series_name}
                </p>
              </div>
            </div>

            {/* Right island */}
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1.5 backdrop-blur-sm shadow-lg">
              <span className="text-xs tabular-nums text-muted-foreground px-1">
                {currentPage}/{book.page_count} ({progressPct}%)
              </span>

              {/* Bookmarks panel */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 relative ${showBookmarks ? 'bg-accent' : ''}`}
                aria-label="Toggle bookmarks"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowBookmarks((p) => !p)
                  setShowToc(false)
                }}
              >
                <HugeiconsIcon
                  icon={BookmarkAdd01Icon}
                  size={14}
                  className={
                    isCurrentPageBookmarked || showBookmarks
                      ? 'text-primary'
                      : ''
                  }
                />
                {bookmarks.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {bookmarks.length}
                  </span>
                )}
              </Button>

              {/* TOC button (only if chapters detected) */}
              {chapters.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${showToc ? 'bg-accent' : ''}`}
                  aria-label="Table of contents"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowToc((p) => !p)
                    setShowBookmarks(false)
                  }}
                >
                  <HugeiconsIcon
                    icon={LeftToRightListNumberIcon}
                    size={14}
                    className={showToc ? 'text-primary' : ''}
                  />
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  className="focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center justify-center rounded-md p-2 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8"
                  aria-label="Reader settings"
                >
                  <HugeiconsIcon icon={Settings01Icon} size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Reading Mode</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setReadMode('scroll')}
                      className={readMode === 'scroll' ? 'font-medium' : ''}
                    >
                      Scroll
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setReadMode('single')}
                      className={readMode === 'single' ? 'font-medium' : ''}
                    >
                      Single Page
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setReadMode('double')}
                      className={readMode === 'double' ? 'font-medium' : ''}
                    >
                      Double Page
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Fit</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setFitMode('width')}
                      className={fitMode === 'width' ? 'font-medium' : ''}
                    >
                      Fit Width
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setFitMode('height')}
                      className={fitMode === 'height' ? 'font-medium' : ''}
                    >
                      Fit Height
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setFitMode('original')}
                      className={fitMode === 'original' ? 'font-medium' : ''}
                    >
                      Original
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      Direction (this series)
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDirection('ltr')}
                      className={direction === 'ltr' ? 'font-medium' : ''}
                    >
                      Left to Right
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDirection('rtl')}
                      className={direction === 'rtl' ? 'font-medium' : ''}
                    >
                      Right to Left (Manga)
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div
        className={`absolute inset-x-0 top-0 z-30 h-0.5 ${direction === 'rtl' ? 'flex justify-end' : ''}`}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Bookmarks panel */}
      <BookmarksPanel
        show={showBookmarks}
        onClose={() => setShowBookmarks(false)}
        bookmarks={bookmarks}
        currentPage={currentPage}
        isCurrentPageBookmarked={isCurrentPageBookmarked}
        onAddBookmark={handleAddBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onGoToPage={(page) => {
          goToPage(page)
          setShowBookmarks(false)
        }}
      />

      {/* TOC panel */}
      <TocPanel
        show={showToc}
        onClose={() => setShowToc(false)}
        chapters={chapters}
        currentPage={currentPage}
        onGoToPage={(page) => {
          goToPage(page)
          setShowToc(false)
        }}
      />

      {/* Reader content */}
      {readMode === 'scroll' ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto pt-12">
          {/* Chapter Navigation (Top) */}
          <div className="flex items-center justify-center gap-3 px-4 py-4">
            {prevBook && (
              <Link to="/read/$bookId" params={{ bookId: prevBook.id }}>
                <Button variant="outline" size="sm" className="gap-2">
                  <HugeiconsIcon icon={ArrowLeft} size={14} />
                  {prevBook.title}
                </Button>
              </Link>
            )}
            {nextBook && (
              <Link to="/read/$bookId" params={{ bookId: nextBook.id }}>
                <Button variant="outline" size="sm" className="gap-2">
                  {nextBook.title}
                  <HugeiconsIcon icon={ArrowRight} size={14} />
                </Button>
              </Link>
            )}
          </div>

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
                    src={resolvePageUrl(bookId, page)}
                    alt={`Page ${page}`}
                    className={`${getFitClass()} block ${
                      loadedPages.has(page)
                        ? 'relative'
                        : 'absolute inset-0 h-full w-full object-contain opacity-0'
                    }`}
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
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                      {failedPages.has(page) ? (
                        <button
                          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setFailedPages((prev) => {
                              const next = new Set(prev)
                              next.delete(page)
                              return next
                            })
                            // Force re-render by toggling a key approach: change src
                            const img = document.querySelector(
                              `[data-page="${page}"] img`,
                            ) as HTMLImageElement
                            if (img) {
                              img.src = resolvePageUrl(bookId, page)
                            }
                          }}
                        >
                          <HugeiconsIcon icon={Loading03Icon} size={20} />
                          <span className="text-xs">Tap to retry</span>
                        </button>
                      ) : (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={20}
                          className="animate-spin text-muted-foreground/40"
                        />
                      )}
                    </div>
                  )}
                  {/* Bookmark indicator */}
                  {bookmarks.some((b) => b.page === page) && (
                    <div className="absolute top-2 right-2 z-10">
                      <HugeiconsIcon
                        icon={BookmarkAdd01Icon}
                        size={20}
                        className="text-primary drop-shadow-md"
                      />
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {/* Chapter Navigation (Bottom) */}
          <div className="flex items-center justify-center gap-3 px-4 py-6">
            {prevBook && (
              <Link to="/read/$bookId" params={{ bookId: prevBook.id }}>
                <Button variant="outline" size="sm" className="gap-2">
                  <HugeiconsIcon icon={ArrowLeft} size={14} />
                  {prevBook.title}
                </Button>
              </Link>
            )}
            {nextBook ? (
              <Link to="/read/$bookId" params={{ bookId: nextBook.id }}>
                <Button variant="outline" size="sm" className="gap-2">
                  {nextBook.title}
                  <HugeiconsIcon icon={ArrowRight} size={14} />
                </Button>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">End of series</p>
            )}
          </div>
        </div>
      ) : readMode === 'double' ? (
        /* Double page spread mode */
        <div
          className={`flex flex-1 items-center justify-center gap-1 pt-12 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
        >
          {/* Left page (or only page if wide) */}
          <img
            key={`left-${currentPage}`}
            src={resolvePageUrl(bookId, currentPage)}
            alt={`Page ${currentPage}`}
            className="object-contain max-h-[calc(100vh-6rem)] max-w-[49%]"
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
                src={resolvePageUrl(bookId, currentPage + 1)}
                alt={`Page ${currentPage + 1}`}
                className="object-contain max-h-[calc(100vh-6rem)] max-w-[49%]"
                onLoad={(e) => {
                  const img = e.currentTarget
                  if (img.naturalWidth > img.naturalHeight) {
                    setWidePages((prev) => new Set(prev).add(currentPage + 1))
                  }
                }}
              />
            )}

          {/* Bookmark indicator */}
          {isCurrentPageBookmarked && (
            <div className="absolute top-14 right-4 z-10">
              <HugeiconsIcon
                icon={BookmarkAdd01Icon}
                size={20}
                className="text-primary drop-shadow-md"
              />
            </div>
          )}

          {/* Side navigation areas */}
          <button
            className="absolute left-0 top-12 bottom-0 w-1/4 cursor-w-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              if (direction === 'rtl') goForward()
              else goBackward()
            }}
            aria-label="Previous page"
          />
          <button
            className="absolute right-0 top-12 bottom-0 w-1/4 cursor-e-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              if (direction === 'rtl') goBackward()
              else goForward()
            }}
            aria-label="Next page"
          />
        </div>
      ) : (
        /* Single page mode */
        <div
          className={`flex flex-1 items-center justify-center pt-12 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
        >
          <img
            key={currentPage}
            src={resolvePageUrl(bookId, currentPage)}
            alt={`Page ${currentPage}`}
            className={`max-w-full object-contain ${
              fitMode === 'width'
                ? 'w-full'
                : fitMode === 'height'
                  ? 'h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)]'
                  : ''
            }`}
          />

          {/* Bookmark indicator */}
          {isCurrentPageBookmarked && (
            <div className="absolute top-14 right-4 z-10">
              <HugeiconsIcon
                icon={BookmarkAdd01Icon}
                size={20}
                className="text-primary drop-shadow-md"
              />
            </div>
          )}

          {/* Side navigation areas */}
          <button
            className="absolute left-0 top-12 bottom-0 w-1/3 cursor-w-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              if (direction === 'rtl') goForward()
              else goBackward()
            }}
            aria-label="Previous page"
          />
          <button
            className="absolute right-0 top-12 bottom-0 w-1/3 cursor-e-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              if (direction === 'rtl') goBackward()
              else goForward()
            }}
            aria-label="Next page"
          />
        </div>
      )}

      {/* Bottom bar (single/double mode) */}
      <ReaderBottomBar
        show={showUI}
        book={book}
        currentPage={currentPage}
        direction={direction}
        readMode={readMode}
        prevBook={prevBook}
        nextBook={nextBook}
        goToPage={goToPage}
        goForward={goForward}
        goBackward={goBackward}
        pauseHideTimer={pauseHideTimer}
        resumeHideTimer={resumeHideTimer}
      />
    </div>
  )
}
