import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

const sections = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'K'], mac: ['⌘', 'K'], desc: 'Open command palette' },
      { keys: ['?'], desc: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Reader',
    shortcuts: [
      { keys: ['→', 'Space'], desc: 'Next page (LTR) / Previous page (RTL)' },
      { keys: ['←'], desc: 'Previous page (LTR) / Next page (RTL)' },
      { keys: ['Esc'], desc: 'Exit reader' },
    ],
  },
]

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

// Module-level ref to allow external opening
let _openShortcuts: (() => void) | null = null
export function openKeyboardShortcuts() {
  _openShortcuts?.()
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  // Register the opener
  _openShortcuts = () => setOpen(true)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only trigger on '?' without modifiers, and not when typing in inputs
      if (e.key !== '?') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {sections.map((section, si) => (
            <div key={section.title}>
              {si > 0 && <Separator className="mb-4" />}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((sc) => {
                  const displayKeys = isMac && sc.mac ? sc.mac : sc.keys
                  return (
                    <div
                      key={sc.desc}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground/80">{sc.desc}</span>
                      <div className="flex items-center gap-1">
                        {displayKeys.map((key) => (
                          <kbd
                            key={key}
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-medium"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
