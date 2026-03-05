import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/docs')({ component: DocsPage })

/* ------------------------------------------------------------------ */
/*  Table of contents                                                  */
/* ------------------------------------------------------------------ */

const toc = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'library-structure', label: 'Library Structure' },
  { id: 'docker', label: 'Docker Deployment' },
  { id: 'docker-compose', label: 'Docker Compose' },
  { id: 'https', label: 'HTTPS with Caddy' },
  { id: 'bare-metal', label: 'Bare Metal (No Docker)' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'first-run', label: 'First-Run Setup' },
  { id: 'updating', label: 'Updating' },
  { id: 'pwa', label: 'PWA Installation' },
  { id: 'api', label: 'API Reference' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'faq', label: 'FAQ' },
]

/* ------------------------------------------------------------------ */
/*  Reusable components                                                */
/* ------------------------------------------------------------------ */

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-accent px-1.5 py-0.5 text-sm font-mono text-foreground">
      {children}
    </code>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-accent/60 p-4 text-sm leading-relaxed font-mono">
      {children}
    </pre>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-2xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function DocsPage() {
  const [tocOpen, setTocOpen] = useState(false)

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:py-24 lg:flex lg:gap-16">
      {/* Desktop sidebar TOC */}
      <aside className="hidden lg:block lg:w-56 lg:shrink-0">
        <nav className="sticky top-24 space-y-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            On this page
          </p>
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile TOC toggle */}
      <div className="mb-8 lg:hidden">
        <button
          onClick={() => setTocOpen((p) => !p)}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-left text-sm font-medium"
        >
          {tocOpen ? 'Hide' : 'Show'} Table of Contents
        </button>
        {tocOpen && (
          <nav className="mt-2 space-y-1 rounded-lg border border-border bg-card p-3">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => setTocOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-16">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Documentation
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Everything you need to install, configure, and run OpenPanel.
          </p>
        </div>

        {/* -------------------------------------------------------------- */}
        <Section id="quick-start" title="Quick Start">
          <p>The fastest way to get running is Docker Compose:</p>
          <Pre>{`# 1. Clone the repository
git clone https://github.com/openreader/openpanel.git
cd openpanel

# 2. Edit docker-compose.yml — update the volume mount
#    to point to your manga/comic folder

# 3. Start everything
docker compose up -d

# 4. Open http://localhost:3001
#    Create your admin account and add a library.`}</Pre>
          <p>
            That's it. OpenPanel will scan your library, generate thumbnails,
            and you can start reading immediately.
          </p>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="library-structure" title="Library Structure">
          <p>
            Organize your CBZ files in folders. Each top-level subfolder becomes
            a <strong>series</strong>. CBZ files placed directly in the root
            become standalone books.
          </p>
          <Pre>{`/path/to/manga/
├── One Piece/
│   ├── Chapter 001.cbz
│   ├── Chapter 002.cbz
│   └── ...
├── Naruto/
│   ├── Vol 01/
│   │   ├── Chapter 001.cbz
│   │   └── Chapter 002.cbz
│   └── Vol 02/
│       └── Chapter 003.cbz
└── Standalone Book.cbz`}</Pre>
          <p>
            <strong>Nested folders</strong> are supported — volumes containing
            chapters, or any depth of nesting. OpenPanel detects chapter
            boundaries automatically from folder and file names.
          </p>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="docker" title="Docker Deployment">
          <p>Build and run the Docker image directly:</p>
          <Pre>{`docker build -t openpanel .

docker run -d \\
  -p 3001:3001 \\
  -v openpanel-data:/data \\
  -v /path/to/manga:/libraries/manga:ro \\
  --name openpanel \\
  openpanel`}</Pre>
          <p>
            The <Code>:ro</Code> flag mounts your library{' '}
            <strong>read-only</strong> — OpenPanel never modifies your files.
          </p>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="docker-compose" title="Docker Compose">
          <p>
            The included <Code>docker-compose.yml</Code> sets everything up:
          </p>
          <Pre>{`services:
  openpanel:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - openpanel-data:/data
      - /your/manga/folder:/libraries/manga:ro
      - /your/comics/folder:/libraries/comics:ro
    restart: unless-stopped

volumes:
  openpanel-data:`}</Pre>
          <p>
            Update the volume paths, then run <Code>docker compose up -d</Code>.
          </p>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="https" title="HTTPS with Caddy">
          <p>
            The repo includes a <Code>Caddyfile</Code> for automatic HTTPS via
            Let's Encrypt:
          </p>
          <ol className="list-inside list-decimal space-y-2">
            <li>
              Edit <Code>Caddyfile</Code> — replace{' '}
              <Code>openpanel.example.com</Code> with your domain.
            </li>
            <li>
              In <Code>docker-compose.yml</Code>, uncomment the{' '}
              <Code>caddy</Code> service.
            </li>
            <li>
              Run <Code>docker compose up -d</Code>. Caddy handles TLS
              automatically.
            </li>
          </ol>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="bare-metal" title="Bare Metal (No Docker)">
          <p>
            You can also build and run natively. You'll need{' '}
            <strong>Rust 1.75+</strong> and <strong>Node.js 20+</strong> (or
            Bun).
          </p>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            1. Build the frontend
          </h3>
          <Pre>{`cd openpanel-ui
npm install    # or: bun install
npm run build  # outputs to openpanel-ui/dist/`}</Pre>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            2. Build the backend
          </h3>
          <Pre>{`cd openpanel-server
cargo build --release`}</Pre>

          <h3 className="mt-6 text-lg font-semibold text-foreground">3. Run</h3>
          <Pre>{`cd openpanel-server
OPENPANEL_DATA_DIR=/var/lib/openpanel \\
OPENPANEL_PORT=3001 \\
./target/release/openpanel-server`}</Pre>
          <p>
            The server automatically serves the frontend from{' '}
            <Code>../openpanel-ui/dist/</Code>.
          </p>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            Running as a systemd service
          </h3>
          <Pre>{`# /etc/systemd/system/openpanel.service
[Unit]
Description=OpenPanel manga reader
After=network.target

[Service]
Type=simple
User=openpanel
WorkingDirectory=/opt/openpanel/openpanel-server
ExecStart=/opt/openpanel/openpanel-server/target/release/openpanel-server
Environment=OPENPANEL_PORT=3001
Environment=OPENPANEL_DATA_DIR=/var/lib/openpanel
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target`}</Pre>
          <Pre>{`sudo systemctl daemon-reload
sudo systemctl enable --now openpanel`}</Pre>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="configuration" title="Configuration">
          <p>
            Configure via environment variables or a <Code>.env</Code> file in
            the <Code>openpanel-server/</Code> directory:
          </p>

          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-semibold text-foreground">
                    Variable
                  </th>
                  <th className="pb-2 pr-4 font-semibold text-foreground">
                    Default
                  </th>
                  <th className="pb-2 font-semibold text-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[
                  ['OPENPANEL_PORT', '3001', 'HTTP server port'],
                  [
                    'OPENPANEL_DATA_DIR',
                    './data',
                    'SQLite database + thumbnail storage',
                  ],
                  [
                    'DATABASE_URL',
                    'sqlite://<DATA_DIR>/openpanel.db',
                    'SQLite connection URL',
                  ],
                  [
                    'OPENPANEL_LIBRARY_ROOTS',
                    '(empty)',
                    'Comma-separated library paths to scan on startup',
                  ],
                  [
                    'OPENPANEL_DEV_MODE',
                    'false',
                    'Enable CORS for localhost dev servers',
                  ],
                  [
                    'OPENPANEL_LOG_LEVEL',
                    'info',
                    'Tracing log level (debug, info, warn, error)',
                  ],
                  [
                    'OPENPANEL_ZIP_CACHE_SIZE',
                    '200',
                    'ZIP index LRU cache size',
                  ],
                  [
                    'OPENPANEL_PUBLIC_URL',
                    'http://localhost:3001',
                    'Public URL (used for CORS)',
                  ],
                  [
                    'OPENPANEL_SCAN_ON_STARTUP',
                    'true',
                    'Auto-scan libraries on server start',
                  ],
                ].map(([v, d, desc]) => (
                  <tr key={v}>
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">
                      {v}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{d}</td>
                    <td className="py-2">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            Example .env
          </h3>
          <Pre>{`OPENPANEL_PORT=3001
OPENPANEL_DATA_DIR=./data
OPENPANEL_DEV_MODE=true
OPENPANEL_LIBRARY_ROOTS=/home/user/manga,/home/user/comics
OPENPANEL_LOG_LEVEL=info`}</Pre>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="first-run" title="First-Run Setup">
          <ol className="list-inside list-decimal space-y-3">
            <li>
              Open the app in your browser. You'll see a{' '}
              <strong>Create Admin Account</strong> form. Enter a username and
              password — this becomes the admin user.
            </li>
            <li>
              After logging in, click the <strong>shield icon</strong> in the
              sidebar (or go to the Admin page) to open the admin panel.
            </li>
            <li>
              In <strong>Libraries</strong>, click <strong>Add Library</strong>{' '}
              and enter the path to your manga folder (the container path if
              using Docker, e.g. <Code>/libraries/manga</Code>).
            </li>
            <li>
              Click <strong>Scan Now</strong>. OpenPanel indexes every CBZ file,
              generates thumbnails, and detects chapters.
            </li>
            <li>
              Go back to <strong>Home</strong> — your series are ready to read.
            </li>
          </ol>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="updating" title="Updating">
          <h3 className="text-lg font-semibold text-foreground">Docker</h3>
          <Pre>{`docker compose pull
docker compose up -d`}</Pre>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            Bare metal
          </h3>
          <Pre>{`git pull
cd openpanel-ui && npm ci && npm run build && cd ..
cd openpanel-server && cargo build --release && cd ..
sudo systemctl restart openpanel`}</Pre>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            In-app update
          </h3>
          <p>
            Admin users can check for updates and trigger an update from the
            admin panel. The server downloads the latest release, replaces the
            binary, and restarts.
          </p>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="pwa" title="PWA Installation">
          <h3 className="text-lg font-semibold text-foreground">
            Mobile (iOS / Android)
          </h3>
          <ol className="list-inside list-decimal space-y-2">
            <li>
              Open your OpenPanel URL in Safari (iOS) or Chrome (Android).
            </li>
            <li>
              Tap <strong>Share</strong> (iOS) or the{' '}
              <strong>three-dot menu</strong> (Android).
            </li>
            <li>
              Select <strong>Add to Home Screen</strong>.
            </li>
          </ol>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            Desktop (Chrome / Edge)
          </h3>
          <ol className="list-inside list-decimal space-y-2">
            <li>Open your OpenPanel URL.</li>
            <li>
              Click the <strong>install icon</strong> in the address bar.
            </li>
          </ol>

          <h3 className="mt-6 text-lg font-semibold text-foreground">
            What you get
          </h3>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <strong>Offline shell</strong> — the UI loads instantly even on
              slow connections.
            </li>
            <li>
              <strong>API caching</strong> — series lists cached with
              Network-First (5-minute expiry).
            </li>
            <li>
              <strong>Page caching</strong> — pages you've read are cached
              locally (up to 500, 7-day expiry).
            </li>
            <li>
              <strong>Auto-updates</strong> — the service worker updates
              automatically on new deployments.
            </li>
          </ul>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="api" title="API Reference">
          <p>
            All routes are under <Code>/api/</Code>. Auth routes are public;
            most others require a <Code>Bearer</Code> token in the{' '}
            <Code>Authorization</Code> header.
          </p>

          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-semibold text-foreground">
                    Method
                  </th>
                  <th className="pb-2 pr-4 font-semibold text-foreground">
                    Path
                  </th>
                  <th className="pb-2 font-semibold text-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[
                  ['GET', '/api/health', 'Health check'],
                  ['POST', '/api/auth/register', 'Register a new user'],
                  ['POST', '/api/auth/login', 'Login (returns token)'],
                  ['POST', '/api/auth/logout', 'Logout (invalidates token)'],
                  ['GET', '/api/auth/me', 'Current user info'],
                  ['GET', '/api/auth/status', 'Setup status'],
                  ['GET', '/api/libraries', 'List all libraries'],
                  ['GET', '/api/series', 'List series (sort, genre, status)'],
                  ['GET', '/api/series/:id/books', 'Books in a series'],
                  ['GET', '/api/series/:id/chapters', 'Detected chapters'],
                  ['GET', '/api/series/:id/metadata', 'AniList metadata'],
                  ['GET', '/api/genres', 'List all genres'],
                  ['GET', '/api/books/:id', 'Book details'],
                  ['GET', '/api/books/:id/pages/:num', 'Stream a page image'],
                  ['GET', '/api/books/:id/thumbnail', 'Book thumbnail (WebP)'],
                  [
                    'GET',
                    '/api/series/:id/thumbnail',
                    'Series thumbnail (WebP)',
                  ],
                  ['GET/PUT', '/api/progress', 'Reading progress'],
                  ['GET', '/api/continue-reading', 'Continue reading list'],
                  ['GET/POST', '/api/bookmarks', 'List/create bookmarks'],
                  ['DELETE', '/api/bookmarks/:id', 'Delete a bookmark'],
                  ['GET/POST', '/api/collections', 'List/create collections'],
                  [
                    'POST',
                    '/api/collections/:id/items',
                    'Add series to collection',
                  ],
                  ['GET/PUT', '/api/preferences', 'User preferences'],
                  ['GET', '/api/version', 'Server version'],
                  ['POST', '/api/admin/scan', 'Trigger library scan'],
                  ['POST', '/api/admin/libraries', 'Add a library'],
                  ['GET', '/api/admin/profiles', 'List users'],
                  ['POST', '/api/admin/backup', 'Create backup'],
                  ['POST', '/api/admin/update', 'Trigger server update'],
                ].map(([method, path, desc]) => (
                  <tr key={path}>
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">
                      {method}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">
                      {path}
                    </td>
                    <td className="py-2">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="architecture" title="Architecture">
          <Pre>{`┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  React SPA  │────▶│  Axum (Rust) │────▶│   SQLite DB  │
│  (Vite PWA) │ API │  REST API    │     │  (WAL mode)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  CBZ Files   │
                    │  (ZIP on disk│
                    └──────────────┘`}</Pre>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <strong>Backend:</strong> Rust + Axum 0.8 + SQLite (sqlx). Serves
              API and static frontend.
            </li>
            <li>
              <strong>Frontend:</strong> React 19 + TypeScript + Vite 7 +
              TanStack Router + Zustand + Tailwind v4.
            </li>
            <li>
              <strong>CBZ reading:</strong> ZIP central directory parsed once,
              cached in LRU. Pages served by seek — no extraction.
            </li>
            <li>
              <strong>Auth:</strong> Bcrypt passwords, 1-year server-side
              sessions, Bearer tokens.
            </li>
            <li>
              <strong>Metadata:</strong> AniList integration cached in SQLite.
            </li>
          </ul>
        </Section>

        {/* -------------------------------------------------------------- */}
        <Section id="faq" title="FAQ">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground">
                What file formats are supported?
              </h3>
              <p>
                CBZ (ZIP-compressed comic book archives) and folders containing
                images. Support for CBR and PDF is planned.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Can I run it on a Raspberry Pi?
              </h3>
              <p>
                Yes — the Rust backend is lightweight. Cross-compile for ARM or
                build directly on the Pi. SQLite requires minimal resources.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Does it modify my files?
              </h3>
              <p>
                Never. Library folders can be mounted read-only. OpenPanel only
                reads ZIP entries and stores metadata in its own SQLite
                database.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                How do I back up?
              </h3>
              <p>
                Use the admin panel's <strong>Backup</strong> button to create a
                database snapshot, or simply copy the <Code>data/</Code>{' '}
                directory.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Can multiple users read simultaneously?
              </h3>
              <p>
                Yes. Each user has independent progress, bookmarks, and
                preferences. SQLite in WAL mode handles concurrent reads
                efficiently.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
