import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  Link,
  useLocation,
} from '@tanstack/react-router'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'

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
] as const

function RootComponent() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <>
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo-dark-alt.png"
              alt="OpenPanel"
              className="h-8 w-8"
            />
            <span className="text-lg font-bold tracking-tight">OpenPanel</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                  location.pathname === l.to
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/openreader/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              GitHub
            </a>
          </nav>

          {/* Mobile hamburger */}
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

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="border-t border-border/40 px-6 pb-4 md:hidden">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/openreader/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              GitHub
            </a>
          </nav>
        )}
      </header>

      {/* Page content */}
      <Outlet />

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-10 text-center text-sm text-muted-foreground md:flex-row md:justify-between md:text-left">
          <p>&copy; {new Date().getFullYear()} OpenPanel. MIT License.</p>
          <div className="flex gap-6">
            <a
              href="https://github.com/openreader/openpanel"
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
