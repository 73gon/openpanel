import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft,
  ArrowRight,
  Settings01Icon,
  Loading03Icon,
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
  fetchSeriesMetadata,
  type BookDetail,
  type Book,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'

export const Route = createFileRoute('/read/$bookId')({
  component: ReaderPage,
})

type ReadMode = 'scroll' | 'single'

function ReaderPage() {
  const { bookId } = Route.useParams()
  const navigate = useNavigate()
  const addRecentRead = useAppStore((s) => s.addRecentRead)
  const setReaderActive = useAppStore((s) => s.setReaderActive)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [siblings, setSiblings] = useState<Book[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [readMode, setReadMode] = useState<ReadMode>('scroll')
  const [showUI, setShowUI] = useState(true)
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set())
  const [cover, setCover] = useState<string | null>(null)
  const remoteCoverRef = useRef<string | null>(null)

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
    // Clear immediately so the loading skeleton shows during chapter transitions
    setBook(null)
    setLoadedPages(new Set())
    async function load() {
      try {
        const detail = await fetchBookDetail(bookId)
        if (cancelled) return
        setBook(detail)
        setLoadedPages(new Set())

        // Load progress + siblings in parallel
        const [prog, booksData] = await Promise.all([
          fetchProgress(bookId),
          fetchBooks(detail.series_id),
        ])
        if (cancelled) return

        const savedPage = prog && prog.page > 0 ? prog.page : 1
        setCurrentPage(savedPage)
        setSiblings(booksData.books)

        // After a short delay, scroll to saved page in scroll mode
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

        // Get cover for recent reads (non-blocking)
        fetchSeriesMetadata(detail.series_id).then((meta) => {
          if (cancelled) return
          setCover(meta?.cover_url ?? null)
          // Store remote URL for persistent recent reads
          remoteCoverRef.current = meta?.cover_url ?? null
        }).catch(() => {})
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
        addRecentRead({
          bookId,
          bookTitle: book.title,
          seriesId: book.series_id,
          seriesName: book.series_name,
          page,
          totalPages: book.page_count,
          timestamp: Date.now(),
          coverUrl: remoteCoverRef.current ?? cover,
        })
      }, 500)
    },
    [book, bookId, cover, addRecentRead],
  )

  // Handle page change
  const goToPage = useCallback(
    (page: number) => {
      if (!book) return
      const clamped = Math.max(1, Math.min(page, book.page_count))
      setCurrentPage(clamped)
      saveProgress(clamped)
    },
    [book, saveProgress],
  )

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

  // Preload adjacent pages for speed
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

  // Prefetch adjacent chapters (next/prev) for instant transitions
  useEffect(() => {
    if (siblings.length === 0) return
    const idx = siblings.findIndex((b) => b.id === bookId)
    const adjacentIds: string[] = []
    if (idx > 0) adjacentIds.push(siblings[idx - 1].id)
    if (idx < siblings.length - 1) adjacentIds.push(siblings[idx + 1].id)

    for (const adjId of adjacentIds) {
      // Prefetch book detail (warm the browser fetch cache)
      fetchBookDetail(adjId).catch(() => {})
      // Prefetch first 3 pages
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
      if (readMode === 'single') {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault()
          goToPage(currentPage + 1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          goToPage(currentPage - 1)
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
  }, [book, readMode, currentPage, goToPage, navigate])

  // Auto-hide UI
  const showUITemporarily = useCallback(() => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowUI(false), 3000)
  }, [])

  // Find prev/next book
  const currentIndex = siblings.findIndex((b) => b.id === bookId)
  const prevBook = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextBook =
    currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null

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
        if (readMode === 'single') {
          setShowUI((p) => !p)
        }
      }}
    >
      {/* Top bar */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-border/50 bg-background/90 px-4 py-2 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <Link
                to="/series/$seriesId"
                params={{ seriesId: book.series_id }}
              >
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <HugeiconsIcon icon={ArrowLeft} size={16} />
                </Button>
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {book.series_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentPage}/{book.page_count} ({progressPct}%)
              </span>

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
                    className={`w-full max-w-3xl mx-auto block ${
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
                  {/* Spinner overlay while this page is loading */}
                  {!loadedPages.has(page) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={20}
                        className="animate-spin text-muted-foreground/40"
                      />
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {/* Loading indicator — shown while pages are still loading */}
          {loadedPages.size < book.page_count && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin"
              />
              Loading pages… {loadedPages.size} / {book.page_count}
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
      ) : (
        /* Single page mode */
        <div className="flex flex-1 items-center justify-center pt-12">
          <img
            key={currentPage}
            src={getPageUrl(bookId, currentPage)}
            alt={`Page ${currentPage}`}
            className="max-h-[calc(100vh-6rem)] max-w-full object-contain"
          />

          {/* Side navigation areas */}
          <button
            className="absolute left-0 top-12 bottom-0 w-1/3 cursor-w-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              goToPage(currentPage - 1)
            }}
            aria-label="Previous page"
          />
          <button
            className="absolute right-0 top-12 bottom-0 w-1/3 cursor-e-resize opacity-0"
            onClick={(e) => {
              e.stopPropagation()
              goToPage(currentPage + 1)
            }}
            aria-label="Next page"
          />
        </div>
      )}

      {/* Bottom bar (single mode) */}
      <AnimatePresence>
        {showUI && readMode === 'single' && (
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
                  goToPage(currentPage - 1)
                }}
                disabled={currentPage <= 1}
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
                className="w-32 accent-primary"
              />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  goToPage(currentPage + 1)
                }}
                disabled={currentPage >= book.page_count}
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
