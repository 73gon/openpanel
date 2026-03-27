# OpenPanel — Comprehensive Optimization Plan

> Generated: March 27, 2026
> Covers: Backend (Rust/Axum), Frontend (React/Vite), Infrastructure (Docker/Caddy/CI)

---

## Phase 1: Backend — Code Quality & Dead Code Cleanup

1. **Remove dead code:**
   - Delete `ensure_library()` in `server/src/scanner.rs`
   - Remove `UnsupportedCompression` variant from `server/src/error.rs`
   - Remove `guest_enabled` column (new migration)
   - Clean up ignored `_library_roots` parameter in `scan_libraries()`
2. **Remove dead frontend files:**
   - Delete `ui/public/__root.tsx` (stale copy, never compiled)
   - Delete `ui/src/components/component-example.tsx` (dev showcase in prod bundle)
   - Delete `ui/src/components/example.tsx`
3. **Use typed DB models** — replace tuple `query_as` calls with existing structs in `server/src/db/models.rs`
4. **Deduplicate `extract_year`** — shared utility for `anilist.rs` and `library.rs`
5. **Extract bcrypt helper** — single `hash_password()` / `verify_password()` with `spawn_blocking`
6. **Consolidate `data_dir`** — remove env var re-reads in `scanner.rs`, pass `config.data_dir`
7. **Extract `book_type` subquery** — SQL view or Rust helper for the volume/chapter detection repeated 4× in `library.rs`
8. **Consolidate shared frontend types** — move `AuthUser` and `SectionVisibility` to a `types.ts` file

---

## Phase 2: Backend — Performance

9. **Wire ZipIndexCache** into page streaming (`reader.rs`) — use existing LRU cache from `cache.rs`
10. **Stream book downloads** — replace `tokio::fs::read` with `ReaderStream`
11. **Faster thumbnail filter** — switch `Lanczos3` → `CatmullRom`
12. **Thumbnail request coalescing** — per-book lock to prevent duplicate generation
13. **Parallel scanning** — `tokio::task::JoinSet` for concurrent CBZ processing
14. **Shared `reqwest::Client`** — add to `AppState`, use everywhere
15. **Add missing indexes** — migration: `series(sort_name, created_at, updated_at)`, `books(sort_order)`, `series(anilist_start_year, anilist_score)`
16. **Periodic log pruning** — every 100th insert instead of every insert
17. **Rate limiter cleanup** — background task to remove stale IPs
18. **Extract page dimensions** during scan — populate `width`/`height` in pages table

---

## Phase 3: Backend — Security

19. **Require auth on all content endpoints** — pages, thumbnails, library browsing, series
20. **Bump bcrypt cost** to 12 (rehash on next login)
21. **Redact `Internal` errors** — generic message to clients
22. **Fix rate limit status code** — `429` instead of `400`
23. **Add CSP and HSTS headers**
24. **Safer VACUUM INTO** — avoid string interpolation in SQL
25. **Rate limit log submission** endpoint

---

## Phase 4: Backend — Enhanced Logging System

26. **Extend `admin_logs` schema** — add: `profile_id`, `profile_name`, `ip_address`, `user_agent`, `request_duration_ms`
27. **Update `log_admin_event`** to accept structured fields
28. **Add request tracing middleware** — request IDs, duration, user ID, IP
29. **Log new event types:** page views, auth events (login/logout/fail), search queries, all errors
30. **Update logs API** — filters for user, IP; sorting; full field coverage

---

## Phase 5: Backend — New Features

31. **Server-side search** — `GET /api/search?q=...`
32. **Configurable auto-scan interval** — admin setting + background timer
33. **SSE for scan progress** — `GET /api/admin/scan/stream`
34. **ComicInfo.xml parsing** (fallback; AniList takes priority)
35. **CBR (RAR) + PDF + EPUB support** — new format handlers
36. **Graceful shutdown** — `tokio::signal` handler
37. **Periodic session purge** — background task
38. **Device tracking** — populate `devices` table, add list/revoke API
39. **Scheduled automatic backups** — configurable interval
40. **Richer health check** — DB, disk space, library paths
41. **User data export/import** — JSON per profile
42. **DB size monitoring** — track + warn in admin
43. **Real-time notifications** — SSE for new books, scan events
44. **Reading statistics tracking** — pages, time, books, streaks

---

## Phase 6: Backend — Global Reader Preferences

45. **Wire up `/api/preferences`** — store reader mode, fit mode, direction (infrastructure exists but unused)
46. **Per-series direction override** — `series_overrides` in preferences JSON
47. **Continue reading endpoint** — ensure per-series latest progress for series page button

---

## Phase 7: Frontend — Performance

48. **Add TanStack Query** — caching, deduplication, background refresh
49. **Virtual scrolling** — `@tanstack/react-virtual` for large lists
50. **`React.memo`** on `SeriesCard`, chapter/book list items
51. **Remove duplicate font load** — drop Google Fonts CDN, keep `@fontsource`
52. **Responsive images** — generate 1×/2× thumbnails, use `srcset`
53. **Infinite scroll** on home page

