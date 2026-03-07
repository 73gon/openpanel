# OpenPanel

A self-hosted manga and comic book reader -- like Jellyfin, but for CBZ files.

**OpenPanel** scans your CBZ comic/manga library, indexes pages from ZIP archives without extracting them, generates thumbnails, and serves a responsive web reader with continuous-scroll and single-page modes, RTL/LTR support, reading progress tracking, bookmarks, collections, and multi-user support.

---

## Features

- **Zero extraction** -- pages are streamed directly from CBZ (ZIP) archives
- **Automatic scanning** -- detects new/changed CBZ files in your library folders
- **Thumbnail generation** -- WebP thumbnails for books and series
- **Reading modes** -- continuous scroll or single-page, LTR or RTL, fit-width/fit-height/original
- **Reading progress** -- tracked per-user, server-side continue-reading
- **Bookmarks** -- bookmark pages with optional notes, accessible from a slide-out panel
- **Collections** -- organize series into custom collections
- **Multi-user** -- username/password authentication, first user becomes admin
- **Admin panel** -- manage libraries, users, settings, logs, backups, and updates
- **AniList integration** -- automatic metadata, covers, and descriptions from AniList
- **PWA** -- installable on mobile and desktop with offline caching
- **Security headers** -- X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Responsive** -- works on desktop, tablet, and mobile
- **Keyboard shortcuts** -- arrow keys, space, escape
- **Docker ready** -- single multi-stage Docker image

---

## Quick Start

### Prerequisites

- **Rust** 1.75+ (for the backend)
- **Node.js** 20+ (for the frontend build)
- CBZ files organized in folders

### Library Structure

Organize your files like this:

```
/path/to/manga/
+-- One Piece/
|   +-- Chapter 001.cbz
|   +-- Chapter 002.cbz
|   +-- ...
+-- Naruto/
|   +-- Vol 01.cbz
|   +-- ...
+-- Standalone Book.cbz
```

Each subfolder becomes a **series**. CBZ files directly in the root become standalone books.

### Local Development

1. **Clone the repository:**

   ```bash
   git clone https://github.com/youruser/openpanel.git
   cd openpanel
   ```

2. **Install frontend dependencies:**

   ```bash
   cd ui
   npm install
   ```

3. **Start the backend:**

   ```bash
   cd server
   cargo run
   ```

   The server starts on `http://localhost:3001`.

4. **Start the frontend dev server:**

   ```bash
   cd ui
   npm run dev
   ```

   The dev server starts on `http://localhost:3000` and proxies `/api` calls to `:3001`.

5. **Open the app:** Go to `http://localhost:3000`

6. **First-time setup:**
   - You will be prompted to create an admin account (username + password)
   - Add a library in the Admin panel (shield icon in the sidebar)
   - Click **Scan Now** to index your library
   - Go back **Home** to see your series

---

## Configuration

The backend is configured through environment variables (or a `.env` file in the `server/` directory):

| Variable                    | Default                            | Description                                                                                   |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `OPENPANEL_PORT`            | `3001`                             | Server port                                                                                   |
| `OPENPANEL_DATA_DIR`        | `./data`                           | Where the SQLite database and thumbnails are stored                                           |
| `DATABASE_URL`              | `sqlite://<DATA_DIR>/openpanel.db` | SQLite database URL                                                                           |
| `OPENPANEL_LIBRARY_ROOTS`   | _(empty)_                          | Comma-separated paths to scan on startup (optional, libraries can also be added via admin UI) |
| `OPENPANEL_DEV_MODE`        | `false`                            | Enables CORS for `localhost:5173`                                                             |
| `OPENPANEL_LOG_LEVEL`       | `info`                             | Tracing log level (`debug`, `info`, `warn`, `error`)                                          |
| `OPENPANEL_ZIP_CACHE_SIZE`  | `200`                              | Number of ZIP indexes to keep in the LRU cache                                                |
| `OPENPANEL_PUBLIC_URL`      | `http://localhost:3001`            | Public URL (used for CORS in production)                                                      |
| `OPENPANEL_SCAN_ON_STARTUP` | `true`                             | Automatically scan libraries when the server starts                                           |

