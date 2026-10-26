import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  Avatar,
  KbdShortcut,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  Spinner,
  useTheme,
  type ThemeMode,
} from '@zonsh/ui'
import {
  ChartPieIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  KeyboardIcon,
  LayersIcon,
  LibraryBigIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  ServerCogIcon,
  SettingsIcon,
  SunIcon,
  UserRoundIcon,
} from 'lucide-react'
import { logout } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { usePWA } from '@/lib/use-pwa'
import { cn } from '@/lib/utils'
import { OpenPanelLogo } from '@/components/openpanel-mark'
import { CommandPalette } from '@/components/command-palette'
import {
  KeyboardShortcutsOverlay,
  openKeyboardShortcuts,
} from '@/components/keyboard-shortcuts'
import { NotificationListener, useScanStatusPolling } from '@/lib/notifications'

/** Where the visitor is, for marking the current row in the sidebar and the tab bar. */
function useSection() {
  const { pathname } = useLocation()
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)
  return {
    library: pathname === '/' || pathname.startsWith('/series'),
    collections: pathname === '/collections',
    downloads: pathname === '/downloads',
    stats: pathname === '/stats',
    account: pathname === '/profiles',
    admin: pathname === '/admin',
    search: commandPaletteOpen,
  }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token)
  const { pathname } = useLocation()
  useScanStatusPolling()

  // The reader and the sign-in page stand on their own: no sidebar, no tab bar.
  const bare =
    pathname.startsWith('/read/') || (!token && pathname === '/profiles')

  // Focus management: announce route changes to screen readers.
  const [routeAnnouncement, setRouteAnnouncement] = useState('')
  const prevPathRef = useRef(pathname)
  useEffect(() => {
    if (pathname === prevPathRef.current) return
    prevPathRef.current = pathname
    const name =
      pathname === '/'
        ? 'Library'
        : pathname
            .split('/')
            .filter(Boolean)[0]
            ?.replace(/^\w/, (c) => c.toUpperCase()) || 'Page'
    setRouteAnnouncement(`Navigated to ${name}`)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      <a
        href="#main-content"
        className="fixed top-4 left-4 z-100 inline-flex min-h-(--control-h) -translate-y-20 items-center rounded-button px-4 text-sm material-primary transition-transform duration-(--duration) ease-(--ease) focus:translate-y-0"
      >
        Skip to content
      </a>

      {bare ? (
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-dvh outline-none"
        >
          {children}
        </main>
      ) : (
        <SidebarProvider collapsible="icon" storageKey="openpanel-sidebar">
          <AppSidebar />
          <SidebarInset
            id="main-content"
            tabIndex={-1}
            className="pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] outline-none md:pb-0"
          >
            {children}
          </SidebarInset>
          <TabBar />
        </SidebarProvider>
      )}

      <CommandPalette />
      <KeyboardShortcutsOverlay />
      <NotificationListener />

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {routeAnnouncement}
      </div>
    </>
  )
}

/* ── Desktop: the sidebar ─────────────────────────────────────────────────── */

