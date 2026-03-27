import { motion, AnimatePresence } from 'motion/react'
import type { BookChapter } from '@/lib/api'

interface TocPanelProps {
  show: boolean
  onClose: () => void
  chapters: BookChapter[]
  currentPage: number
  onGoToPage: (page: number) => void
}

export function TocPanel({
  show,
  onClose,
  chapters,
  currentPage,
  onGoToPage,
}: TocPanelProps) {
  return (
    <AnimatePresence>
      {show && chapters.length > 0 && (
        <>
          {/* Backdrop to dismiss on outside click (mobile) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-29 md:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-3 top-1/2 z-30 max-h-[calc(100vh-5rem)] w-64 -translate-y-1/2 overflow-y-auto rounded-xl bg-background/90 shadow-lg backdrop-blur-sm"
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
                      className={`w-full px-4 py-3.5 text-left text-sm transition-colors ${
                        isActive
                          ? 'font-medium text-primary'
                          : 'text-white/70 hover:text-white'
                      }`}
                      onClick={() => {
                        onGoToPage(ch.start_page + 1)
                        onClose()
                      }}
                    >
                      {ch.title}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