Example `.env`:

```bash
OPENPANEL_PORT=3001
OPENPANEL_DATA_DIR=./data
OPENPANEL_DEV_MODE=true
OPENPANEL_LIBRARY_ROOTS=/home/user/manga,/home/user/comics
OPENPANEL_LOG_LEVEL=info
```

---

## Docker Deployment

### Build and Run with Docker Compose

1. **Edit `docker-compose.yml`** -- update the volume mounts to point to your library folders:

   ```yaml
   volumes:
     - openpanel-data:/data
     - /your/manga/folder:/libraries/manga:ro
     - /your/comics/folder:/libraries/comics:ro
   ```

2. **Start the stack:**

   ```bash
   docker compose up -d
   ```

3. **Access the app:** `http://your-server:3001`

4. **Add libraries via Admin:**
   - Go to Admin and enter the **container paths** (e.g., `/libraries/manga`)

### With HTTPS (Caddy)

1. Edit `Caddyfile` -- replace `openpanel.example.com` with your domain
2. In `docker-compose.yml`, uncomment the `caddy` service
3. ```bash
   docker compose up -d
   ```
4. Caddy will automatically get an HTTPS certificate via Let's Encrypt

### Build Docker Image Only

```bash
docker build -t openpanel .
docker run -d \
  -p 3001:3001 \
  -v openpanel-data:/data \
  -v /path/to/manga:/libraries/manga:ro \
  --name openpanel \
  openpanel
```

---

## Production Build (No Docker)

1. **Build the frontend:**

   ```bash
   cd ui
   npm ci
   npm run build
   ```

   This outputs static files to `ui/dist/`.

2. **Build the backend:**

   ```bash
   cd server
   cargo build --release
   ```

3. **Run:**
   ```bash
   cd server
   OPENPANEL_DATA_DIR=/var/lib/openpanel OPENPANEL_PORT=3001 ./target/release/openpanel-server
   ```
   The server serves the frontend from `ui/dist/` automatically.

---

## Architecture

```
+-------------+       +--------------+       +--------------+
|  React SPA  |------>|  Axum (Rust) |------>|   SQLite DB  |
|  (Vite PWA) |  API  |  REST API    |       |  (WAL mode)  |
+-------------+       +------+-------+       +--------------+
                             |
                     +-------v-------+
                     |  CBZ Files    |
                     |  (ZIP on disk)|
                     +---------------+
```

- **Backend:** Rust + Axum 0.8 + SQLite (via sqlx). Serves both the API and static frontend files.
- **Frontend:** React 19 + TypeScript + Vite 7, TanStack Router, Zustand, Base UI, Tailwind v4.
- **CBZ reading:** ZIP central directory is parsed once and cached in an LRU cache. Individual pages are read by seeking to the entry offset -- no full extraction.
- **Auth model:** Username/password authentication with bcrypt. First registered user is admin. Sessions stored server-side with 1-year expiry. Bearer token in Authorization header.
- **Metadata:** Cover images and series info fetched from AniList and cached server-side in SQLite.
- **PWA:** Service worker for offline shell caching, runtime caching for API responses and page images.

---

## API Reference

All API routes are under `/api/`. Auth routes are public; most others require a Bearer token.

