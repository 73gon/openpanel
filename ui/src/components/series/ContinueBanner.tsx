import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlayIcon, RepeatIcon } from '@hugeicons/core-free-icons'
import type { SeriesContinueResponse } from '@/lib/api'
import { stripTitleZeros } from '@/lib/utils'

interface ContinueBannerProps {
  continueInfo: SeriesContinueResponse
  bannerRef: React.RefObject<HTMLDivElement | null>
}

export function ContinueBanner({
  continueInfo,
  bannerRef,
}: ContinueBannerProps) {
  return (
    <div ref={bannerRef} className="mt-4">
      <Link
        to="/read/$bookId"
        params={{ bookId: continueInfo.book_id }}
        search={
          continueInfo.action === 'continue'
            ? { page: continueInfo.page }
            : { page: 1 }
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="group relative overflow-hidden rounded-lg border border-border bg-card px-4 py-2.5 transition-all hover:border-primary/50 hover:shadow-md"
        >
          {/* Progress fill */}
          {continueInfo.action === 'continue' && (
            <div
              className="absolute inset-y-0 left-0 bg-primary/10 transition-all"
              style={{ width: `${continueInfo.progress_percent}%` }}
            />
          )}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  continueInfo.action === 'reread'
                    ? 'bg-green-500/15 text-green-500'
                    : 'bg-primary/15 text-primary'
                }`}
              >
                <HugeiconsIcon
                  icon={
                    continueInfo.action === 'reread' ? RepeatIcon : PlayIcon
                  }
                  size={18}
                />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {continueInfo.action === 'start'
                    ? 'Start Reading'
                    : continueInfo.action === 'continue'
                      ? `Continue · ${stripTitleZeros(continueInfo.book_title)}`
                      : 'Read Again'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {continueInfo.action === 'continue'
                    ? `Page ${continueInfo.page} of ${continueInfo.total_pages} · ${Math.round(continueInfo.progress_percent)}%`
                    : continueInfo.action === 'start'
                      ? `${continueInfo.total_pages} pages`
                      : 'All volumes completed'}
                </p>
              </div>
            </div>
            <HugeiconsIcon
              icon={PlayIcon}
              size={16}
              className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </motion.div>
      </Link>
    </div>
  )
}

interface ContinueFabProps {
  continueInfo: SeriesContinueResponse
  showFab: boolean
}

export function ContinueFab({ continueInfo, showFab }: ContinueFabProps) {
  return (
    <AnimatePresence>
      {showFab && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 md:bottom-6 md:right-6"
        >
          <Link
            to="/read/$bookId"
            params={{ bookId: continueInfo.book_id }}
            search={
              continueInfo.action === 'continue'
                ? { page: continueInfo.page }
                : { page: 1 }
            }
          >
            <button
              className={`flex items-center gap-2 rounded-full border px-4 py-3 font-medium shadow-lg transition-all hover:shadow-xl active:scale-95 ${
                continueInfo.action === 'reread'
                  ? 'border-green-500/30 bg-background text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30'
                  : 'border-primary/30 bg-background text-primary hover:bg-primary/5'
              }`}
            >
              <HugeiconsIcon
                icon={continueInfo.action === 'reread' ? RepeatIcon : PlayIcon}
                size={16}
              />
              <span className="text-sm">
                {continueInfo.action === 'start'
                  ? 'Start Reading'
                  : continueInfo.action === 'continue'
                    ? `Continue · ${stripTitleZeros(continueInfo.book_title)}`
                    : 'Read Again'}
              </span>
            </button>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
