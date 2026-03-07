import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon } from '@hugeicons/core-free-icons'

export const Route = createFileRoute('/faq')({ component: FaqPage })

/* ------------------------------------------------------------------ */
/*  FAQ data                                                           */
/* ------------------------------------------------------------------ */

const faqs = [
  {
    q: 'What file formats are supported?',
    a: 'OpenPanel reads CBZ (Comic Book ZIP) files. Each CBZ is a standard ZIP archive containing image files (JPEG, PNG, WebP). Support for CBR, PDF, and EPUB is on the roadmap.',
  },
  {
    q: 'Is my data safe? Does OpenPanel modify my files?',
    a: 'OpenPanel never writes to your library folders. When using Docker, libraries are mounted read-only (:ro). The only data OpenPanel writes is its own database and thumbnail cache in the data directory.',
  },
  {
    q: 'Can I access OpenPanel from my phone or tablet?',
    a: 'Yes. OpenPanel is a Progressive Web App (PWA). Open the URL in your mobile browser and tap "Add to Home Screen" for a native app-like experience with offline support and page caching.',
  },
  {
    q: 'How does chapter detection work?',
    a: 'OpenPanel parses filenames and folder names for chapter and volume numbers using pattern matching. It supports formats like "Chapter 001.cbz", "Ch.1.cbz", "Vol 01/Ch 01.cbz", and more. If detection is wrong, renaming the file fixes it.',
  },
  {
    q: 'Can multiple users share one instance?',
    a: 'Yes. Create additional accounts from the admin panel. Each user gets their own reading progress, bookmarks, collections, and preferences. Only admin users can manage libraries and other accounts.',
  },
  {
    q: 'Where is metadata fetched from?',
    a: 'OpenPanel uses the AniList API for series metadata (descriptions, genres, cover art, status). Metadata is cached in the local SQLite database. You can manually trigger a metadata refresh from the series detail page.',
  },
  {
    q: 'How do I back up my data?',
    a: 'The entire state lives in the data directory (default: ./data). Copy this folder to back up everything — the SQLite database (users, progress, bookmarks, library index) and the thumbnail cache. You can also trigger a backup from the admin panel.',
  },
  {
    q: 'Can I run OpenPanel behind a reverse proxy?',
    a: 'Yes. OpenPanel works behind nginx, Traefik, Caddy, or any reverse proxy. See the Reverse Proxy section in the docs for an nginx example. Set OPENPANEL_PUBLIC_URL to your domain for CORS to work correctly.',
  },
  {
    q: 'What are the system requirements?',
    a: 'OpenPanel is lightweight. The Rust backend uses minimal RAM (~30-50 MB idle). Docker requires Docker Engine 20+ or Docker Desktop. For native builds: Rust 1.75+ and Node.js 20+. Any modern x86_64 or ARM64 system works.',
  },
  {
    q: 'How do I update OpenPanel?',
    a: 'For Docker: run "docker compose pull && docker compose up -d". For native builds: git pull, rebuild frontend and backend, restart the service. Admin users can also trigger updates from the admin panel.',
  },
  {
    q: 'Does OpenPanel support reading right-to-left (manga style)?',
    a: 'Yes. The reader supports both left-to-right and right-to-left reading modes. You can set the default in your user preferences and override it per-series.',
  },
  {
    q: 'Can I organize series into collections?',
    a: 'Yes. Create named collections from the UI and add any series to them. Collections are per-user, so each reader can organize their library differently.',
  },
  {
    q: 'What happens if I add new files to my library?',
    a: 'OpenPanel watches your library folders for changes using a file system watcher. New files are detected and indexed automatically within seconds. You can also trigger a manual scan from the admin panel.',
  },
  {
    q: 'Is there an API I can use?',
    a: 'Yes. OpenPanel exposes a REST API under /api/. See the API Reference section in the docs for all available endpoints. Authenticate with a Bearer token from the login endpoint.',
  },
  {
    q: 'How do I reset my password?',
    a: "Users can change their own password from the Profile page. Admins can reset any user's password from the Admin panel → Profiles tab. If you've lost admin access entirely, see the Password Reset section in the docs for database-level recovery options.",
  },
  {
    q: 'Can I download chapters for offline reading?',
    a: 'Yes, when using OpenPanel as an installed PWA (Add to Home Screen). The Downloads tab appears in the mobile navigation, and you can download individual chapters or entire series from the series detail page. Downloads are stored locally in your browser using IndexedDB with persistent storage protection.',
  },
  {
    q: "Can an admin reset another user's password?",
    a: "Yes. Go to Admin → Profiles, click the lock icon next to any user, and enter a new password. The user's existing sessions are invalidated and they'll need to log in with the new password.",
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function FaqPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return faqs
    const lower = search.toLowerCase()
    return faqs.filter(
      (f) =>
        f.q.toLowerCase().includes(lower) || f.a.toLowerCase().includes(lower),
    )
  }, [search])

  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-60" />
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Quick answers to common questions about OpenPanel.
          </p>

          {/* Search */}
          <div className="relative mt-8">
            <HugeiconsIcon
              icon={Search01Icon}
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
            />
          </div>

          {/* Results */}
          <div className="mt-8 divide-y divide-border border border-border bg-background">
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground">
                No questions match your search.
              </div>
            )}
            {filtered.map((faq, i) => (
              <details key={i} className="group bg-background">
                <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-[15px] font-medium text-foreground select-none hover:bg-white/2 transition-colors">
                  {faq.q}
                  <span className="ml-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="px-6 pb-4 text-[15px] leading-relaxed text-muted-foreground">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>

          {filtered.length > 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              {filtered.length} of {faqs.length} questions shown
              {search && ' — '}
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-foreground underline underline-offset-2 cursor-pointer"
                >
                  clear search
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
