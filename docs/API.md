# OpenPanel API Reference

> Auto-generated from the route table. Base URL: `http://localhost:6515`

All endpoints (except `/api/health`, `/api/version`, `/api/auth/status`, `/api/auth/register`, and `/api/auth/login`) require a valid session token in the `Authorization: Bearer <token>` header.

Admin endpoints under `/api/admin/*` additionally require the authenticated profile to have `is_admin = true`.

---

## Authentication

| Method | Path                 | Description                                                        |
| ------ | -------------------- | ------------------------------------------------------------------ |
| POST   | `/api/auth/register` | Create the first admin account (only works when no profiles exist) |
| POST   | `/api/auth/login`    | Authenticate and receive a session token                           |
| POST   | `/api/auth/logout`   | Invalidate the current session                                     |
| GET    | `/api/auth/me`       | Get the current authenticated profile                              |
| GET    | `/api/auth/status`   | Check if initial setup is complete                                 |

### Register / Login

```json
// POST /api/auth/register  or  POST /api/auth/login
{
  "username": "admin",
  "password": "secret"
}

// Response 200
{
  "token": "abc123...",
  "profile": { "id": "uuid", "name": "admin", "is_admin": true }
}
```

### Auth Status

```json
// GET /api/auth/status
{ "setup_complete": true, "user_count": 2 }
```

---

## Libraries

