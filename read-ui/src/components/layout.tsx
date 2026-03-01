import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Search01Icon,
  Moon02Icon,
  Sun01Icon,
  UserCircleIcon,
  Book02Icon,
  ShieldKeyIcon,
} from '@hugeicons/core-free-icons'
import { useAppStore } from '@/lib/store'
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
  onClick,
}: {
  icon: typeof Book02Icon
  label: React.ReactNode
  to?: string
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

  if (to) return <Link to={to}>{btn}</Link>
  return btn
}

function MobileNavButton({
  icon,
  label,
  to,
  onClick,
}: {
  icon: typeof Book02Icon
  label: string
  to?: string
  onClick?: () => void
}) {
  const content = (
    <button
      className="flex flex-col items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
      onClick={onClick}
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
  const profile = useAppStore((s) => s.profile)

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden w-14 flex-col items-center justify-between border-r border-border bg-background py-4 md:flex">
        <div className="flex flex-col items-center gap-2">
          <SidebarButton icon={Book02Icon} label="Home" to="/" />
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
            label={profile ? profile.name : 'Profiles'}
            to="/profiles"
          />
          <SidebarButton icon={ShieldKeyIcon} label="Admin" to="/admin" />
          <SidebarButton
            icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
        </div>
      </aside>

      {/* Main content — add bottom padding on mobile for nav bar */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>

      {/* Mobile Bottom Nav — shown only on mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background py-2 md:hidden">
        <MobileNavButton icon={Book02Icon} label="Home" to="/" />
        <MobileNavButton
          icon={Search01Icon}
          label="Search"
          onClick={() => setCommandPaletteOpen(true)}
        />
        <MobileNavButton
          icon={UserCircleIcon}
          label={profile ? profile.name : 'Profile'}
          to="/profiles"
        />
        <MobileNavButton icon={ShieldKeyIcon} label="Admin" to="/admin" />
        <MobileNavButton
          icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
          label={theme === 'dark' ? 'Light' : 'Dark'}
          onClick={toggleTheme}
        />
      </nav>

      <CommandPalette />
    </div>
  )
}
