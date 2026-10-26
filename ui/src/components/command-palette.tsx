import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  toast,
  useCommandShortcut,
  useTheme,
  type CommandEntry,
  type CommandGroupData,
} from '@zonsh/ui'
import {
  ChartColumnIcon,
  DownloadIcon,
  FolderIcon,
  KeyboardIcon,
  LibraryBigIcon,
  LibraryIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  ServerCogIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { usePWA } from '@/lib/use-pwa'
import {
  fetchLibraries,
  fetchSeries,
  getSeriesThumbnailUrl,
  logout,
  startScan,
  type Series,
} from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import { countLabel } from '@/lib/utils'
import { openKeyboardShortcuts } from '@/components/keyboard-shortcuts'

/** Every series in every library, for searching by name. */
async function fetchSearchIndex(): Promise<Series[]> {
  const libraries = await fetchLibraries()
  const pages = await Promise.all(
    libraries.map((lib) => fetchSeries(lib.id, 1, 200)),
  )
  return pages.flatMap((p) => p.series)
}

/** "Jujutsu Kaisen" is also found as "jujutsukaisen". */
const squash = (s: string) => s.toLowerCase().replace(/[\s\-_:.'’!?]+/g, '')

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen)
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const user = useAppStore((s) => s.user)
  const token = useAppStore((s) => s.token)
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { isPWA } = usePWA()

  useCommandShortcut(() => {
    if (token) setOpen(!useAppStore.getState().commandPaletteOpen)
  })

  const { data: series = [] } = useQuery({
    queryKey: ['searchIndex'],
    queryFn: fetchSearchIndex,
    enabled: open && !!token,
    staleTime: 5 * 60_000,
  })

  const covers = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of series)
      map.set(
        `series:${s.id}`,
        s.anilist_cover_url ?? getSeriesThumbnailUrl(s.id),
      )
    return map
  }, [series])

  const items = useMemo<CommandEntry[]>(() => {
    const go = (to: string, search?: Record<string, string>) => () =>
      navigate({ to, search } as Parameters<typeof navigate>[0])

    const entries: CommandEntry[] = series.map((s) => {
      const name = displaySeriesName(s.name, s.anilist_id)
      return {
        value: `series:${s.id}`,
        label: name,
        group: 'Series',
        keywords: [s.name, squash(name)],
        hint: countLabel(
          s.book_count,
          s.book_type === 'volume' ? 'volume' : 'chapter',
        ),
        onSelect: () =>
          navigate({ to: '/series/$seriesId', params: { seriesId: s.id } }),
      }
    })

    entries.push(
      {
        value: 'page:library',
        label: 'Library',
        group: 'Pages',
        icon: <LibraryBigIcon />,
        onSelect: go('/'),
      },
      {
        value: 'page:collections',
        label: 'Collections',
        group: 'Pages',
        icon: <LibraryIcon />,
        onSelect: go('/collections'),
      },
      ...(isPWA
        ? [
            {
              value: 'page:downloads',
              label: 'Downloads',
              group: 'Pages',
              icon: <DownloadIcon />,
              onSelect: go('/downloads'),
            },
          ]
        : []),
      {
        value: 'page:stats',
        label: 'Statistics',
        group: 'Pages',
        keywords: ['streak', 'reading'],
        icon: <ChartColumnIcon />,
        onSelect: go('/stats'),
      },
      {
        value: 'page:settings',
        label: 'Settings',
        group: 'Pages',
        keywords: ['account', 'password', 'reader'],
        icon: <SettingsIcon />,
        onSelect: go('/profiles'),
      },
    )

    if (user?.is_admin) {
      entries.push(
        {
          value: 'admin:libraries',
          label: 'Libraries',
          group: 'Server',
          icon: <FolderIcon />,
          onSelect: go('/admin', { tab: 'libraries' }),
        },
        {
          value: 'admin:users',
          label: 'Users',
          group: 'Server',
          keywords: ['profiles'],
          icon: <UsersIcon />,
          onSelect: go('/admin', { tab: 'profiles' }),
        },
        {
          value: 'admin:system',
          label: 'System',
          group: 'Server',
          keywords: ['updates', 'backup', 'settings'],
          icon: <ServerCogIcon />,
          onSelect: go('/admin', { tab: 'settings' }),
        },
        {
          value: 'admin:logs',
          label: 'Logs',
          group: 'Server',
          icon: <ScrollTextIcon />,
          onSelect: go('/admin', { tab: 'logs' }),
        },
        {
          value: 'action:scan',
          label: 'Scan libraries',
          group: 'Server',
          keywords: ['rescan', 'refresh'],
          icon: <RefreshCwIcon />,
          onSelect: () => {
            startScan()
              .then(() => {
                useAppStore.getState().setScanRunning(true)
                toast.info('Scanning your libraries.')
              })
              .catch((err: Error) =>
                toast.error('The scan did not start.', {
                  description: err.message,
                }),
              )
          },
        },
      )
    }

    entries.push(
      {
        value: 'theme:light',
        label: 'Light theme',
        group: 'Appearance',
        icon: <SunIcon />,
        onSelect: () => setTheme('light'),
      },
      {
        value: 'theme:dark',
        label: 'Dark theme',
        group: 'Appearance',
        icon: <MoonIcon />,
        onSelect: () => setTheme('dark'),
      },
      {
        value: 'theme:system',
        label: 'System theme',
        group: 'Appearance',
        keywords: ['auto'],
        icon: <MonitorIcon />,
        onSelect: () => setTheme('system'),
      },
      {
        value: 'action:shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Help',
        icon: <KeyboardIcon />,
        hint: '?',
        onSelect: openKeyboardShortcuts,
      },
      {
        value: 'action:sign-out',
        label: 'Sign out',
        group: 'Help',
        icon: <LogOutIcon />,
        onSelect: () => {
          logout().then(() => navigate({ to: '/profiles' }))
        },
      },
    )
    return entries
  }, [series, user?.is_admin, isPWA, navigate, setTheme])

  if (!token) return null

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      items={items}
      label="Search OpenPanel"
    >
      <CommandInput placeholder="Search series, pages and actions…" />
      <CommandEmpty>No series or page matches that.</CommandEmpty>
      <CommandList>
        {(group: CommandGroupData) => (
          <CommandGroup
            key={group.value}
            items={group.items}
            label={group.value}
          >
            {(entry: CommandEntry) => {
              const cover = covers.get(entry.value)
              if (!cover) return <CommandItem key={entry.value} value={entry} />
              return (
                <CommandItem key={entry.value} value={entry}>
                  <span className="h-7 w-5 shrink-0 overflow-hidden border border-border bg-muted">
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {entry.hint}
                  </span>
                </CommandItem>
              )
            }}
          </CommandGroup>
        )}
      </CommandList>
      <CommandFooter />
    </CommandDialog>
  )
}
