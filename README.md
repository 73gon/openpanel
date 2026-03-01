# 📚 Panel

A self-hosted manga and comic book reader — like Jellyfin, but for CBZ files.

**Panel** scans your CBZ comic/manga library, indexes pages from ZIP archives without extracting them, generates thumbnails, and serves a responsive web reader with continuous-scroll and single-page modes, RTL/LTR support, reading progress tracking, and multi-profile support.

---

## Features

- **Zero extraction** — pages are streamed directly from CBZ (ZIP) archives
- **Automatic scanning** — detects new/changed CBZ files in your library folders
- **Thumbnail generation** — WebP thumbnails for books and series
- **Reading modes** — continuous scroll or single-page, LTR or RTL
- **Reading progress** — tracked per-profile or per-device (guest mode)
- **Multi-profile** — Netflix-style profile picker with optional PIN
- **Admin panel** — manage libraries, profiles, trigger scans, change settings
- **Responsive** — works on desktop, tablet, and mobile
- **Keyboard shortcuts** — arrow keys, space, escape
- **Docker ready** — single multi-stage Docker image

---

## Quick Start

### Prerequisites

- **Rust** 1.75+ (for the backend)
- **Bun** or **Node.js** 20+ (for the frontend build)
- CBZ files organized in folders

### Library Structure

Organize your files like this:

```
/path/to/manga/
├── One Piece/
│   ├── Chapter 001.cbz
│   ├── Chapter 002.cbz
│   └── ...
├── Naruto/
│   ├── Vol 01.cbz
│   └── ...
└── Standalone Book.cbz
```

Each subfolder becomes a **series**. CBZ files directly in the root become standalone books. The scanner creates series from directory names and books from file names.

### Local Development

1. **Clone the repository:**

   ```bash
   git clone https://github.com/youruser/panel.git
   cd panel
   ```

2. **Install frontend dependencies:**

   ```bash
   cd read-ui
   bun install        # or: npm install
   ```

3. **Start the backend:**

   ```bash
   cd read-server
   cargo run
   ```

   The server starts on `http://localhost:3001`.

4. **Start the frontend dev server** (in a separate terminal):

   ```bash
   cd read-ui
   bun run dev        # or: npm run dev
   ```

   The dev server starts on `http://localhost:3000` and proxies `/api` calls to `:3001`.

5. **Open the app:** Go to `http://localhost:3000`

6. **First-time setup:**
   - Navigate to **Admin** (shield icon in the sidebar)
   - Set an admin password
   - Add a library — give it a name and the path to the folder containing your CBZ files (e.g., `C:\Users\user\Downloads\books`)
   - Click **Scan Now** to index your library
   - Go back **Home** to see your series

---

## Configuration

The backend is configured through environment variables (or a `.env` file in the `panel-server/` directory):

| Variable                | Default                        | Description                                                                                   |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `PORT`                  | `3001`                         | Server port                                                                                   |
| `DATA_DIR`              | `./data`                       | Where the SQLite database and thumbnails are stored                                           |
| `DATABASE_URL`          | `sqlite://<DATA_DIR>/panel.db` | SQLite database URL                                                                           |
| `LIBRARY_ROOTS`         | _(empty)_                      | Comma-separated paths to scan on startup (optional, libraries can also be added via admin UI) |
| `DEV_MODE`              | `false`                        | Enables CORS for `localhost:5173`                                                             |
| `LOG_LEVEL`             | `info`                         | Tracing log level (`debug`, `info`, `warn`, `error`)                                          |
| `ZIP_CACHE_SIZE`        | `200`                          | Number of ZIP indexes to keep in the LRU cache                                                |
| `THUMB_WIDTH`           | `320`                          | Thumbnail width in pixels                                                                     |
| `THUMB_QUALITY`         | `80`                           | WebP quality for thumbnails (0–100)                                                           |
| `ADMIN_TIMEOUT_MINUTES` | `30`                           | Admin session timeout                                                                         |
| `PUBLIC_URL`            | `http://localhost:3001`        | Public URL (used for CORS in production)                                                      |
| `SCAN_ON_STARTUP`       | `true`                         | Automatically scan libraries when the server starts                                           |

Example `.env`:

```bash
PORT=3001
DATA_DIR=./data
DEV_MODE=true
LIBRARY_ROOTS=/home/user/manga,/home/user/comics
LOG_LEVEL=info
```

---

## Docker Deployment

### Build & Run with Docker Compose