| Method | Path                                | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/libraries`                    | List all libraries                   |
| GET    | `/api/libraries/:library_id/series` | List series in a library (paginated) |

### Query Parameters (List Series)

| Param      | Type | Default | Description    |
| ---------- | ---- | ------- | -------------- |
| `page`     | int  | 1       | Page number    |
| `per_page` | int  | 50      | Items per page |

---

## Series

| Method | Path                                      | Description                              |
| ------ | ----------------------------------------- | ---------------------------------------- |
| GET    | `/api/series`                             | All series (filterable, sortable)        |
| GET    | `/api/genres`                             | Available genre list                     |
| GET    | `/api/series/recently-added`              | Recently added series                    |
| GET    | `/api/series/recently-updated`            | Recently updated series                  |
| GET    | `/api/series/:series_id/books`            | Books in a series                        |
| GET    | `/api/series/:series_id/chapters`         | Chapters for the series (cross-book)     |
| POST   | `/api/series/:series_id/rescan`           | Re-scan a single series                  |
| GET    | `/api/series/:series_id/metadata`         | Get AniList metadata                     |
| PUT    | `/api/series/:series_id/metadata`         | Set AniList ID `{ "anilist_id": 12345 }` |
| DELETE | `/api/series/:series_id/metadata`         | Clear metadata                           |
| POST   | `/api/series/:series_id/metadata/refresh` | Re-fetch metadata from AniList           |

### All Series Query Parameters

| Param      | Type   | Description                                                     |
| ---------- | ------ | --------------------------------------------------------------- |
| `page`     | int    | Page number                                                     |
| `per_page` | int    | Items per page                                                  |
| `sort`     | string | Sort field: `name`, `updated_at`, `created_at`, `year`, `score` |
| `sort_dir` | string | `asc` or `desc`                                                 |
| `genre`    | string | Filter by genre name                                            |
| `status`   | string | Filter by AniList status                                        |
| `year`     | int    | Filter by start year                                            |

### Series Item Shape

```json
{
  "id": "uuid",
  "name": "One Piece",
  "book_count": 105,
  "book_type": "cbz",
  "year": 1997,
  "anilist_cover_url": "https://...",
  "anilist_score": 88
}
```

---

## Books

| Method | Path                           | Description                   |
| ------ | ------------------------------ | ----------------------------- |
| GET    | `/api/books/:book_id`          | Book detail                   |
| GET    | `/api/books/:book_id/chapters` | Chapters within a single book |

### Book Detail Response

```json
{
  "id": "uuid",
  "title": "Vol 01",
  "series_id": "uuid",
  "series_name": "One Piece",
  "page_count": 200,
  "file_size": 52428800,
  "metadata": {
    "writer": "Eiichiro Oda",
    "year": 1997,
    "summary": "..."
  }
}
```

---

## Reader

| Method | Path                                  | Description                       |
| ------ | ------------------------------------- | --------------------------------- |
| GET    | `/api/books/:book_id/pages/:page_num` | Serve a single page image         |
| GET    | `/api/books/:book_id/download`        | Download the original archive     |
| GET    | `/api/books/:book_id/manifest`        | Page manifest (sizes, dimensions) |
| GET    | `/api/books/:book_id/thumbnail`       | Book cover thumbnail              |
| GET    | `/api/series/:series_id/thumbnail`    | Series cover thumbnail            |

### Page Manifest

```json
{
  "book_id": "uuid",
  "page_count": 200,
  "pages": [
    {
      "page": 1,
      "url": "/api/books/uuid/pages/1",
      "entry_name": "001.jpg",
      "compressed_size": 524288,
      "uncompressed_size": 1048576,
      "width": 1600,
      "height": 2400
    }
  ]
}
```

---

## Progress

| Method | Path                                 | Description                          |
| ------ | ------------------------------------ | ------------------------------------ |
| GET    | `/api/progress?book_id=X`            | Get reading progress for a book      |
| PUT    | `/api/progress`                      | Update reading progress              |
| GET    | `/api/progress/batch?book_ids=a,b,c` | Batch progress for multiple books    |
| POST   | `/api/progress/bulk-mark`            | Bulk mark books as read/unread       |
| GET    | `/api/progress/stats`                | Reading statistics                   |
| GET    | `/api/continue-reading`              | Books currently being read           |
| GET    | `/api/series-continue?series_id=X`   | Continue point for a specific series |

### Update Progress

```json
// PUT /api/progress
{
  "book_id": "uuid",
  "page": 42,
  "is_completed": false
}
```

### Bulk Mark

```json
// POST /api/progress/bulk-mark
{
  "book_ids": ["uuid1", "uuid2"],
  "is_completed": true
}
```

### Series Continue Response

```json
{
  "action": "continue", // "continue" | "start" | "reread"
  "book_id": "uuid",
  "book_title": "Vol 03",
  "page": 42,
  "total_pages": 200,
  "progress_percent": 21.0
}
```

---

## Bookmarks

| Method | Path                          | Description               |
| ------ | ----------------------------- | ------------------------- |
| GET    | `/api/bookmarks?book_id=X`    | List bookmarks for a book |
| POST   | `/api/bookmarks`              | Create a bookmark         |
| DELETE | `/api/bookmarks/:bookmark_id` | Delete a bookmark         |

```json
// POST /api/bookmarks
{ "book_id": "uuid", "page": 42, "note": "Great panel" }
```

---

## Collections

| Method | Path                                    | Description                          |
| ------ | --------------------------------------- | ------------------------------------ |
| GET    | `/api/collections`                      | List all collections                 |
| POST   | `/api/collections`                      | Create `{ "name": "Favorites" }`     |
| GET    | `/api/collections/:id`                  | Get collection with items            |
| DELETE | `/api/collections/:id`                  | Delete collection                    |
| POST   | `/api/collections/:id/items`            | Add series `{ "series_id": "uuid" }` |
| DELETE | `/api/collections/:id/items/:series_id` | Remove series                        |

---

## Preferences

| Method | Path               | Description                      |
| ------ | ------------------ | -------------------------------- |
| GET    | `/api/preferences` | Get user preferences (JSON blob) |
| PUT    | `/api/preferences` | Update preferences               |

```json
// PUT /api/preferences
{
  "preferences": {
    "readingDirection": "rtl",
    "pageLayout": "single",
    "accentColor": "#6366f1"
  }
}
```

---

## Search

| Method | Path                               | Description                              |
| ------ | ---------------------------------- | ---------------------------------------- |
| GET    | `/api/search?q=one+piece&limit=10` | Full-text search across series and books |

```json
{
  "series": [{ "id": "uuid", "name": "One Piece", "book_count": 105, ... }],
  "books": [{ "id": "uuid", "title": "Vol 01", "series_id": "uuid", "series_name": "One Piece" }]
}
```

---

## Reading Stats

| Method | Path                 | Description              |
| ------ | -------------------- | ------------------------ |
| GET    | `/api/reading-stats` | Daily reading statistics |
| POST   | `/api/reading-stats` | Record reading activity  |

```json
// POST /api/reading-stats
{
  "pages_read": 20,
  "time_spent_seconds": 600,
  "books_completed": 0
}

