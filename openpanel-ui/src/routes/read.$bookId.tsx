import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft,
  ArrowRight,
  Settings01Icon,
  Loading03Icon,
  BookmarkAdd01Icon,
  BookmarkMinus01Icon,
  LeftToRightListNumberIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
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

export const Route = createFileRoute('/read/$bookId')({
  component: ReaderPage,
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    ...(typeof search.page === 'number' ? { page: search.page } : {}),
  }),
})

type ReadMode = 'scroll' | 'single' | 'double'
type FitMode = 'width' | 'height' | 'original'
type ReadDirection = 'ltr' | 'rtl'

function ReaderPage() {
  const { bookId } = Route.useParams()
  const { page: initialPage } = Route.useSearch()
  const navigate = useNavigate()
  const setReaderActive = useAppStore((s) => s.setReaderActive)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [siblings, setSiblings] = useState<Book[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [fitMode, setFitMode] = useState<FitMode>('width')
  const [direction, setDirection] = useState<ReadDirection>('ltr')
  const [showUI, setShowUI] = useState(true)
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set())

  // Double-page spread: track which pages are wide (landscape)
  const [widePages, setWidePages] = useState<Set<number>>(new Set())

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarkNote, setBookmarkNote] = useState('')

  // Chapters (TOC)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [showToc, setShowToc] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to top whenever bookId changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
    window.scrollTo(0, 0)
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
    setBookmarks([])
    async function load() {
      try {
        const detail = await fetchBookDetail(bookId)
        if (cancelled) return
        setBook(detail)
        setLoadedPages(new Set())

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

  // Preload adjacent pages
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
    for (const p of toPreload) {
      const img = new Image()
      img.src = getPageUrl(bookId, p)
    }
  }, [readMode, currentPage, book, bookId])

  // Prefetch adjacent chapters
  useEffect(() => {
    if (siblings.length === 0) return
    const idx = siblings.findIndex((b) => b.id === bookId)
    const adjacentIds: string[] = []
    if (idx > 0) adjacentIds.push(siblings[idx - 1].id)
    if (idx < siblings.length - 1) adjacentIds.push(siblings[idx + 1].id)
    for (const adjId of adjacentIds) {
      fetchBookDetail(adjId).catch(() => {})
      for (let p = 1; p <= 3; p++) {
        const img = new Image()
        img.src = getPageUrl(adjId, p)
      }
    }
  }, [siblings, bookId])

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

  // Auto-hide UI
  const showUITemporarily = useCallback(() => {
    setShowUI(true)
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
          <Skeleton className="mx-auto h-96 w-72" />
          <Skeleton className="mx-auto h-4 w-32" />
        </div>
      </div>
    )
  }

  const progressPct = Math.round((currentPage / book.page_count) * 100)

  return (
    <div
      className="relative flex h-full flex-col bg-background"
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
          >
            {/* Left island */}
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-background/90 px-3 py-1.5 backdrop-blur-sm shadow-lg max-w-[50%]">
              <Link
                to="/series/$seriesId"
                params={{ seriesId: book.series_id }}
              >
                <Button variant="ghost" size="icon" className="h-7 w-7">
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
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-background/90 px-2.5 py-1.5 backdrop-blur-sm shadow-lg">
              <span className="text-xs tabular-nums text-muted-foreground px-1">
                {currentPage}/{book.page_count} ({progressPct}%)
              </span>

              {/* Bookmarks panel */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 relative ${showBookmarks ? 'bg-accent' : ''}`}
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
                <DropdownMenuTrigger className="focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center justify-center rounded-md p-2 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8">
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
                    <DropdownMenuLabel>Direction</DropdownMenuLabel>
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
                      Right to Left
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="absolute inset-x-0 top-0 z-30 h-0.5">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Bookmarks panel */}
      <AnimatePresence>
        {showBookmarks && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-64 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl bg-background/90 backdrop-blur-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-3 p-3">
              {/* Add / remove current page */}
              <button
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isCurrentPageBookmarked
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/10 text-white/80 border border-white/10 hover:bg-white/15'
                }`}
                onClick={() => {
                  if (isCurrentPageBookmarked) {
                    const bm = bookmarks.find((b) => b.page === currentPage)
                    if (bm) handleDeleteBookmark(bm.id)
                  } else {
                    handleAddBookmark()
                  }
                }}
              >
                <HugeiconsIcon
                  icon={
                    isCurrentPageBookmarked
                      ? BookmarkMinus01Icon
                      : BookmarkAdd01Icon
                  }
                  size={16}
                />
                {isCurrentPageBookmarked
                  ? `Remove page ${currentPage}`
                  : `Bookmark page ${currentPage}`}
              </button>

              {bookmarks.length === 0 ? (
                <p className="text-center text-sm text-white/40 py-8">
                  No bookmarks yet
                </p>
              ) : (
                <div className="space-y-1 mt-2">
                  {bookmarks
                    .sort((a, b) => a.page - b.page)
                    .map((bm) => (
                      <div
                        key={bm.id}
                        className={`group flex items-center justify-between rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                          bm.page === currentPage
                            ? 'bg-primary/15 text-primary'
                            : 'text-white/70 hover:bg-white/10'
                        }`}
                        onClick={() => {
                          goToPage(bm.page)
                          setShowBookmarks(false)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <HugeiconsIcon
                            icon={BookmarkAdd01Icon}
                            size={14}
                            className="shrink-0 opacity-50"
                          />
                          <div>
                            <span className="text-sm font-medium">
                              Page {bm.page}
                            </span>
                            {bm.note && (
                              <p className="text-xs opacity-60 mt-0.5">
                                {bm.note}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity text-red-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteBookmark(bm.id)
                          }}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOC panel */}
      <AnimatePresence>
        {showToc && chapters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-64 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl bg-background/90 backdrop-blur-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              <div className="divide-y divide-white/10">
                {chapters.map((ch) => {
                  const isActive =
                    currentPage >= ch.start_page + 1 &&
                    currentPage <= ch.end_page + 1
                  return (
                    <button
                      key={ch.chapter_number}
                      className={`w-full text-left px-4 py-3.5 text-sm transition-colors ${
                        isActive
                          ? 'text-primary font-medium'
                          : 'text-white/70 hover:text-white'
                      }`}
                      onClick={() => {
                        goToPage(ch.start_page + 1)
                        setShowToc(false)
                      }}
                    >
                      {ch.title}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    !loadedPages.has(page) ? { aspectRatio: '2/3' } : undefined
                  }
                >
                  <img
                    src={getPageUrl(bookId, page)}
                    alt={`Page ${page}`}
                    className={`${getFitClass()} block ${
                      loadedPages.has(page)
                        ? 'relative'
                        : 'absolute inset-0 h-full w-full object-contain opacity-0'
                    }`}
                    loading={page <= 5 ? 'eager' : 'lazy'}
                    onLoad={() =>
                      setLoadedPages((prev) => new Set(prev).add(page))
                    }
                    onError={() =>
                      setLoadedPages((prev) => new Set(prev).add(page))
                    }
                  />
                  {!loadedPages.has(page) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={20}
                        className="animate-spin text-muted-foreground/40"
                      />
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

          {loadedPages.size < book.page_count && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin"
              />
              Loading pages... {loadedPages.size} / {book.page_count}
            </div>
          )}

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
            src={getPageUrl(bookId, currentPage)}
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
                src={getPageUrl(bookId, currentPage + 1)}
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
            src={getPageUrl(bookId, currentPage)}
            alt={`Page ${currentPage}`}
            className={`object-contain ${
              fitMode === 'width'
                ? 'w-full max-w-full'
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
      <AnimatePresence>
        {showUI && (readMode === 'single' || readMode === 'double') && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-border/50 bg-background/90 px-4 py-2 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              {prevBook && (
                <Link to="/read/$bookId" params={{ bookId: prevBook.id }}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    <HugeiconsIcon icon={ArrowLeft} size={12} />
                    {prevBook.title}
                  </Button>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  if (direction === 'rtl') goForward()
                  else goBackward()
                }}
                disabled={
                  direction === 'rtl'
                    ? currentPage >= book.page_count
                    : currentPage <= 1
                }
              >
                <HugeiconsIcon icon={ArrowLeft} size={14} />
              </Button>

              <input
                type="range"
                min={1}
                max={book.page_count}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className={`w-32 accent-primary ${direction === 'rtl' ? 'rotate-180' : ''}`}
              />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  if (direction === 'rtl') goBackward()
                  else goForward()
                }}
                disabled={
                  direction === 'rtl'
                    ? currentPage <= 1
                    : currentPage >= book.page_count
                }
              >
                <HugeiconsIcon icon={ArrowRight} size={14} />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {nextBook && (
                <Link to="/read/$bookId" params={{ bookId: nextBook.id }}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    {nextBook.title}
                    <HugeiconsIcon icon={ArrowRight} size={12} />
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
