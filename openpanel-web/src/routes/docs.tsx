import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons'

export const Route = createFileRoute('/docs')({ component: DocsPage })

/* ------------------------------------------------------------------ */
/*  Table of contents                                                  */
/* ------------------------------------------------------------------ */

const toc = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'library-structure', label: 'Library Structure' },
  { id: 'docker', label: 'Docker' },
  { id: 'docker-compose', label: 'Docker Compose' },
  { id: 'https', label: 'HTTPS with Caddy' },
  { id: 'linux-install', label: 'Linux Installation' },
  { id: 'windows-install', label: 'Windows Installation' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'first-run', label: 'First-Run Setup' },
  { id: 'updating', label: 'Updating' },
  { id: 'pwa', label: 'PWA Installation' },
  { id: 'offline-downloads', label: 'Offline Downloads' },
  { id: 'api', label: 'API Reference' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'uninstall', label: 'Uninstalling' },
  { id: 'password-reset', label: 'Password Reset' },
  { id: 'password-management', label: 'Password Management' },
  { id: 'reverse-proxy', label: 'Reverse Proxy' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
]

/* ------------------------------------------------------------------ */
/*  Scroll spy                                                         */
/* ------------------------------------------------------------------ */

function useScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0] ?? '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-20% 0px -75% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  return activeId
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function Code({ children }: { children: string }) {
  return (
    <code className="bg-foreground/10 px-1.5 py-0.5 text-sm font-mono text-foreground">
      {children}
    </code>
  )
}