| Method   | Path                                    | Description                           |
| -------- | --------------------------------------- | ------------------------------------- |
| GET      | `/api/health`                           | Health check                          |
| POST     | `/api/auth/register`                    | Register a new user                   |
| POST     | `/api/auth/login`                       | Login (returns token)                 |
| POST     | `/api/auth/logout`                      | Logout (invalidates token)            |
| GET      | `/api/auth/me`                          | Current user info                     |
| GET      | `/api/auth/status`                      | Setup status (needs first user?)      |
| GET      | `/api/libraries`                        | List all libraries                    |
| GET      | `/api/libraries/:id/series`             | List series in a library (paginated)  |
| GET      | `/api/series`                           | List all series (sort, genre, status) |
| GET      | `/api/series/:id/books`                 | List books in a series                |
| GET      | `/api/series/:id/chapters`              | List detected chapters in a series    |
| GET      | `/api/series/:id/metadata`              | Get/set/clear AniList metadata        |
| GET      | `/api/genres`                           | List all available genres             |
| GET      | `/api/books/:id`                        | Book details                          |
| GET      | `/api/books/:id/pages/:num`             | Stream a page image                   |
| GET      | `/api/books/:id/thumbnail`              | Book thumbnail (WebP)                 |
| GET      | `/api/series/:id/thumbnail`             | Series thumbnail (WebP)               |
| GET/PUT  | `/api/progress`                         | Get/update reading progress           |
| GET      | `/api/progress/batch`                   | Batch get progress for multiple books |
| GET      | `/api/continue-reading`                 | Continue reading list (server-side)   |
| GET/POST | `/api/bookmarks`                        | List/create bookmarks                 |
| DELETE   | `/api/bookmarks/:id`                    | Delete a bookmark                     |
| GET/POST | `/api/collections`                      | List/create collections               |
| GET/DEL  | `/api/collections/:id`                  | Get/delete a collection               |
| POST     | `/api/collections/:id/items`            | Add series to collection              |
| DELETE   | `/api/collections/:id/items/:series_id` | Remove series from collection         |
| GET/PUT  | `/api/preferences`                      | Get/update user preferences           |
| GET      | `/api/version`                          | Server version info                   |
| GET/PUT  | `/api/admin/settings`                   | App settings (admin only)             |
| POST     | `/api/admin/scan`                       | Trigger library scan                  |
| GET      | `/api/admin/scan/status`                | Scan progress                         |
| POST     | `/api/admin/libraries`                  | Add a library                         |
| PUT/DEL  | `/api/admin/libraries/:id`              | Update/remove a library               |
| GET      | `/api/admin/libraries/browse`           | Browse server directories             |
| GET/POST | `/api/admin/profiles`                   | List/create users                     |
| DELETE   | `/api/admin/profiles/:id`               | Delete a user                         |
| PUT      | `/api/admin/password`                   | Change password                       |
| POST     | `/api/admin/update`                     | Trigger server update                 |
| GET      | `/api/admin/check-update`               | Check for updates                     |
| GET      | `/api/admin/logs`                       | View admin logs                       |
| POST     | `/api/admin/backup`                     | Create database backup                |
| GET      | `/api/admin/backups`                    | List backups                          |

---

## PWA (Progressive Web App)

OpenPanel is a full PWA — you can install it as an app on any device:

### Installing on Mobile (iOS / Android)

1. Open your OpenPanel URL in the browser (Safari on iOS, Chrome on Android)
2. Tap the **Share** button (iOS) or the **three-dot menu** (Android)
3. Select **Add to Home Screen**
4. The app will launch in standalone mode — no browser chrome, feels like a native app

### Installing on Desktop (Chrome / Edge)

1. Open your OpenPanel URL
2. Click the **install icon** in the address bar (or go to ⋮ → "Install OpenPanel")
3. The app opens in its own window

### What You Get

- **Offline shell** — the app shell (HTML/CSS/JS) is cached by the service worker, so the UI loads instantly even on slow connections
- **API caching** — series lists and metadata are cached with a Network-First strategy (5-minute expiry), so browsing your library works even briefly offline
- **Page image caching** — manga pages you've read are cached locally (Cache-First, up to 500 pages, 7-day expiry), so re-reading is instant
- **Auto-updates** — the service worker updates automatically when a new version is deployed

---

## License

MIT
