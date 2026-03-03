import { useEffect, useCallback, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useAppStore } from '@/lib/store'
import { fetchLibraries, fetchSeries, type Series } from '@/lib/api'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Book02Icon } from '@hugeicons/core-free-icons'

/**
 * Fuzzy filter: normalizes both value and search by removing spaces, hyphens, etc.
 * "jujutsukaisen" matches "Jujutsu Kaisen", "solo leveling" matches "Solo Leveling"
 */
function fuzzyFilter(value: string, search: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_:.']+/g, '')
  const nValue = normalize(value)
  const nSearch = normalize(search)

  // Exact substring match on normalized strings
  if (nValue.includes(nSearch)) return 1

  // Also try original word-boundary matching
  if (value.toLowerCase().includes(search.toLowerCase())) return 1

  // Character-by-character fuzzy match
  let searchIdx = 0
  for (let i = 0; i < nValue.length && searchIdx < nSearch.length; i++) {
    if (nValue[i] === nSearch[searchIdx]) searchIdx++
  }
  if (searchIdx === nSearch.length) return 0.5

  return 0
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen)
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const navigate = useNavigate()
  const [allSeries, setAllSeries] = useState<Series[]>([])

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  // Load all series when opened
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      try {
        const libs = await fetchLibraries()
        const seriesLists = await Promise.all(
          libs.map((lib) => fetchSeries(lib.id, 1, 200)),
        )
        if (cancelled) return
        const all = seriesLists.flatMap((s) => s.series)
        setAllSeries(all)
      } catch {
        // ignore
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open])

  const handleSelect = useCallback(
    (seriesId: string) => {
      setOpen(false)
      navigate({ to: '/series/$seriesId', params: { seriesId } })
    },
    [navigate, setOpen],
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} filter={fuzzyFilter}>
      <CommandInput placeholder="Search manga..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Series">
          {allSeries.map((s) => (
            <CommandItem
              key={s.id}
              value={s.name}
              onSelect={() => handleSelect(s.id)}
              className="flex items-center gap-3 py-2"
            >
              {s.anilist_cover_url ? (
                <img
                  src={s.anilist_cover_url}
                  alt=""
                  className="h-10 w-7 rounded-sm object-cover"
                />
              ) : (
                <div className="flex h-10 w-7 items-center justify-center rounded-sm bg-muted">
                  <HugeiconsIcon icon={Book02Icon} size={14} />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {s.book_count} chapters
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