function Pre({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <div className="relative border border-border/50 bg-[oklch(0.13_0_0)] dark:bg-[oklch(0.06_0_0)]">
      {title && (
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <span className="text-xs text-muted-foreground font-mono">
            {title}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {!title && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed font-mono text-foreground/90">
        {children}
      </pre>
    </div>
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

/* ---- File tree component ---- */

type TreeNode = {
  name: string
  type: 'folder' | 'file'
  children?: TreeNode[]
}

function FileTree({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <div
      className={
        depth === 0
          ? 'border border-border/50 bg-[oklch(0.13_0_0)] dark:bg-[oklch(0.06_0_0)] p-4 font-mono text-sm'
          : ''
      }
    >
      {nodes.map((node, i) => (
        <div key={`${node.name}-${i}`}>
          <div
            className="flex items-center gap-2 py-0.5 text-foreground/90"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            <span className="text-muted-foreground">
              {node.type === 'folder' ? '📁' : '📄'}
            </span>
            <span className={node.type === 'folder' ? 'font-semibold' : ''}>
              {node.name}
            </span>
          </div>
          {node.children && (
            <FileTree nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  )
}

const libraryTree: TreeNode[] = [
  {
    name: 'manga/',
    type: 'folder',
    children: [
      {
        name: 'One Piece/',
        type: 'folder',
        children: [
          { name: 'Chapter 001.cbz', type: 'file' },
          { name: 'Chapter 002.cbz', type: 'file' },
          { name: '...', type: 'file' },
        ],
      },
      {
        name: 'Naruto/',
        type: 'folder',
        children: [
          {
            name: 'Vol 01/',
            type: 'folder',
            children: [
              { name: 'Chapter 001.cbz', type: 'file' },
              { name: 'Chapter 002.cbz', type: 'file' },
            ],
          },
          {
            name: 'Vol 02/',
            type: 'folder',
            children: [{ name: 'Chapter 003.cbz', type: 'file' }],
          },
        ],
      },
      { name: 'Standalone Book.cbz', type: 'file' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function DocsPage() {
  const [tocOpen, setTocOpen] = useState(false)
  const activeId = useScrollSpy(toc.map((t) => t.id))
  const tocNavRef = useRef<HTMLElement>(null)
  const [tocIndicator, setTocIndicator] = useState({ top: 0, height: 0 })

  useEffect(() => {
    if (!tocNavRef.current) return
    const active = tocNavRef.current.querySelector(
      `[data-toc-active="true"]`,
    ) as HTMLElement | null
    if (active) {
      const navRect = tocNavRef.current.getBoundingClientRect()
      const linkRect = active.getBoundingClientRect()
      setTocIndicator({
        top: linkRect.top - navRect.top,
        height: linkRect.height,
      })
    }
  }, [activeId])

  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-60" />
        <div className="px-6 py-16 md:py-24 lg:flex lg:gap-16">
          {/* Desktop sidebar TOC — vertically centered, sliding indicator */}
          <aside className="hidden lg:block lg:w-56 lg:shrink-0">
            <nav
              ref={tocNavRef}
              className="sticky top-[50vh] -translate-y-1/2 w-full space-y-0.5"
            >
              <div
                className="toc-indicator"
                style={{ top: tocIndicator.top, height: tocIndicator.height }}
              />
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </p>
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  data-toc-active={activeId === item.id}
                  className={`block px-3 py-1.5 text-sm transition-colors ${
                    activeId === item.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Mobile TOC */}
          <div className="mb-8 lg:hidden">
            <button
              onClick={() => setTocOpen((p) => !p)}
              className="w-full border border-border px-4 py-2.5 text-left text-sm font-medium"
            >
              {tocOpen ? 'Hide' : 'Show'} Table of Contents
            </button>
            {tocOpen && (
              <nav className="mt-2 space-y-0.5 border border-border bg-background p-3">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`block border-l-2 px-3 py-1.5 text-sm transition-colors ${
                      activeId === item.id
                        ? 'border-accent-brand text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
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

            {/* ------------------------------------------------------------ */}
            <Section id="quick-start" title="Quick Start">
              <p>
                The fastest way to get running is Docker Compose. Clone the
                repository and start:
              </p>
              <Pre title="Terminal">{`git clone https://github.com/73gon/openpanel.git
cd openpanel`}</Pre>
              <p>
                Open <Code>docker-compose.yml</Code> and update the volume mount
                to point to the folder where your manga/comic CBZ files live.
                For example, if your files are at <Code>/home/user/manga</Code>,
                replace the placeholder path with that.
              </p>
              <Pre title="Terminal">{`docker compose up -d`}</Pre>
              <p>
                Open <Code>http://localhost:3001</Code> in your browser. You'll
                be prompted to create an admin account — after that, add your
                library path and OpenPanel will scan, generate thumbnails, and
                be ready instantly.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="library-structure" title="Library Structure">
              <p>
                Organize your CBZ files in folders. Each top-level subfolder
                becomes a <strong className="text-foreground">series</strong>.
                CBZ files placed directly in the root become standalone books.
              </p>
              <FileTree nodes={libraryTree} />
              <p>
                In this example, the root folder is your library path — the one
                you mount in Docker (e.g. <Code>/libraries/manga</Code>) or set
                via the admin panel. Inside it:
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong className="text-foreground">One Piece/</strong>{' '}
                  becomes a series with chapters detected from filenames
                </li>
                <li>
                  <strong className="text-foreground">Naruto/</strong> shows
                  nested volumes — OpenPanel supports any depth of nesting and
                  auto-detects chapter boundaries
                </li>
                <li>
                  <strong className="text-foreground">
                    Standalone Book.cbz
                  </strong>{' '}
                  appears as its own single-volume series
                </li>
              </ul>
              <p>
                Renaming or reorganizing folders triggers an automatic re-scan
                (file system watcher). You can also trigger a manual scan from
                the admin panel.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="docker" title="Docker">
              <p>Build the Docker image and run it directly:</p>
              <Pre title="Terminal">{`docker build -t openpanel .`}</Pre>
              <p>
                Start a container. Replace <Code>/path/to/manga</Code> with the
                absolute path to your manga/comic folder on the host machine.
                The <Code>:ro</Code> flag mounts it read-only — OpenPanel never
                modifies your files.
              </p>
              <Pre title="Terminal">{`docker run -d \\
  -p 3001:3001 \\
  -v openpanel-data:/data \\
  -v /path/to/manga:/libraries/manga:ro \\
  --name openpanel \\
  openpanel`}</Pre>
              <p>
                <Code>openpanel-data</Code> is a named Docker volume for the
                SQLite database and thumbnail cache. Your data persists across
                container restarts.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="docker-compose" title="Docker Compose">
              <p>
                The repository includes a ready-to-use{' '}
                <Code>docker-compose.yml</Code>. Update the volume paths to
                match your system:
              </p>
              <Pre title="docker-compose.yml">{`services:
  openpanel:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - openpanel-data:/data
      - /home/user/manga:/libraries/manga:ro
      - /home/user/comics:/libraries/comics:ro
    restart: unless-stopped

volumes:
  openpanel-data:`}</Pre>
              <p>
                The paths before the colon (e.g. <Code>/home/user/manga</Code>)
                are your host paths. The paths after the colon (e.g.{' '}
                <Code>/libraries/manga</Code>) are what OpenPanel sees inside
                the container — these are the paths you'll enter in the admin
                panel.
              </p>
              <Pre title="Terminal">{`docker compose up -d`}</Pre>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="https" title="HTTPS with Caddy">
              <p>
                The repo includes a <Code>Caddyfile</Code> for automatic HTTPS
                via Let's Encrypt. Three steps:
              </p>
              <ol className="list-inside list-decimal space-y-2">
                <li>
                  Open <Code>Caddyfile</Code> and replace{' '}
                  <Code>openpanel.example.com</Code> with your actual domain
                </li>
                <li>
                  In <Code>docker-compose.yml</Code>, uncomment the{' '}
                  <Code>caddy</Code> service block
                </li>
                <li>
                  Run <Code>docker compose up -d</Code> — Caddy obtains a TLS
                  certificate automatically
                </li>
              </ol>
              <p>
                Caddy also handles automatic certificate renewal. No manual SSL
                configuration required.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="linux-install" title="Linux Installation">
              <p>
                Build and run natively without Docker. You'll need{' '}
                <strong className="text-foreground">Rust 1.75+</strong> and{' '}
                <strong className="text-foreground">Node.js 20+</strong> (or
                Bun).
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Build the frontend
              </h3>
              <Pre title="Terminal">{`cd openpanel-ui
npm install
npm run build`}</Pre>
              <p>
                This outputs the compiled frontend to{' '}
                <Code>openpanel-ui/dist/</Code>. The backend serves these files
                automatically.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Build the backend
              </h3>
              <Pre title="Terminal">{`cd openpanel-server
cargo build --release`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Run
              </h3>
              <p>
                Set environment variables for the data directory and port, then
                start the server:
              </p>
              <Pre title="Terminal">{`OPENPANEL_DATA_DIR=/var/lib/openpanel \\
OPENPANEL_PORT=3001 \\
./target/release/openpanel-server`}</Pre>
              <p>
                <Code>OPENPANEL_DATA_DIR</Code> is where the SQLite database and
                thumbnail cache are stored. Create this directory beforehand and
                ensure the running user has write permissions.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                systemd service (auto-start on boot)
              </h3>
              <p>Create a service file so OpenPanel starts automatically:</p>
              <Pre title="/etc/systemd/system/openpanel.service">{`[Unit]
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
              <p>Enable and start the service:</p>
              <Pre title="Terminal">{`sudo systemctl daemon-reload
sudo systemctl enable --now openpanel`}</Pre>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="windows-install" title="Windows Installation">
              <h3 className="text-lg font-semibold text-foreground">
                Option 1: Docker Desktop
              </h3>
              <p>
                Install{' '}
                <a
                  href="https://www.docker.com/products/docker-desktop/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  Docker Desktop
                </a>{' '}
                for Windows, then clone and start:
              </p>
              <Pre title="PowerShell">{`git clone https://github.com/73gon/openpanel.git
cd openpanel`}</Pre>
              <p>
                Edit <Code>docker-compose.yml</Code> and use Windows-style paths
                for your volumes. In the example below, replace{' '}
                <Code>C:/Users/you/manga</Code> with the actual folder where
                your CBZ files are stored:
              </p>
              <Pre title="docker-compose.yml">{`services:
  openpanel:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - openpanel-data:/data
      - C:/Users/you/manga:/libraries/manga:ro
    restart: unless-stopped

volumes:
  openpanel-data:`}</Pre>
              <Pre title="PowerShell">{`docker compose up -d`}</Pre>

              <h3 className="mt-8 text-lg font-semibold text-foreground">
                Option 2: Build from Source
              </h3>
              <p>
                You'll need{' '}
                <strong className="text-foreground">Rust 1.75+</strong> (via{' '}
                <a
                  href="https://rustup.rs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  rustup
                </a>
                ), <strong className="text-foreground">Node.js 20+</strong> (or
                Bun), and the{' '}
                <strong className="text-foreground">
                  Visual Studio C++ Build Tools
                </strong>
                .
              </p>

              <h4 className="mt-4 font-semibold text-foreground">
                Build the frontend
              </h4>
              <Pre title="PowerShell">{`cd openpanel-ui
npm install
npm run build`}</Pre>

              <h4 className="mt-4 font-semibold text-foreground">
                Build the backend
              </h4>
              <Pre title="PowerShell">{`cd openpanel-server
cargo build --release`}</Pre>

              <h4 className="mt-4 font-semibold text-foreground">Run</h4>
              <p>Set environment variables and start the server:</p>
              <Pre title="PowerShell">{`$env:OPENPANEL_DATA_DIR="C:\\ProgramData\\openpanel"
$env:OPENPANEL_PORT="3001"
.\\target\\release\\openpanel-server.exe`}</Pre>
              <p>
                <Code>{'C:\\ProgramData\\openpanel'}</Code> is a good location
                for the data directory on Windows. Ensure it exists before
                starting.
              </p>

              <h4 className="mt-4 font-semibold text-foreground">
                Windows Service (auto-start on boot)
              </h4>
              <p>
                Use{' '}
                <a
                  href="https://nssm.cc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  NSSM
                </a>{' '}
                to register OpenPanel as a Windows service:
              </p>
              <Pre title="PowerShell">{`winget install nssm`}</Pre>
              <p>Register and configure the service:</p>
              <Pre title="PowerShell">{`nssm install OpenPanel "C:\\openpanel\\openpanel-server\\target\\release\\openpanel-server.exe"
nssm set OpenPanel AppDirectory "C:\\openpanel\\openpanel-server"
nssm set OpenPanel AppEnvironmentExtra OPENPANEL_PORT=3001 OPENPANEL_DATA_DIR=C:\\ProgramData\\openpanel`}</Pre>
              <p>Start the service:</p>
              <Pre title="PowerShell">{`nssm start OpenPanel`}</Pre>
              <p>
                Manage with <Code>nssm stop OpenPanel</Code>,{' '}
                <Code>nssm restart OpenPanel</Code>, or through the Windows
                Services panel (<Code>services.msc</Code>).
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="configuration" title="Configuration">
              <p>
                Configure via environment variables or a <Code>.env</Code> file
                placed in the <Code>openpanel-server/</Code> directory:
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
                    {(
                      [
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
                      ] as const
                    ).map(([v, d, desc]) => (
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
              <p>
                Place this file in <Code>openpanel-server/.env</Code>. The
                server loads it automatically on start:
              </p>
              <Pre title=".env">{`OPENPANEL_PORT=3001
OPENPANEL_DATA_DIR=./data
OPENPANEL_DEV_MODE=true
OPENPANEL_LIBRARY_ROOTS=/home/user/manga,/home/user/comics
OPENPANEL_LOG_LEVEL=info`}</Pre>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="first-run" title="First-Run Setup">
              <ol className="list-inside list-decimal space-y-3">
                <li>
                  Open the app in your browser. You'll see a{' '}
                  <strong className="text-foreground">
                    Create Admin Account
                  </strong>{' '}
                  form. Enter a username and password — this becomes the admin
                  user.
                </li>
                <li>
                  After logging in, click the{' '}
                  <strong className="text-foreground">shield icon</strong> in
                  the sidebar to open the admin panel.
                </li>
                <li>
                  In <strong className="text-foreground">Libraries</strong>,
                  click <strong className="text-foreground">Add Library</strong>{' '}
                  and enter the path to your manga folder. If using Docker,
                  enter the container path (e.g. <Code>/libraries/manga</Code>),
                  not the host path.
                </li>
                <li>
                  Click <strong className="text-foreground">Scan Now</strong>.
                  OpenPanel indexes every CBZ file, generates thumbnails, and
                  detects chapters.
                </li>
                <li>
                  Go back to <strong className="text-foreground">Home</strong> —
                  your series are ready to read.
                </li>
              </ol>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="updating" title="Updating">
              <h3 className="text-lg font-semibold text-foreground">Docker</h3>
              <Pre title="Terminal">{`docker compose pull
docker compose up -d`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Linux (native)
              </h3>
              <p>
                Pull the latest code, rebuild both frontend and backend, then
                restart:
              </p>
              <Pre title="Terminal">{`git pull
cd openpanel-ui && npm ci && npm run build && cd ..
cd openpanel-server && cargo build --release && cd ..
sudo systemctl restart openpanel`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Windows (native)
              </h3>
              <Pre title="PowerShell">{`git pull
cd openpanel-ui; npm ci; npm run build; cd ..
cd openpanel-server; cargo build --release; cd ..
nssm restart OpenPanel`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                In-app update
              </h3>
              <p>
                Admin users can check for updates and trigger an update from the
                admin panel. The server downloads the latest release, replaces
                the binary, and restarts automatically.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="pwa" title="PWA Installation">
              <h3 className="text-lg font-semibold text-foreground">
                Mobile (iOS / Android)
              </h3>
              <ol className="list-inside list-decimal space-y-2">
                <li>
                  Open your OpenPanel URL in Safari (iOS) or Chrome (Android)
                </li>
                <li>
                  Tap <strong className="text-foreground">Share</strong> (iOS)
                  or the{' '}
                  <strong className="text-foreground">three-dot menu</strong>{' '}
                  (Android)
                </li>
                <li>
                  Select{' '}
                  <strong className="text-foreground">
                    Add to Home Screen
                  </strong>
                </li>
              </ol>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Desktop (Chrome / Edge)
              </h3>
              <ol className="list-inside list-decimal space-y-2">
                <li>Open your OpenPanel URL</li>
                <li>Click the install icon in the address bar</li>
              </ol>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                What you get
              </h3>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong className="text-foreground">Offline shell</strong> —
                  the UI loads instantly even on slow connections
                </li>
                <li>
                  <strong className="text-foreground">API caching</strong> —
                  series lists cached with Network-First (5-minute expiry)
                </li>
                <li>
                  <strong className="text-foreground">Page caching</strong> —
                  pages you've read are cached locally (up to 500, 7-day expiry)
                </li>
                <li>
                  <strong className="text-foreground">Auto-updates</strong> —
                  the service worker updates automatically on new deployments
                </li>
              </ul>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="offline-downloads" title="Offline Downloads">
              <p>
                When using OpenPanel as an installed PWA, you can download
                chapters and volumes for offline reading. Downloads are stored
                locally in your browser using IndexedDB.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                How it works
              </h3>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong className="text-foreground">PWA only</strong> —
                  download buttons appear only when the app is installed (Add to
                  Home Screen). Browser users are prompted to install first.
                </li>
                <li>
                  <strong className="text-foreground">Per-page storage</strong>{' '}
                  — each page is fetched and stored as a blob in IndexedDB,
                  along with metadata (title, page count, size).
                </li>
                <li>
                  <strong className="text-foreground">
                    Persistent storage
                  </strong>{' '}
                  — on the first download, the app requests{' '}
                  <Code>navigator.storage.persist()</Code> to protect your
                  downloads from browser eviction.
                </li>
                <li>
                  <strong className="text-foreground">Downloads tab</strong> — a
                  dedicated Downloads tab in the mobile navigation lets you
                  manage all downloaded content and see storage usage.
                </li>
              </ul>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Downloading
              </h3>
              <ol className="list-inside list-decimal space-y-2">
                <li>Open a series detail page on mobile</li>
                <li>
                  Tap the download icon on any chapter/volume, or use{' '}
                  <strong className="text-foreground">Download All</strong> in
                  the section header
                </li>
                <li>Progress is shown per-item during download</li>
                <li>Downloaded items show a green checkmark</li>
              </ol>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Managing downloads
              </h3>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  Go to the{' '}
                  <strong className="text-foreground">Downloads</strong> tab
                  (mobile nav) to see all downloaded content
                </li>
                <li>Delete individual downloads or clear all at once</li>
                <li>
                  Storage usage is displayed at the bottom of the downloads page
                </li>
              </ul>
            </Section>

            {/* ------------------------------------------------------------ */}
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
                    {(
                      [
                        ['GET', '/api/health', 'Health check'],
                        ['POST', '/api/auth/register', 'Register a new user'],
                        ['POST', '/api/auth/login', 'Login (returns token)'],
                        [
                          'POST',
                          '/api/auth/logout',
                          'Logout (invalidates token)',
                        ],
                        ['GET', '/api/auth/me', 'Current user info'],
                        ['GET', '/api/auth/status', 'Setup status'],
                        ['GET', '/api/libraries', 'List all libraries'],
                        [
                          'GET',
                          '/api/series',
                          'List series (sort, genre, status)',
                        ],
                        ['GET', '/api/series/:id/books', 'Books in a series'],
                        [
                          'GET',
                          '/api/series/:id/chapters',
                          'Detected chapters',
                        ],
                        ['GET', '/api/series/:id/metadata', 'AniList metadata'],
                        ['GET', '/api/genres', 'List all genres'],
                        ['GET', '/api/books/:id', 'Book details'],
                        [
                          'GET',
                          '/api/books/:id/pages/:num',
                          'Stream a page image',
                        ],
                        [
                          'GET',
                          '/api/books/:id/thumbnail',
                          'Book thumbnail (WebP)',
                        ],
                        [
                          'GET',
                          '/api/series/:id/thumbnail',
                          'Series thumbnail (WebP)',
                        ],
                        ['GET/PUT', '/api/progress', 'Reading progress'],
                        [
                          'GET',
                          '/api/continue-reading',
                          'Continue reading list',
                        ],
                        ['GET/POST', '/api/bookmarks', 'List/create bookmarks'],
                        ['DELETE', '/api/bookmarks/:id', 'Delete a bookmark'],
                        [
                          'GET/POST',
                          '/api/collections',
                          'List/create collections',
                        ],
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
                        [
                          'PUT',
                          '/api/admin/profiles/:id/reset-password',
                          'Reset user password (admin)',
                        ],
                        ['POST', '/api/admin/backup', 'Create backup'],
                        ['POST', '/api/admin/update', 'Trigger server update'],
                      ] as const
                    ).map(([method, path, desc]) => (
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

            {/* ------------------------------------------------------------ */}
            <Section id="architecture" title="Architecture">
              <p>OpenPanel has three main components:</p>
              <div className="mt-4 grid gap-px bg-border sm:grid-cols-3 border border-border">
                <div className="bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Frontend
                  </p>
                  <p className="mt-1 font-bold text-foreground">React SPA</p>
                  <p className="mt-1 text-xs text-muted-foreground">Vite PWA</p>
                </div>
                <div className="bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Backend
                  </p>
                  <p className="mt-1 font-bold text-foreground">Axum (Rust)</p>
                  <p className="mt-1 text-xs text-muted-foreground">REST API</p>
                </div>
                <div className="bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Database
                  </p>
                  <p className="mt-1 font-bold text-foreground">SQLite</p>
                  <p className="mt-1 text-xs text-muted-foreground">WAL mode</p>
                </div>
              </div>
              <ul className="mt-4 list-inside list-disc space-y-2">
                <li>
                  <strong className="text-foreground">Backend</strong> — Rust +
                  Axum 0.8 + SQLite (sqlx). Serves API and static frontend.
                </li>
                <li>
                  <strong className="text-foreground">Frontend</strong> — React
                  19 + TypeScript + Vite 7 + TanStack Router + Zustand +
                  Tailwind v4.
                </li>
                <li>
                  <strong className="text-foreground">CBZ reading</strong> — ZIP
                  central directory parsed once, cached in LRU. Pages served by
                  seek — no extraction.
                </li>
                <li>
                  <strong className="text-foreground">Auth</strong> — Bcrypt
                  passwords, 1-year server-side sessions, Bearer tokens.
                </li>
                <li>
                  <strong className="text-foreground">Metadata</strong> —
                  AniList integration cached in SQLite.
                </li>
              </ul>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="uninstall" title="Uninstalling">
              <h3 className="text-lg font-semibold text-foreground">Docker</h3>
              <p>
                Stop and remove the containers, then optionally delete the data
                volume:
              </p>
              <Pre title="Terminal">{`docker compose down`}</Pre>
              <p>
                This stops the containers but keeps your data volume. To also
                delete the database and thumbnails:
              </p>
              <Pre title="Terminal">{`docker compose down -v`}</Pre>
              <p>To remove the Docker image as well:</p>
              <Pre title="Terminal">{`docker rmi openpanel`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Linux (native)
              </h3>
              <p>Stop and disable the service, then remove the files:</p>
              <Pre title="Terminal">{`sudo systemctl stop openpanel
sudo systemctl disable openpanel
sudo rm /etc/systemd/system/openpanel.service
sudo systemctl daemon-reload`}</Pre>
              <p>Delete the application and data directories:</p>
              <Pre title="Terminal">{`sudo rm -rf /opt/openpanel
sudo rm -rf /var/lib/openpanel`}</Pre>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Windows (native)
              </h3>
              <p>If running as a service via NSSM:</p>
              <Pre title="PowerShell">{`nssm stop OpenPanel
nssm remove OpenPanel confirm`}</Pre>
              <p>Then delete the application and data folders:</p>
              <Pre title="PowerShell">{`Remove-Item -Recurse -Force C:\\openpanel
Remove-Item -Recurse -Force C:\\ProgramData\\openpanel`}</Pre>
              <p>
                Your manga/comic files are never modified — only the database
                and thumbnail cache in the data directory are removed.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="password-reset" title="Password Reset">
              <p>
                If you've forgotten the admin password, you have several options
                depending on your access level.
              </p>

              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Option 1: Admin resets another user's password
              </h3>
              <p>
                If an admin account is accessible, go to{' '}
                <strong className="text-foreground">Admin → Profiles</strong>{' '}
                and click the lock icon next to the user. Enter a new password
                (minimum 4 characters). The user's existing sessions are
                invalidated immediately.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Option 2: Users change their own password
              </h3>
              <p>
                Any logged-in user can change their password from the{' '}
                <strong className="text-foreground">Profile</strong> page. Enter
                your current password, then set a new one.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Option 3: Delete and re-create the admin user
              </h3>
              <p>
                Stop the server, then delete the admin user from the database.
                On next startup with no users, the app will show the "Create
                Admin Account" screen again.
              </p>
              <Pre title="Terminal">{`sqlite3 data/openpanel.db "DELETE FROM profiles WHERE role = 'admin';"`}</Pre>
              <p>
                Restart the server and create a new admin account in the
                browser.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Option 4: Generate a new bcrypt hash
              </h3>
              <p>
                If you want to keep the admin user's progress and bookmarks,
                generate a new bcrypt password hash and update the record:
              </p>
              <Pre title="Terminal">{`htpasswd -nbBC 12 "" "newpassword" | tr -d ':\\n' | sed 's/$2y/$2b/'`}</Pre>
              <p>Then update the database with the generated hash:</p>
              <Pre title="Terminal">{`sqlite3 data/openpanel.db "UPDATE profiles SET password_hash = '<paste_hash>' WHERE username = 'admin';"`}</Pre>
              <p>Restart the server for changes to take effect.</p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="password-management" title="Password Management">
              <p>
                OpenPanel provides multiple ways to manage passwords depending
                on your role.
              </p>

              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Changing your own password
              </h3>
              <p>
                Navigate to your{' '}
                <strong className="text-foreground">Profile</strong> page
                (bottom nav on mobile, sidebar on desktop). Enter your current
                password and set a new one. Minimum password length is 4
                characters.
              </p>

              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Resetting another user's password (Admin)
              </h3>
              <ol className="list-inside list-decimal space-y-2">
                <li>
                  Go to{' '}
                  <strong className="text-foreground">Admin → Profiles</strong>
                </li>
                <li>Click the lock icon next to the user</li>
                <li>Enter a new password (minimum 4 characters)</li>
                <li>
                  Click{' '}
                  <strong className="text-foreground">Reset Password</strong>
                </li>
              </ol>
              <p className="mt-2">
                The user's existing sessions are invalidated immediately. They
                will need to log in again with the new password. All password
                changes are logged in the admin audit log.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="reverse-proxy" title="Reverse Proxy">
              <p>
                If you already have nginx, Traefik, or another reverse proxy,
                you can route traffic to OpenPanel's port. Here's an example
                nginx config:
              </p>
              <Pre title="nginx.conf">{`server {
    listen 443 ssl http2;
    server_name openpanel.example.com;

    ssl_certificate     /etc/letsencrypt/live/openpanel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openpanel.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`}</Pre>
              <p>
                Replace <Code>openpanel.example.com</Code> with your domain. If
                using WebSocket features in the future, add the{' '}
                <Code>Upgrade</Code> headers as well.
              </p>
              <p>
                Set <Code>OPENPANEL_PUBLIC_URL</Code> in your environment to the
                public URL (e.g. <Code>https://openpanel.example.com</Code>) so
                CORS works correctly.
              </p>
            </Section>

            {/* ------------------------------------------------------------ */}
            <Section id="troubleshooting" title="Troubleshooting">
              <div className="space-y-8">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Port already in use
                  </h3>
                  <p>
                    If port 3001 is taken, change the port via the{' '}
                    <Code>OPENPANEL_PORT</Code> environment variable:
                  </p>
                  <Pre title="Terminal">{`OPENPANEL_PORT=8080 ./target/release/openpanel-server`}</Pre>
                  <p>
                    For Docker, update the port mapping in{' '}
                    <Code>docker-compose.yml</Code>:
                  </p>
                  <Pre title="docker-compose.yml (snippet)">{`ports:
  - "8080:3001"`}</Pre>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    Changing the library path after setup
                  </h3>
                  <p>
                    Go to the admin panel → Libraries. You can add new library
                    paths or remove existing ones. After adding a new path,
                    click <strong className="text-foreground">Scan Now</strong>{' '}
                    to index it.
                  </p>
                  <p>
                    For Docker, you also need to add a new volume mount in{' '}
                    <Code>docker-compose.yml</Code> and restart the container.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    Migrating data to a new server
                  </h3>
                  <p>
                    Copy the entire data directory (<Code>{'<DATA_DIR>/'}</Code>
                    ) to the new server. This contains the SQLite database
                    (users, progress, bookmarks, library index) and thumbnail
                    cache.
                  </p>
                  <p>
                    On the new server, set <Code>OPENPANEL_DATA_DIR</Code> to
                    point to the copied directory. Ensure your library paths
                    still resolve to the same CBZ files — if the mount paths
                    differ, update them in the admin panel.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    Fixing a corrupted database
                  </h3>
                  <p>
                    If the server fails to start with SQLite errors, try running
                    an integrity check:
                  </p>
                  <Pre title="Terminal">{`sqlite3 data/openpanel.db "PRAGMA integrity_check;"`}</Pre>
                  <p>
                    If corruption is found, you can attempt a recovery by
                    exporting and reimporting:
                  </p>
                  <Pre title="Terminal">{`sqlite3 data/openpanel.db ".recover" | sqlite3 data/openpanel-recovered.db
mv data/openpanel.db data/openpanel-corrupt.db
mv data/openpanel-recovered.db data/openpanel.db`}</Pre>
                  <p>
                    As a last resort, delete the database and let OpenPanel
                    re-create it. You'll lose user accounts and reading
                    progress, but a library re-scan will restore the book index.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    Thumbnails not generating
                  </h3>
                  <p>
                    Ensure the data directory has write permissions. Thumbnails
                    are stored in <Code>{'<DATA_DIR>/thumbnails/'}</Code>. Check
                    logs with <Code>OPENPANEL_LOG_LEVEL=debug</Code> for
                    detailed error messages.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    Series not appearing after scan
                  </h3>
                  <p>
                    Verify your library path is correct — for Docker, the path
                    must match the container mount (e.g.{' '}
                    <Code>/libraries/manga</Code>), not the host path. Check
                    that your files have the <Code>.cbz</Code> extension and are
                    valid ZIP archives.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">
                    High memory usage
                  </h3>
                  <p>
                    The ZIP index cache defaults to 200 entries. If you have a
                    very large library and limited RAM, lower it:
                  </p>
                  <Pre title=".env">{`OPENPANEL_ZIP_CACHE_SIZE=50`}</Pre>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