function AppSidebar() {
  const user = useAppStore((s) => s.user)
  const scanRunning = useAppStore((s) => s.scanRunning)
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const { isPWA } = usePWA()
  const at = useSection()

  return (
    <Sidebar aria-label="OpenPanel">
      <SidebarHeader>
        <div className="flex min-h-(--control-h) items-center gap-2 pl-[7px] group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:pl-0">
          <Link
            to="/"
            aria-label="OpenPanel library"
            className="min-w-0 flex-1 overflow-hidden rounded-item whitespace-nowrap focus-ring group-data-[collapsible=icon]/sidebar:hidden"
          >
            <OpenPanelLogo size={18} />
          </Link>
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarItem
            render={<Link to="/" activeOptions={{ exact: true }} />}
            current={at.library}
          >
            <LibraryBigIcon />
            Library
          </SidebarItem>
          <SidebarItem
            render={<Link to="/collections" />}
            current={at.collections}
          >
            <LayersIcon />
            Collections
          </SidebarItem>
          {isPWA && (
            <SidebarItem
              render={<Link to="/downloads" />}
              current={at.downloads}
            >
              <DownloadIcon />
              Downloads
            </SidebarItem>
          )}
          <SidebarItem render={<Link to="/stats" />} current={at.stats}>
            <ChartPieIcon />
            Statistics
          </SidebarItem>
        </SidebarGroup>

        {user?.is_admin && (
          <SidebarGroup>
            <SidebarGroupLabel>Server</SidebarGroupLabel>
            {/* One row: the admin page has its own tabs for libraries, users, system and logs. */}
            <SidebarItem
              render={<Link to="/admin" search={{ tab: 'libraries' }} />}
              current={at.admin}
              tooltip={
                scanRunning ? 'Administration · scanning' : 'Administration'
              }
            >
              <ServerCogIcon />
              Administration
              {scanRunning && (
                <Spinner
                  size="sm"
                  label="Scanning libraries"
                  className="ml-auto text-muted-foreground"
                />
              )}
            </SidebarItem>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarItem
          render={<button type="button" />}
          onClick={() => setCommandPaletteOpen(true)}
        >
          <SearchIcon />
          Search
          <KbdShortcut
            keys={['mod', 'K']}
            className="ml-auto group-data-[collapsible=icon]/sidebar:hidden"
          />
        </SidebarItem>
        <SidebarSeparator />
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** The signed-in reader at the foot of the sidebar, with their own menu. */
function AccountMenu() {
  const user = useAppStore((s) => s.user)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const name = user?.name ?? 'Account'

  const signOut = async () => {
    await logout()
    navigate({ to: '/profiles' })
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarItem
            render={<button type="button" />}
            tooltip={false}
            aria-label={`Account: ${name}`}
            // A 24px avatar in place of a 16px icon: (row - avatar - border) / 2 a side in the rail.
            className="group-data-[collapsible=icon]/sidebar:px-[6px]"
          />
        }
      >
        <Avatar size="sm" name={name} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="truncate leading-tight">{name}</span>
          <span className="truncate text-xs leading-tight text-muted-foreground">
            {user?.is_admin ? 'Administrator' : 'Reader'}
          </span>
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="min-w-56">
        <MenuItem onClick={() => navigate({ to: '/profiles' })}>
          <SettingsIcon />
          Settings
        </MenuItem>
        <MenuItem onClick={openKeyboardShortcuts}>
          <KeyboardIcon />
          Keyboard shortcuts
          <MenuShortcut keys={['?']} />
        </MenuItem>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Theme</MenuGroupLabel>
          <MenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as ThemeMode)}
          >
            <MenuRadioItem value="system">
              <MonitorIcon />
              System
            </MenuRadioItem>
            <MenuRadioItem value="light">
              <SunIcon />
              Light
            </MenuRadioItem>
            <MenuRadioItem value="dark">
              <MoonIcon />
              Dark
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={signOut}>
          <LogOutIcon />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/* ── Mobile: the tab bar ──────────────────────────────────────────────────── */

function TabBar() {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const { isPWA } = usePWA()
  const at = useSection()

  return (
    <nav
      data-slot="tab-bar"
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5 pb-1">
        <li>
          <TabItem
            icon={LibraryBigIcon}
            label="Library"
            current={at.library && !at.search}
            render={<Link to="/" activeOptions={{ exact: true }} />}
          />
        </li>
        <li>
          <TabItem
            icon={LayersIcon}
            label="Collections"
            current={at.collections && !at.search}
            render={<Link to="/collections" />}
          />
        </li>
        <li>
          <TabItem
            icon={SearchIcon}
            label="Search"
            current={at.search}
            render={
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
              />
            }
          />
        </li>
        {isPWA && (
          <li>
            <TabItem
              icon={DownloadIcon}
              label="Downloads"
              current={at.downloads && !at.search}
              render={<Link to="/downloads" />}
            />
          </li>
        )}
        <li>
          <TabItem
            icon={UserRoundIcon}
            label="You"
            current={(at.account || at.stats || at.admin) && !at.search}
            render={<Link to="/profiles" />}
          />
        </li>
      </ul>
    </nav>
  )
}

/**
 * One tab: the icon in a pill that rises into the raised material when it is the current
 * section, and a short mono label under it.
 */
function TabItem({
  icon: Icon,
  label,
  current,
  render,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  current: boolean
  render: React.ReactElement<Record<string, unknown>>
}) {
  const Element = render.type as React.ElementType
  return (
    <Element
      {...render.props}
      aria-current={current ? 'page' : undefined}
      onClick={(event: React.MouseEvent) => {
        ;(
          render.props.onClick as ((e: React.MouseEvent) => void) | undefined
        )?.(event)
        try {
          navigator.vibrate?.(10)
        } catch {
          // Not every device can.
        }
      }}
      className="group/tab flex w-16 flex-col items-center gap-1 rounded-button py-0.5 focus-ring select-none"
    >
      <span
        data-current={current || undefined}
        className="flex h-8 w-14 items-center justify-center rounded-full material-row"
      >
        <Icon className="size-[18px]" />
      </span>
      <span
        className={cn(
          'font-mono text-[10px] leading-none tracking-[0.06em] uppercase transition-colors duration-(--duration) ease-(--ease)',
          current ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </Element>
  )
}
