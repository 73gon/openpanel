import { createFileRoute, Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Book02Icon,
  Search01Icon,
  UserMultiple02Icon,
  CloudIcon,
  SmartPhone01Icon,
  ShieldKeyIcon,
  ArrowRight01Icon,
  Bookmark01Icon,
  GridViewIcon,
  PaintBrushIcon,
} from '@hugeicons/core-free-icons'

export const Route = createFileRoute('/')({ component: HomePage })

const features = [
  {
    icon: Book02Icon,
    title: 'Zero Extraction',
    description:
      'Pages stream directly from CBZ archives — no temp files, no disk thrashing.',
  },
  {
    icon: Search01Icon,
    title: 'Automatic Scanning',
    description:
      'Drop new CBZ files into your library folder. OpenPanel detects and indexes them automatically.',
  },
  {
    icon: PaintBrushIcon,
    title: 'Multiple Reading Modes',
    description:
      'Continuous scroll, single page, or double page spread. LTR and RTL. Fit width, height, or original.',
  },
  {
    icon: Bookmark01Icon,
    title: 'Bookmarks & Progress',
    description:
      'Bookmark any page with notes. Reading progress syncs across devices automatically.',
  },
  {
    icon: GridViewIcon,
    title: 'Collections',
    description:
      'Organize series into custom collections. Browse by genre, status, or your own groupings.',
  },
  {
    icon: UserMultiple02Icon,
    title: 'Multi-User',
    description:
      'Each user gets their own progress, bookmarks, and preferences. Admin panel for management.',
  },
  {
    icon: CloudIcon,
    title: 'AniList Integration',
    description:
      'Automatic metadata, cover art, and descriptions fetched from AniList.',
  },
  {
    icon: SmartPhone01Icon,
    title: 'PWA — Install Anywhere',
    description:
      'Install as a native app on iOS, Android, or desktop. Offline-capable with service worker caching.',
  },
  {
    icon: ShieldKeyIcon,
    title: 'Docker Ready',
    description:
      "Single multi-stage Docker image. docker compose up and you're running.",
  },
]

function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center md:py-36">
          <div className="mx-auto mb-6 flex size-30 items-center justify-center">
            <img
              src="/logo-dark-alt.png"
              alt="OpenPanel"
              className="size-30"
            />
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            Your manga library,{' '}
            <span className="text-primary">your server.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
            A self-hosted manga &amp; comic book reader. Like Jellyfin, but for
            CBZ files. Zero extraction, multi-user, installable as a PWA.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/docs"
              className="inline-flex items-center gap-2  bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Started
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Link>
            <a
              href="https://github.com/openreader/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2  border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-accent"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Subtle grid pattern */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
      </section>

      {/* Architecture overview */}
      <section className="border-y border-border/40 bg-accent/30">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="border border-border bg-card p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Backend
              </p>
              <p className="text-lg font-bold">Rust + Axum</p>
              <p className="mt-2 text-sm text-muted-foreground">
                High-performance async HTTP server with SQLite (WAL mode). ZIP
                central directories are parsed once and cached in an LRU cache.
              </p>
            </div>
            <div className="border border-border bg-card p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Frontend
              </p>
              <p className="text-lg font-bold">React 19 + Vite</p>
              <p className="mt-2 text-sm text-muted-foreground">
                TanStack Router, Zustand, Tailwind v4. Fully responsive SPA with
                PWA support and service worker caching.
              </p>
            </div>
            <div className="border border-border bg-card p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Storage
              </p>
              <p className="text-lg font-bold">CBZ on Disk</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pages are read by seeking directly into ZIP archives — no
                extraction, no temp files, no wasted disk space.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Everything you need
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for manga and comic readers who want full control.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center bg-accent text-primary">
                <HugeiconsIcon icon={f.icon} size={20} />
              </div>
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 bg-accent/30">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to try it?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Self-host in minutes with Docker or build from source.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Read the Docs
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