// GET response
{
  "total_pages_read": 5000,
  "total_time_seconds": 86400,
  "total_books_completed": 25,
  "current_streak_days": 7,
  "daily": [
    { "date": "2025-01-15", "pages_read": 120, "time_spent_seconds": 3600, "books_completed": 1 }
  ]
}
```

---

## Admin

All admin endpoints require `is_admin = true`.

### Settings

| Method | Path                  | Description         |
| ------ | --------------------- | ------------------- |
| GET    | `/api/admin/settings` | Get server settings |
| PUT    | `/api/admin/settings` | Update settings     |

```json
{ "remote_enabled": true, "scan_on_startup": true, "update_channel": "stable" }
```

### Library Management

| Method | Path                                 | Description                                    |
| ------ | ------------------------------------ | ---------------------------------------------- |
| POST   | `/api/admin/libraries`               | Add library `{ "name": "...", "path": "..." }` |
| DELETE | `/api/admin/libraries/:id`           | Remove library                                 |
| PUT    | `/api/admin/libraries/:id`           | Update library                                 |
| GET    | `/api/admin/libraries/browse?path=/` | Browse server directories                      |

### Scanning

| Method | Path                     | Description                 |
| ------ | ------------------------ | --------------------------- |
| POST   | `/api/admin/scan`        | Trigger a full library scan |
| GET    | `/api/admin/scan/status` | Get current scan status     |
| GET    | `/api/admin/scan/stream` | SSE stream of scan progress |

### User Management

| Method | Path                                     | Description                                           |
| ------ | ---------------------------------------- | ----------------------------------------------------- |
| GET    | `/api/admin/profiles`                    | List all user profiles                                |
| POST   | `/api/admin/profiles`                    | Create profile `{ "name": "...", "password": "..." }` |
| DELETE | `/api/admin/profiles/:id`                | Delete profile                                        |
| PUT    | `/api/admin/profiles/:id/reset-password` | Reset password `{ "new_password": "..." }`            |
| PUT    | `/api/admin/password`                    | Change own password                                   |

### Logs

| Method | Path              | Description                  |
| ------ | ----------------- | ---------------------------- |
| GET    | `/api/admin/logs` | Query admin logs             |
| POST   | `/api/admin/log`  | Submit client-side log entry |

Query params: `level`, `category`, `profile_id`, `ip_address`, `limit`

### Backups

| Method | Path                 | Description             |
| ------ | -------------------- | ----------------------- |
| POST   | `/api/admin/backup`  | Trigger database backup |
| GET    | `/api/admin/backups` | List available backups  |

### Updates

| Method | Path                      | Description                 |
| ------ | ------------------------- | --------------------------- |
| POST   | `/api/admin/update`       | Trigger self-update         |
| GET    | `/api/admin/check-update` | Check for available updates |

### Devices

| Method | Path                     | Description             |
| ------ | ------------------------ | ----------------------- |
| GET    | `/api/admin/devices`     | List registered devices |
| DELETE | `/api/admin/devices/:id` | Remove device           |

### Data Export / Import

| Method | Path                    | Description                                         |
| ------ | ----------------------- | --------------------------------------------------- |
| GET    | `/api/user-data/export` | Export user data (progress, bookmarks, collections) |
| POST   | `/api/user-data/import` | Import user data                                    |

### System

| Method | Path                 | Description                        |
| ------ | -------------------- | ---------------------------------- |
| GET    | `/api/health`        | Quick health check (no auth)       |
| GET    | `/api/health/detail` | Detailed health (db, disk, counts) |
| GET    | `/api/version`       | Build version info (no auth)       |
| GET    | `/api/admin/db-size` | Database size breakdown            |

### Notifications

| Method | Path                        | Description             |
| ------ | --------------------------- | ----------------------- |
| GET    | `/api/notifications/stream` | SSE notification stream |

Events: `scan_complete`, `new_books`, `backup_complete`

---

## Error Responses

All errors return JSON:

```json
{ "error": "Human-readable message" }
```

| Status | Meaning                        |
| ------ | ------------------------------ |
| 400    | Bad request / validation error |
| 401    | Missing or invalid auth token  |
| 404    | Resource not found             |
| 429    | Rate limited                   |
| 500    | Internal server error          |
