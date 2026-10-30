import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Eyebrow,
  Kbd,
  KbdGroup,
  KbdShortcut,
} from '@zonsh/ui'

/** Each shortcut is one or more alternatives; each alternative is a chord of keys. */
const sections: {
  title: string
  shortcuts: { keys: string[][]; desc: string }[]
}[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: [['mod', 'K']], desc: 'Search' },
      { keys: [['mod', 'B']], desc: 'Show or hide the sidebar' },
      { keys: [['?']], desc: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'Reader',
    shortcuts: [
      {
        keys: [['→'], ['Space']],
        desc: 'Next page (previous when reading right to left)',
      },
      {
        keys: [['←']],
        desc: 'Previous page (next when reading right to left)',
      },
      { keys: [['Home'], ['End']], desc: 'First or last page' },
      { keys: [['['], [']']], desc: 'Previous or next book' },
      { keys: [['B']], desc: 'Bookmark this page, or remove its bookmark' },
      { keys: [['F']], desc: 'Full screen' },
      { keys: [['Esc']], desc: 'Back to the series' },
    ],
  },
]

// Module-level opener, so the sidebar and the command palette can open the dialog.
let openShortcuts: (() => void) | null = null
export function openKeyboardShortcuts() {
  openShortcuts?.()
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    openShortcuts = () => setOpen(true)
    return () => {
      openShortcuts = null
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // '?' without modifiers, and not while typing.
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Faster ways around the library and the reader.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <Eyebrow as="div">{section.title}</Eyebrow>
              <dl className="m-0 flex flex-col divide-y divide-border/60 border-t border-border/60">
                {section.shortcuts.map((sc) => (
                  <div
                    key={sc.desc}
                    className="flex items-center justify-between gap-4 py-2.5"
                  >
                    <dt className="text-sm text-foreground-soft">{sc.desc}</dt>
                    <dd className="m-0 flex shrink-0 items-center gap-1.5">
                      {sc.keys.map((chord, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {i > 0 && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              or
                            </span>
                          )}
                          {chord.includes('mod') ? (
                            <KbdShortcut keys={chord} />
                          ) : (
                            <KbdGroup>
                              {chord.map((key) => (
                                <Kbd key={key}>{key}</Kbd>
                              ))}
                            </KbdGroup>
                          )}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
