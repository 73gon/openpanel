import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface InstallPromptModalProps {
  show: boolean
  onClose: () => void
}

export function InstallPromptModal({ show, onClose }: InstallPromptModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <HugeiconsIcon
                icon={SmartPhone01Icon}
                size={24}
                className="text-primary"
              />
              <h3 className="font-semibold">Install as App</h3>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              To download manga for offline reading, you need to install
              OpenPanel as an app on your device.
            </p>
            <div className="mb-6 rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">How to install:</p>
              <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>
                  1. Tap the <strong>Share</strong> button in your browser
                </li>
                <li>
                  2. Select <strong>"Add to Home Screen"</strong>
                </li>
                <li>
                  3. Tap <strong>"Add"</strong> to confirm
                </li>
              </ol>
            </div>
            <Button className="w-full" onClick={onClose}>
              Got it
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
