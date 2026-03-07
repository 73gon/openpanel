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
  { label: 'Reset Admin Password', href: '/docs#password-reset', section: 'Docs' },
  { label: 'Reverse Proxy (nginx)', href: '/docs#reverse-proxy', section: 'Docs' },
  { label: 'Troubleshooting', href: '/docs#troubleshooting', section: 'Docs' },
  { label: 'Library Structure', href: '/docs#library-structure', section: 'Docs' },
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
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const hasActive = navLinks.some((l) => location.pathname === l.to)

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
              className="h-8 w-8"
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
          </nav>
        )}
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Outlet />

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-10 text-center text-sm text-muted-foreground md:flex-row md:justify-between md:text-left">
          <p>&copy; {new Date().getFullYear()} OpenPanel. MIT License.</p>
          <div className="flex gap-6">
            <a
              href="https://github.com/73gon/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              to="/docs"
              className="hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
          </div>
        </div>
      </footer>
    </>
  )
}
