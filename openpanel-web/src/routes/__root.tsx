import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  useLocation,
} from '@tanstack/react-router'
import { useState, useRef, useEffect, useCallback } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Menu01Icon,
  Cancel01Icon,
  Search01Icon,
  Moon02Icon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'OpenPanel — Self-hosted Manga & Comic Reader' },
      {
        name: 'description',
        content:
          'A self-hosted manga and comic book reader. Like Jellyfin, but for CBZ files.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),

  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/docs', label: 'Docs' },
  { to: '/faq', label: 'FAQ' },
] as const

/* ------------------------------------------------------------------ */
/*  404 page                                                           */
/* ------------------------------------------------------------------ */

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-20" />
        <p className="text-7xl font-bold text-foreground/10">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cmd+K search                                                       */
/* ------------------------------------------------------------------ */

const searchableItems = [
  { label: 'Quick Start', href: '/docs#quick-start', section: 'Docs' },
  { label: 'Docker', href: '/docs#docker', section: 'Docs' },
  { label: 'Docker Compose', href: '/docs#docker-compose', section: 'Docs' },
  { label: 'HTTPS with Caddy', href: '/docs#https', section: 'Docs' },
  {
    label: 'Linux Installation',
    href: '/docs#linux-install',
    section: 'Docs',
  },
  {
    label: 'Windows Installation',
    href: '/docs#windows-install',
    section: 'Docs',
  },
  { label: 'Configuration', href: '/docs#configuration', section: 'Docs' },
  { label: 'First-Run Setup', href: '/docs#first-run', section: 'Docs' },
  { label: 'Updating', href: '/docs#updating', section: 'Docs' },
  { label: 'PWA Installation', href: '/docs#pwa', section: 'Docs' },
  { label: 'API Reference', href: '/docs#api', section: 'Docs' },
  { label: 'Uninstalling', href: '/docs#uninstall', section: 'Docs' },
  {
    label: 'Reset Admin Password',
    href: '/docs#password-reset',
    section: 'Docs',
  },
  {
    label: 'Reverse Proxy (nginx)',
    href: '/docs#reverse-proxy',
    section: 'Docs',
  },
  { label: 'Troubleshooting', href: '/docs#troubleshooting', section: 'Docs' },
  {
    label: 'Library Structure',
    href: '/docs#library-structure',
    section: 'Docs',
  },
  { label: 'Home', href: '/', section: 'Pages' },
  { label: 'Features', href: '/features', section: 'Pages' },
  { label: 'FAQ', href: '/faq', section: 'Pages' },
]

function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const filtered = query.trim()
    ? searchableItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.section.toLowerCase().includes(query.toLowerCase()),
      )
    : searchableItems

  const grouped = filtered.reduce(
    (acc, item) => {
      ;(acc[item.section] ??= []).push(item)
      return acc
    },
    {} as Record<string, typeof searchableItems>,
  )

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <HugeiconsIcon
            icon={Search01Icon}
            size={18}
            className="text-muted-foreground shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs, pages..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section}
              </p>
              {items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="block px-3 py-2 text-sm text-foreground/80 hover:bg-foreground/5 transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */

function RootComponent() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const hasActive = navLinks.some((l) => location.pathname === l.to)

  // Theme
  useEffect(() => {
    const saved = localStorage.getItem('op-web-theme') as
      | 'dark'
      | 'light'
      | null
    if (saved) {
      setTheme(saved)
      document.documentElement.classList.toggle('dark', saved === 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('op-web-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  const updateIndicator = useCallback(() => {
    if (!navRef.current) return
    const active = navRef.current.querySelector(
      '[data-active="true"]',
    ) as HTMLElement | null
    if (active) {
      const navRect = navRef.current.getBoundingClientRect()
      const linkRect = active.getBoundingClientRect()
      setIndicator({
        left: linkRect.left - navRect.left,
        width: linkRect.width,
      })
    }
  }, [])

  useEffect(() => {
    updateIndicator()
  }, [location.pathname, updateIndicator])

  useEffect(() => {
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [updateIndicator])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((p) => !p)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo-dark.svg"
              alt="OpenPanel"
              className="hidden h-8 w-8 dark:block"
            />
            <img
              src="/logo-light.svg"
              alt="OpenPanel"
              className="block h-8 w-8 dark:hidden"
            />
            <span className="text-lg font-bold tracking-tight">OpenPanel</span>
          </Link>

          <nav
            ref={navRef}
            className="relative hidden items-center gap-1 md:flex"
          >
            {hasActive && (
              <div
                className="nav-indicator"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
            {navLinks.map((l) => {
              const isActive = location.pathname === l.to
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  data-active={isActive}
                  className={`relative z-10 px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {l.label}
                </Link>
              )
            })}
            <a
              href="https://github.com/73gon/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 ml-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <button
              onClick={() => setSearchOpen(true)}
              className="relative z-10 ml-2 flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground border border-border/50 hover:text-foreground hover:border-foreground/20 transition-colors cursor-pointer"
            >
              <HugeiconsIcon icon={Search01Icon} size={14} />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden lg:inline text-[10px] border border-border/50 px-1 py-0.5">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={toggleTheme}
              className="relative z-10 ml-1 flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              aria-label="Toggle theme"
            >
              <HugeiconsIcon
                icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
                size={16}
              />
            </button>
          </nav>

          <button
            className="md:hidden"
            onClick={() => setMobileOpen((p) => !p)}
          >
            <HugeiconsIcon
              icon={mobileOpen ? Cancel01Icon : Menu01Icon}
              size={24}
            />
          </button>
        </div>

        {mobileOpen && (
          <nav className="border-t border-border/40 px-6 pb-4 md:hidden">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/73gon/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <HugeiconsIcon
                icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
                size={14}
              />
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </nav>
        )}
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Outlet />

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          {/* Logo + copyright */}
          <div className="flex items-center gap-2.5">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/logo-dark.svg"
                alt="OpenPanel"
                className="hidden h-5 w-5 dark:block"
              />
              <img
                src="/logo-light.svg"
                alt="OpenPanel"
                className="block h-5 w-5 dark:hidden"
              />
              <span className="text-sm font-semibold tracking-tight">
                OpenPanel
              </span>
            </Link>
            <span className="text-xs text-muted-foreground/50">&middot;</span>
            <span className="text-xs text-muted-foreground/60">
              &copy; {new Date().getFullYear()} MIT License
            </span>
          </div>

          {/* Links + socials */}
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <span className="mx-0.5 h-3.5 w-px bg-border" />
            {/* GitHub */}
            <a
              href="https://github.com/73gon/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            {/* Discord */}
            <a
              href="https://discord.gg/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
              aria-label="Discord"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
            {/* X / Twitter */}
            <a
              href="https://x.com/ryqoai"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
              aria-label="X"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}