---

## Phase 8: Frontend — Reader Preference Persistence

54. **Global reader prefs** — Zustand (localStorage) + server sync via `/api/preferences`
55. **Per-series direction override** — UI toggle in reader
56. **Settings page** — reader preferences section with inline live preview

---

## Phase 9: Frontend — Continue/Start Reading Button

57. **Continue/Start banner** at top of series page:
   - No progress → **"Read Chapter 001"** / **"Read Volume 1"**
   - Has progress → **"Continue Chapter XX"** with colored border filling to completion %
   - All completed → **"Read Again"**
58. **Floating action button (FAB)** — appears when banner scrXolls out of viewport
59. **Logic:** most recently read incomplete book via `progress` map

---

## Phase 10: Frontend — Toasts & Error Handling

60. **Add sonner** — bottom placement, swipe-to-dismiss, native mobile feel
61. **Toast on all mutations** — success + error feedback
62. **Replace `.catch(() => {})`** with error toasts
63. **Confirmation dialogs** for all destructive operations
64. **Per-route error boundaries** with retry
65. **Fix API return type** — `T | undefined` for 204/non-JSON
66. **Client-side error tracking** — console + admin logs

---

## Phase 11: Frontend — Enhanced Admin Panel

67. **Decompose `admin.tsx`** — split into `AdminLibraries`, `AdminProfiles`, `AdminSettings`, `AdminLogs`, `AdminBackups`, `AdminUpdates`
68. **Structured log viewer** — sortable table: Time, User, Level, Category, Message, IP, User Agent, Duration
69. **Log filters** — level, category, user dropdowns; date range; message search
70. **Decompose series page + reader** into smaller components

---

## Phase 12: Frontend — UX Enhancements

71. **Pull-to-refresh** on mobile (home, series page)
72. **Series card hover/long-press** — book count, progress %, rating overlay
73. **Bulk mark read/unread** — checkbox selection + batch actions
74. **Admin setup wizard** — first-run: create library, configure, scan
75. **User preference setup** — settings page with inline reader preview
76. **Keyboard shortcuts overlay** — press `?` to show
77. **Download sorting/filtering** — by date, name, size
78. **Robust download resume** — fix incomplete code path in `download-store.ts`
79. **Reader skeleton sizing** — dynamic aspect-ratio from page dimensions

---

## Phase 13: Frontend — Accessibility

80. **`aria-label`** on all icon-only buttons
81. **Skip navigation link** — hidden, visible on Tab
82. **Focus management** on route changes — announce to screen readers

---

## Phase 14: Frontend — New Features

83. **Reading statistics page** — books/pages read, time, streaks with charts
84. **AMOLED black + sepia themes**
85. **i18n setup** — extract strings, language switcher, English first
86. **Real-time notifications** — SSE listener for new books, scan events

---

## Phase 15: Infrastructure

87. **Optimize Docker** — multi-stage build, layer caching, health check
88. **Improve GitHub Actions** — test stage, build verification, release automation
89. **Review Caddyfile** — caching, compression, security headers
90. **Documentation** — Markdown for docs repo + OpenAPI spec

---

## Phase 16: Tests

91. **Backend tests** — ZIP parsing, chapter detection, auth, scanner, progress, reader
92. **Frontend tests** — API client, Zustand store, download store, reader logic

---

## Verification

- `cargo test` after backend changes
- `npm run test` after frontend changes
- Manual smoke: scan → browse → read → check progress → check admin logs
- Verify auth on all endpoints (unauthenticated → 401)
- Verify SSE scan progress in admin
- Mobile test: toasts, pull-to-refresh, continue button, FAB, offline downloads
- Keyboard navigation end-to-end
- `docker compose up` to verify containerized deployment

## Key Decisions

| Decision | Choice |
|----------|--------|
| Reader prefs storage | Server + localStorage fallback |
| Reader prefs scope | All global + per-series direction override |
| Continue button style | Top banner + FAB on scroll |
| Continue text (new) | "Read Chapter 001" |
| Continue text (progress) | "Continue Chapter XX" + progress border |
| Toasts | Native mobile feel (bottom, swipe-to-dismiss) |
| Border radius | Keep sharp (--radius: 0) |
| ComicInfo.xml | Fallback only, AniList priority |
| Password min length | Keep at 4 |
| Session timeout | Keep at 365 days |
| Guest mode | Remove (column deleted) |
| i18n | Yes, English first |
| OPDS | Skip for now |
| Webtoon mode | Skip (scroll mode covers it) |
| Breadcrumbs | Skip (back button sufficient) |
| Personal ratings | Skip |
| Recommendations | Skip |
| Directory browser | Keep unrestricted (admin-only) |
