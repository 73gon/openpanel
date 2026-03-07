import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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

/* ------------------------------------------------------------------ */
/*  Hero grid cell flash — triangles at 4 corners, 3 cells each        */
/* ------------------------------------------------------------------ */
const gridCells = [
  // Top-left: row0-col1, row1-col0  → ▟ pointing top-left
  { x: 65, y: 0 },
  { x: 1, y: 64 },
  // Top-right: row0-col0, row1-col1  → ▙ pointing top-right
  { x: 1025, y: 0 },
  { x: 1089, y: 64 },
  // Bottom-right: row0-col1, row1-col0  → ▛ pointing bottom-right
  { x: 1089, y: 640 },
  { x: 1025, y: 704 },
  // Bottom-left: row0-col0, row1-col1  → ▜ pointing bottom-left
  { x: 1, y: 640 },
  { x: 65, y: 704 },
]

/* ------------------------------------------------------------------ */
/*  Features data                                                      */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Logo animation comparison                                          */
/* ------------------------------------------------------------------ */
const logoRects = [
  { x: 226.64, y: 56.27, width: 36.77, height: 93.21 },
  { x: 55.23, y: 112.7, width: 264.6, height: 36.77 },
  { x: 57.39, y: 225.61, width: 262.44, height: 36.77 },
  { x: 170.19, y: 225.52, width: 36.77, height: 93.23 },
]

const logoColors = [
  'var(--foreground)',
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#8a05ff',
  '#f97316',
  '#f43f5e',
]

function AnimatedLogo({ variant }: { variant: string }) {
  return (
    <svg
      viewBox="0 0 375 375"
      className={`h-full w-full logo-anim-${variant}`}
      style={{ overflow: 'visible' }}
    >
      {logoRects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          className="fill-current"
        />
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Screenshots                                                        */
/* ------------------------------------------------------------------ */
const screenshots = [
  {
    label: 'Library Home',
    description: 'Browse your entire collection at a glance.',
    src: '/screenshots/home.png',
  },
  {
    label: 'Series & Chapters',
    description: 'AniList metadata, chapter detection, and reading progress.',
    src: '/screenshots/series.png',
  },
  {
    label: 'Reader',
    description: 'Clean reading experience with multiple viewing modes.',
    src: '/screenshots/reader.png',
  },
]

/* ------------------------------------------------------------------ */
/*  Showcase A: Browser Mockup with Interactive Tabs                   */
/* ------------------------------------------------------------------ */
function ShowcaseBrowser() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div>
      <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border shadow-2xl shadow-black/20">
        {/* Chrome */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 rounded-md bg-muted/50 px-3 py-1 text-center text-xs text-muted-foreground">
            openpanel.app
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-border bg-card/50">
          {screenshots.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setActiveTab(i)}
              className={`relative cursor-pointer px-5 py-2.5 text-sm font-medium transition-colors ${
                i === activeTab
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
              }`}
            >
              {s.label}
              {i === activeTab && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground transition-all" />
              )}
            </button>
          ))}
        </div>
        {/* Viewport */}
        <div className="relative aspect-video bg-black">
          {screenshots.map((s, i) => (
            <img
              key={s.label}
              src={s.src}
              alt={s.label}
              className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${
                i === activeTab ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}
        </div>
        {/* Caption */}
        <div className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
          <p className="text-sm font-medium">{screenshots[activeTab].label}</p>
          <p className="text-sm text-muted-foreground">
            {screenshots[activeTab].description}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
function HomePage() {
  const [colorIndex, setColorIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(
      () => setColorIndex((i) => (i + 1) % logoColors.length),
      4000,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      {/* Hero */}
      <section
        className="relative flex min-h-144 items-center overflow-hidden border-b border-border"
        style={{ '--logo-color': logoColors[colorIndex] } as React.CSSProperties}
      >
        {/* Grid pattern background */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-100" />
        {/* Accent glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[40%] w-[70%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(138,5,255,0.06)_0%,transparent_70%)]" />

        {/* Grid cell flashes — behind content */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 1 }}
        >
          {gridCells.map((cell, i) => (
            <div
              key={i}
              className="grid-cell-flash"
              data-cell={i}
              style={{
                left: cell.x,
                top: cell.y,
              }}
            />
          ))}
        </div>

        {/* Content — above traces */}
        <div className="relative z-10 w-full px-6 py-28 text-center md:py-39">
          <div className="mx-auto mb-8 flex h-28 w-28 justify-center md:h-36 md:w-36">
            <AnimatedLogo variant="c" />
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            Your manga library,{' '}
            <span className="text-foreground">your server.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
            A self-hosted manga &amp; comic book reader. Like Jellyfin, but for
            CBZ files. Zero extraction, multi-user, installable as a PWA.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/docs"
              className="btn-get-started inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
            >
              Get Started
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Link>
            <a
              href="https://github.com/73gon/openpanel"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border bg-background px-6 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Architecture — boxed grid */}
      <section className="border-b border-border">
        <div className="px-6 py-16 md:py-20">
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              {
                label: 'Backend',
                tech: 'Rust + Axum',
                desc: 'High-performance async HTTP server with SQLite (WAL mode). ZIP central directories are parsed once and cached in an LRU cache.',
              },
              {
                label: 'Frontend',
                tech: 'React 19 + Vite',
                desc: 'TanStack Router, Zustand, Tailwind v4. Fully responsive SPA with PWA support and service worker caching.',
              },
              {
                label: 'Storage',
                tech: 'CBZ on Disk',
                desc: 'Pages are read by seeking directly into ZIP archives — no extraction, no temp files, no wasted disk space.',
              },
            ].map((item) => (
              <div key={item.label} className="bg-background p-6">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </p>
                <p className="text-lg font-bold">{item.tech}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-b border-border">
        <div className="px-6 py-20 md:py-28">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for manga and comic readers who want full control.
            </p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group bg-background p-6 transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center border-border text-foreground">
                  <HugeiconsIcon icon={f.icon} size={20} />
                </div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* See it in action */}
      <section className="border-b border-border">
        <div className="px-6 py-20 md:py-28">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              See it in action
            </h2>
            <p className="mt-3 text-muted-foreground">
              A clean, fast reading experience across every device.
            </p>
          </div>

          <ShowcaseBrowser />
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to try it?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Self-host in minutes with Docker or build from source.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
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