1. **Edit `docker-compose.yml`** — update the volume mounts to point to your library folders:

   ```yaml
   volumes:
     - panel-data:/data
     - /your/manga/folder:/libraries/manga:ro
     - /your/comics/folder:/libraries/comics:ro
   ```

2. **Start the stack:**

   ```bash
   docker compose up -d
   ```

3. **Access the app:** `http://your-server:3001`

4. **Add libraries via Admin:**
   - Go to Admin → enter the **container paths** (e.g., `/libraries/manga`)

### With HTTPS (Caddy)

1. Edit `Caddyfile` — replace `panel.example.com` with your domain
2. In `docker-compose.yml`, uncomment the `caddy` service
3. ```bash
   docker compose up -d
   ```
4. Caddy will automatically get an HTTPS certificate via Let's Encrypt

### Build Docker Image Only

```bash
docker build -t read .
docker run -d \
  -p 3001:3001 \
  -v read-data:/data \
  -v /path/to/manga:/libraries/manga:ro \
  --name panel \
  panel
```

---

## Production Build (No Docker)

1. **Build the frontend:**

   ```bash
   cd read-ui
   bun install           # or: npm ci
   bun run build         # or: npm run build
   ```

   This outputs static files to `read-ui/dist/`.

2. **Build the backend:**

   ```bash
   cd read-server
   cargo build --release
   ```

3. **Run:**
   ```bash
   cd read-server
   DATA_DIR=/var/lib/read PORT=3001 ./target/release/read-server
   ```
   The server serves the frontend from `read-ui/dist/` automatically.

---

## Architecture

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│  React SPA  │──────▶│  Axum (Rust) │──────▶│   SQLite DB  │
│  (Vite)     │  API  │  REST API    │       │  (WAL mode)  │
└─────────────┘       └──────┬───────┘       └──────────────┘
                             │
                     ┌───────▼───────┐
                     │  CBZ Files    │
                     │  (ZIP on disk)│
                     └───────────────┘
```

- **Backend:** Rust + Axum 0.8 + SQLite (via sqlx). Serves both the API and static frontend files.
- **Frontend:** React 19 + TypeScript + Vite, TanStack Router, Zustand, shadcn (lyra style with Base UI), Tailwind v4.
- **CBZ reading:** ZIP central directory is parsed once and cached in an LRU cache. Individual pages are read by seeking to the entry offset — no full extraction.
- **Auth model:** Three tiers — guest (device ID), profiles (Bearer token), admin (session token).
- **Metadata:** Cover images and series info fetched from Anilist and cached persistently in IndexedDB (no repeated API calls).

---

## API Reference

All API routes are under `/api/`. Quick summary:

| Method  | Path                        | Description                          |
| ------- | --------------------------- | ------------------------------------ |
| GET     | `/api/health`               | Health check                         |
| GET     | `/api/libraries`            | List all libraries                   |
| GET     | `/api/libraries/:id/series` | List series in a library (paginated) |
| GET     | `/api/series/:id/books`     | List books in a series               |
| GET     | `/api/books/:id`            | Book details                         |
| GET     | `/api/books/:id/pages/:num` | Stream a page image                  |
| GET     | `/api/books/:id/thumbnail`  | Book thumbnail (WebP)                |
| GET     | `/api/series/:id/thumbnail` | Series thumbnail (WebP)              |
| GET     | `/api/profiles`             | List profiles                        |
| POST    | `/api/profiles/:id/select`  | Select profile (returns token)       |
| POST    | `/api/profiles/logout`      | Logout current profile               |
| GET     | `/api/progress?book_id=`    | Get reading progress                 |
| PUT     | `/api/progress`             | Update reading progress              |
| POST    | `/api/progress/migrate`     | Migrate device progress to profile   |
| GET     | `/api/admin/status`         | Check if admin is set up             |
| POST    | `/api/admin/setup`          | Initial admin password setup         |
| POST    | `/api/admin/unlock`         | Admin login                          |
| GET/PUT | `/api/admin/settings`       | App settings                         |
| POST    | `/api/admin/scan`           | Trigger library scan                 |
| GET     | `/api/admin/scan/status`    | Scan progress                        |
| POST    | `/api/admin/libraries`      | Add a library                        |
| DELETE  | `/api/admin/libraries/:id`  | Remove a library                     |
| POST    | `/api/admin/profiles`       | Create a profile                     |
| DELETE  | `/api/admin/profiles/:id`   | Delete a profile                     |
| PUT     | `/api/admin/password`       | Change admin password                |

---

## License

MIT
