import { Link, useLocation } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon,
  Moon02Icon,
  Sun01Icon,
  UserCircleIcon,
  Book02Icon,
  ShieldKeyIcon,
  FolderLibraryIcon,
  Download04Icon,
} from '@hugeicons/core-free-icons'
import { useAppStore } from '@/lib/store'
import { usePWA } from '@/lib/use-pwa'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/command-palette'

function SidebarButton({
  icon,
  label,
  to,
  search,
  onClick,
}: {
  icon: typeof Book02Icon
  label: React.ReactNode
  to?: string
  search?: Record<string, unknown>
  onClick?: () => void
}) {
  const btn = (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={onClick}
      >
        <HugeiconsIcon icon={icon} size={20} />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )

  if (to)
    return (
      <Link to={to} search={search as any}>
        {btn}
      </Link>
    )
  return btn
}

function MobileNavButton({
  icon,
  label,
  to,
  onClick,
  active,
}: {
  icon: typeof Book02Icon
  label: string
  to?: string
  onClick?: () => void
  active?: boolean
}) {
  const handleClick = () => {
    // Haptic feedback on supported devices
    try {
      if (navigator.vibrate) navigator.vibrate(10)
    } catch {}
    onClick?.()
  }

  const content = (
    <button
      className={`flex select-none flex-col items-center gap-0.5 transition-all duration-100 active:scale-90 ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={icon} size={20} />
      <span className="text-[10px]">{label}</span>
    </button>
  )

  if (to)
    return (
      <Link to={to} className="flex flex-col items-center">
        {content}
      </Link>
    )
  return content
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen)
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)
  const user = useAppStore((s) => s.user)
  const readerActive = useAppStore((s) => s.readerActive)
  const location = useLocation()
  const pathname = location.pathname
  const { isPWA } = usePWA()
  const token = useAppStore((s) => s.token)

  // Determine active tab
  const isHome =
    pathname === '/' ||
    pathname.startsWith('/series') ||
    pathname.startsWith('/read')
  const isSearch = commandPaletteOpen
  const isDownloads = pathname === '/downloads'
  const isProfile = pathname === '/profiles' || pathname === '/admin'

  // Hide sidebar & bottom nav on sign-in page
  const isSignIn = !token && pathname === '/profiles'

  return (
    <div className="flex h-dvh bg-background text-foreground">
      {/* Desktop Sidebar  hidden on mobile & sign-in */}
      <aside
        className={`${isSignIn ? 'hidden' : 'hidden md:flex'} w-14 flex-col items-center justify-between border-r border-border bg-background py-4`}
      >
        <div className="flex flex-col items-center gap-2">
          <SidebarButton icon={Book02Icon} label="Home" to="/" />
          <SidebarButton
            icon={FolderLibraryIcon}
            label="Collections"
            to="/collections"
          />
          <Separator className="my-1 w-6" />
          <SidebarButton
            icon={Search01Icon}
            label={
              <>
                Search <kbd className="ml-1 text-xs opacity-60">Ctrl+K</kbd>
              </>
            }
            onClick={() => setCommandPaletteOpen(true)}
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <SidebarButton
            icon={UserCircleIcon}
            label={user ? user.name : 'Account'}
            to="/profiles"
          />
          {user?.is_admin && (
            <SidebarButton
              icon={ShieldKeyIcon}
              label="Admin"
              to="/admin"
              search={{ tab: 'libraries' }}
            />
          )}
          <SidebarButton
            icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
        </div>
      </aside>

      {/* Main content  add bottom padding on mobile for nav bar (unless reading) */}
      <main
        className={`flex-1 overflow-y-auto md:pb-0 ${readerActive ? 'pb-0' : 'pb-16'}`}
      >
        {children}
      </main>

      {/* Mobile Bottom Nav  hidden on desktop, while reading, and on sign-in */}
      {!readerActive && !isSignIn && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] md:hidden">
          <MobileNavButton
            icon={Book02Icon}
            label="Home"
            to="/"
            active={isHome && !isSearch && !isDownloads}
          />
          <MobileNavButton
            icon={Search01Icon}
            label="Search"
            onClick={() => setCommandPaletteOpen(true)}
            active={isSearch}
          />
          {isPWA && (
            <MobileNavButton
              icon={Download04Icon}
              label="Downloads"
              to="/downloads"
              active={isDownloads && !isSearch}
            />
          )}
          <MobileNavButton
            icon={UserCircleIcon}
            label={user ? user.name : 'Account'}
            to="/profiles"
            active={isProfile && !isSearch}
          />
        </nav>
      )}

      <CommandPalette />
    </div>
  )
}
