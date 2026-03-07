import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Book02Icon,
  Search01Icon,
  UserMultiple02Icon,
  CloudIcon,
  SmartPhone01Icon,
  ShieldKeyIcon,
  Bookmark01Icon,
  GridViewIcon,
  PaintBrushIcon,
  Image01Icon,
  KeyboardIcon,
  Globe02Icon,
  Database02Icon,
  SquareLockIcon,
  Download01Icon,
} from '@hugeicons/core-free-icons'

export const Route = createFileRoute('/features')({ component: FeaturesPage })

const sections = [
  {
    title: 'Reading Experience',
    features: [
      {
        icon: PaintBrushIcon,
        title: 'Multiple Reading Modes',
        description:
          'Continuous vertical scroll, single-page, or double-page spread. Switch anytime without losing your place.',
      },
      {
        icon: Globe02Icon,
        title: 'LTR & RTL Support',
        description:
          'Full right-to-left reading for manga, with mirrored arrow key navigation and page ordering.',
      },
      {
        icon: Image01Icon,
        title: 'Fit Modes',
        description:
          'Fit to width, fit to height, or original size. Each reading mode remembers your preference.',
      },
      {
        icon: KeyboardIcon,
        title: 'Keyboard Shortcuts',
        description:
          'Arrow keys, Space, Escape — navigate your library and reader entirely from the keyboard.',
      },
    ],
  },
  {
    title: 'Library Management',
    features: [
      {
        icon: Book02Icon,
        title: 'Zero Extraction',
        description:
          'ZIP central directories are parsed once and cached. Pages are served by seeking directly into the archive — no temp files, no wasted disk space.',
      },
      {
        icon: Search01Icon,
        title: 'Auto-Scanning',
        description:
          'Configure library folders and OpenPanel watches for new or changed CBZ files. Trigger manual scans from the admin panel anytime.',
      },
      {
        icon: GridViewIcon,
        title: 'Collections & Genres',
        description:
          'Organize series into custom collections. Filter by genre or publication status. List or grid views.',
      },
      {
        icon: CloudIcon,
        title: 'AniList Metadata',
        description:
          'Automatic cover art, descriptions, genres, and status from AniList. Link any series with one click.',
      },
    ],
  },
  {
    title: 'User & Admin',
    features: [
      {
        icon: UserMultiple02Icon,
        title: 'Multi-User',
        description:
          'Each user gets independent reading progress, bookmarks, preferences, and collections. First user is admin.',
      },
      {
        icon: Bookmark01Icon,
        title: 'Bookmarks & Progress',
        description:
          'Bookmark any page with optional notes. Server-side progress tracking with a "Continue Reading" shelf.',
      },
      {
        icon: ShieldKeyIcon,
        title: 'Admin Panel',
        description:
          'Manage libraries, users, backups, logs, and settings. Reset user passwords, browse server directories, trigger scans, check for updates.',
      },
      {
        icon: SquareLockIcon,
        title: 'Secure by Default',
        description:
          'Bcrypt password hashing, 1-year server-side sessions, security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy).',
      },
    ],
  },
  {
    title: 'Deployment',
    features: [
      {
        icon: Download01Icon,
        title: 'Docker Ready',
        description:
          'Single multi-stage Docker image. Mount your library read-only, set one volume for data, and run.',
      },
      {
        icon: SmartPhone01Icon,
        title: 'PWA with Offline Downloads',
        description:
          'Install from the browser on any device. Service worker caches the app shell and API responses. Download chapters for offline reading — stored locally in IndexedDB with persistent storage protection.',
      },
      {
        icon: Database02Icon,
        title: 'SQLite — Zero Ops',
        description:
          'No Postgres, no Redis. A single SQLite file in WAL mode handles everything. Automatic backups from the admin panel.',
      },
    ],
  },
]

function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-60" />
        <div className="px-6 py-16 md:py-24">
          <div className="mb-16 text-center">
            <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
              Features
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Everything included — no plugins, no add-ons.
            </p>
          </div>

          <div className="space-y-20">
            {sections.map((section) => (
              <div key={section.title}>
                <h2 className="mb-8 text-2xl font-bold tracking-tight">
                  {section.title}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2">
                  {section.features.map((f) => (
                    <div
                      key={f.title}
                      className="border border-border bg-background p-6"
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center border border-border text-foreground">
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
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
