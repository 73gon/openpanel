// Backend API client for the OpenPanel server

import { useAppStore } from './store'
import type { AuthUser } from './types'

export type { AuthUser } from './types'

const BASE = '/api'

/** A failed API call: its HTTP status, and the server's own explanation as the message. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  /** Reads the server's `{"error": "..."}` body, falling back to the plain text, then the status. */
  static async from(res: Response): Promise<ApiError> {
    const html = res.headers.get('content-type')?.includes('text/html')
    const text = html ? '' : (await res.text().catch(() => '')).trim()
    let message = text
    try {
      const error = (JSON.parse(text) as { error?: unknown } | null)?.error
      if (typeof error === 'string' && error.trim()) message = error.trim()
    } catch {
      /* not JSON: the text is the message */
    }
    const statusText = res.statusText ? ` ${res.statusText}` : ''
    return new ApiError(
      res.status,
      message || `The server answered ${res.status}${statusText}.`,
    )
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAppStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    const error = await ApiError.from(res)
    // A 401 on a signed-in request means the session ended. One without a token is a wrong
    // sign-in, and one for a token since replaced is stale: neither signs anyone out.
    if (res.status === 401 && token && useAppStore.getState().token === token) {
      useAppStore.getState().clearAuth()
    }
    throw error
  }

  // Handle empty-body success responses (e.g. 201 from add-to-collection)
  const ct = res.headers.get('content-type')
  if (!ct || !ct.includes('application/json')) {
    return undefined as T
  }

  return res.json()
}

//  Auth

export interface AuthResponse {
  token: string
  profile: AuthUser
}

export interface AuthStatus {
  setup_complete: boolean
  user_count: number
}

export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' })
  } catch {
    /* ignore */
  }
  useAppStore.getState().clearAuth()
}

export async function fetchMe(): Promise<AuthUser> {
  return request('/auth/me')
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  return request('/auth/status')
}

/** A device signed in to an account. Times are SQLite's, UTC: read them with parseServerDate. */
export interface SessionInfo {
  id: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_seen_at: string | null
  /** The session making the request. */
  current: boolean
}

export async function fetchMySessions(): Promise<SessionInfo[]> {
  const data = await request<{ sessions: SessionInfo[] }>('/auth/sessions')
  return data.sessions
}

export async function revokeMySession(sessionId: string): Promise<void> {
  await request(`/auth/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function revokeMyOtherSessions(): Promise<{ revoked: number }> {
  return request('/auth/sessions/revoke-others', { method: 'POST' })
}

//  Libraries

export interface Library {
  id: string
  name: string
  path: string
  series_count: number
}

export interface Series {
  id: string
  name: string
  book_count: number
  book_type: string
  year?: number | null
  anilist_cover_url?: string | null
  anilist_score?: number | null
  anilist_id?: number | null
}

export interface Book {
  id: string
  title: string
  page_count: number
  sort_order: number
}

export interface BookDetail {
  id: string
  title: string
  series_id: string
  series_name: string
  page_count: number
  file_size: number
  metadata: {
    writer: string | null
    year: number | null
    summary: string | null
  }
}

export async function fetchLibraries(): Promise<Library[]> {
  const data = await request<{ libraries: Library[] }>('/libraries')
  return data.libraries
}

export async function fetchSeries(
  libraryId: string,
  page = 1,
  perPage = 50,
): Promise<{
  series: Series[]
  total: number
  page: number
  per_page: number
}> {
  return request(
    `/libraries/${libraryId}/series?page=${page}&per_page=${perPage}`,
  )
}

export interface AllSeriesParams {
  page?: number
  perPage?: number
  sort?: 'name' | 'year' | 'score' | 'recently_added'
  sortDir?: 'asc' | 'desc'
  genre?: string
  status?: string
  year?: number
}

export async function fetchAllSeries(
  params: AllSeriesParams = {},
): Promise<{ series: Series[]; total: number }> {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.perPage) q.set('per_page', String(params.perPage))
  if (params.sort) q.set('sort', params.sort)
  if (params.sortDir) q.set('sort_dir', params.sortDir)
  if (params.genre) q.set('genre', params.genre)
  if (params.status) q.set('status', params.status)
  if (params.year) q.set('year', String(params.year))
  return request(`/series?${q.toString()}`)
}

export async function fetchAvailableGenres(): Promise<string[]> {
  return request('/genres')
}

export async function fetchRecentlyAdded(limit = 10): Promise<Series[]> {
  return request(`/series/recently-added?limit=${limit}`)
}

export async function fetchRecentlyUpdated(limit = 10): Promise<Series[]> {
  return request(`/series/recently-updated?limit=${limit}`)
}

export async function rescanSeries(
  seriesId: string,
  anilistId?: number,
): Promise<{ status: string; books_scanned: number }> {
  return request(`/series/${seriesId}/rescan`, {
    method: 'POST',
    body: JSON.stringify(anilistId ? { anilist_id: anilistId } : {}),
  })
}

export async function fetchBooks(
  seriesId: string,
): Promise<{ series: { id: string; name: string }; books: Book[] }> {
  return request(`/series/${seriesId}/books`)
}

export async function fetchBookDetail(bookId: string): Promise<BookDetail> {
  return request(`/books/${bookId}`)
}

//  Book Chapters (detected from CBZ structure)

export interface BookChapter {
  chapter_number: number
  title: string
  start_page: number
  end_page: number
}

export interface BookChaptersResponse {
  book_id: string
  chapters: BookChapter[]
}

export async function fetchBookChapters(
  bookId: string,
): Promise<BookChaptersResponse> {
  return request(`/books/${bookId}/chapters`)
}

//  Series Chapters (aggregated from all books)

export interface SeriesChapter {
  book_id: string
  book_title: string
  chapter_number: number
  title: string
  start_page: number
  end_page: number
}

export interface SeriesChaptersResponse {
  series_id: string
  total_chapters: number
  chapters: SeriesChapter[]
}

export async function fetchSeriesChapters(
  seriesId: string,
): Promise<SeriesChaptersResponse> {
  return request(`/series/${seriesId}/chapters`)
}

//  Progress

export interface ReadingProgress {
  book_id: string
  page: number
  is_completed: boolean
  updated_at: string
}

export async function fetchProgress(
  bookId: string,
): Promise<ReadingProgress | null> {
  try {
    return await request(`/progress?book_id=${bookId}`)
  } catch {
    return null
  }
}

export async function updateProgress(
  bookId: string,
  page: number,
  isCompleted = false,
): Promise<void> {
  await request('/progress', {
    method: 'PUT',
    body: JSON.stringify({ book_id: bookId, page, is_completed: isCompleted }),
  })
}

export async function fetchBatchProgress(
  bookIds: string[],
): Promise<Record<string, ReadingProgress>> {
  if (bookIds.length === 0) return {}
  const data = await request<{ progress: Record<string, ReadingProgress> }>(
    `/progress/batch?book_ids=${bookIds.join(',')}`,
  )
  return data.progress
}

/** How far the reader is in each series they opened, by series id. */
export interface SeriesProgress {
  /** Books finished. */
  read: number
  /** Books started and not finished. */
  reading: number
}

export async function fetchSeriesProgress(): Promise<
  Record<string, SeriesProgress>
> {
  return request('/progress/series')
}

export async function bulkMarkProgress(
  bookIds: string[],
  isCompleted: boolean,
): Promise<void> {
  await request('/progress/bulk-mark', {
    method: 'POST',
    body: JSON.stringify({ book_ids: bookIds, is_completed: isCompleted }),
  })
}

//  Series Continue (for series page banner)

export interface SeriesContinueResponse {
  action: 'start' | 'continue' | 'reread'
  book_id: string
  book_title: string
  page: number
  total_pages: number
  progress_percent: number
}

export async function fetchSeriesContinue(
  seriesId: string,
): Promise<SeriesContinueResponse | null> {
  return request<SeriesContinueResponse | null>(
    `/series-continue?series_id=${encodeURIComponent(seriesId)}`,
  )
}

//  Continue Reading (server-side)

export interface ContinueReadingItem {
  book_id: string
  book_title: string
  series_id: string
  series_name: string
  page: number
  total_pages: number
  cover_url: string | null
  updated_at: string
}

export async function fetchContinueReading(): Promise<ContinueReadingItem[]> {
  return request('/continue-reading')
}

//  Bookmarks

export interface Bookmark {
  id: string
  book_id: string
  page: number
  note: string | null
  created_at: string
}

export async function fetchBookmarks(bookId: string): Promise<Bookmark[]> {
  return request(`/bookmarks?book_id=${bookId}`)
}

export async function createBookmark(
  bookId: string,
  page: number,
  note?: string,
): Promise<Bookmark> {
  return request('/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ book_id: bookId, page, note: note || null }),
  })
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await request(`/bookmarks/${bookmarkId}`, { method: 'DELETE' })
}

//  Collections

export interface Collection {
  id: string
  name: string
  sort_order: number
  item_count: number
  created_at: string
}

export interface CollectionWithItems {
  id: string
  name: string
  items: CollectionItem[]
}

export interface CollectionItem {
  series_id: string
  series_name: string
  cover_url: string | null
  book_count: number
}

export async function fetchCollections(): Promise<Collection[]> {
  return request('/collections')
}

export async function createCollection(name: string): Promise<Collection> {
  return request('/collections', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function deleteCollection(collectionId: string): Promise<void> {
  await request(`/collections/${collectionId}`, { method: 'DELETE' })
}

export async function fetchCollection(
  collectionId: string,
): Promise<CollectionWithItems> {
  return request(`/collections/${collectionId}`)
}

export async function addToCollection(
  collectionId: string,
  seriesId: string,
): Promise<void> {
  await request(`/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ series_id: seriesId }),
  })
}

export async function removeFromCollection(
  collectionId: string,
  seriesId: string,
): Promise<void> {
  await request(`/collections/${collectionId}/items/${seriesId}`, {
    method: 'DELETE',
  })
}

//  Preferences

export async function fetchPreferences(): Promise<Record<string, unknown>> {
  const data = await request<{ preferences: Record<string, unknown> }>(
    '/preferences',
  )
  return data.preferences
}

export async function updatePreferences(
  preferences: Record<string, unknown>,
): Promise<void> {
  await request('/preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  })
}

//  Reading Statistics

export interface DailyActivity {
  date: string
  books_completed: number
  pages_read: number
}

export interface GenreStat {
  genre: string
  count: number
}

export interface ReadingStats {
  volumes_completed: number
  chapters_completed: number
  volumes_in_progress: number
  chapters_in_progress: number
  total_pages_read: number
  total_series_touched: number
  completion_rate: number
  daily_activity: DailyActivity[]
  top_genres: GenreStat[]
  current_streak: number
  longest_streak: number
}

export async function fetchReadingStats(): Promise<ReadingStats> {
  return request('/progress/stats')
}

//  Admin

export interface AdminSettings {
  /** Kept by the server for older clients; nothing enforces it. */
  remote_enabled: boolean
  scan_on_startup: boolean
  update_channel: string
  /** Minutes between automatic scans; 0 is off. */
  auto_scan_interval_min: number
  /** Hours between automatic backups; 0 is off. */
  auto_backup_interval_hours: number
  /** How many backups the backup folder keeps. */
  backup_keep: number
}

export interface ScanFailure {
  /** Relative to its library. */
  path: string
  error: string
}

export interface ScanStatus {
  running: boolean
  scanned: number
  total: number
  errors: number
  message: string
  current_file: string
  phase: string
  series_found?: number
  books_found?: number
  /** "manual", "startup" or "schedule". */
  trigger?: string
  /** RFC 3339. */
  started_at?: string | null
  finished_at?: string | null
  added?: number
  updated?: number
  removed?: number
  failures?: ScanFailure[]
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return request('/admin/settings')
}

/** Changes the settings sent; the server leaves the rest as they are. */
export async function updateAdminSettings(
  settings: Partial<AdminSettings>,
): Promise<void> {
  await request('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function startScan(): Promise<{ status: string }> {
  return request('/admin/scan', { method: 'POST' })
}

export async function fetchScanStatus(): Promise<ScanStatus> {
  return request('/admin/scan/status')
}

export async function createLibrary(
  name: string,
  path: string,
): Promise<{ id: string; name: string }> {
  return request('/admin/libraries', {
    method: 'POST',
    body: JSON.stringify({ name, path }),
  })
}

export async function deleteLibrary(libraryId: string): Promise<void> {
  await request(`/admin/libraries/${libraryId}`, { method: 'DELETE' })
}

export async function updateLibrary(
  libraryId: string,
  data: { name?: string; path?: string },
): Promise<{ id: string; name: string; path: string }> {
  return request(`/admin/libraries/${libraryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export interface AdminProfile {
  id: string
  name: string
  is_admin: boolean
  created_at: string
  /** The later of their last request and their last page (SQLite time, UTC). */
  last_active_at?: string | null
  /** Devices signed in. */
  devices?: number
  books_completed?: number
}

export async function fetchAdminProfiles(): Promise<AdminProfile[]> {
  const data = await request<{ profiles: AdminProfile[] }>('/admin/profiles')
  return data.profiles
}

export async function createProfile(
  name: string,
  password: string,
): Promise<{ id: string; name: string }> {
  return request('/admin/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  })
}

export async function deleteProfile(profileId: string): Promise<void> {
  await request(`/admin/profiles/${profileId}`, { method: 'DELETE' })
}

export async function resetUserPassword(
  profileId: string,
  newPassword: string,
): Promise<void> {
  await request(`/admin/profiles/${profileId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ new_password: newPassword }),
  })
}

export async function fetchUserSessions(
  profileId: string,
): Promise<SessionInfo[]> {
  const data = await request<{ sessions: SessionInfo[] }>(
    `/admin/profiles/${profileId}/sessions`,
  )
  return data.sessions
}

/** Signs a user out everywhere (an administrator's own current session stays). */
export async function revokeUserSessions(
  profileId: string,
): Promise<{ revoked: number }> {
  return request(`/admin/profiles/${profileId}/sessions`, { method: 'DELETE' })
}

export async function revokeSession(sessionId: string): Promise<void> {
  await request(`/admin/sessions/${sessionId}`, { method: 'DELETE' })
}

export async function setUserRole(
  profileId: string,
  isAdmin: boolean,
): Promise<void> {
  await request(`/admin/profiles/${profileId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ is_admin: isAdmin }),
  })
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request('/admin/password', {
    method: 'PUT',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}

export async function triggerUpdate(): Promise<{
  status: string
  message: string
}> {
  return request('/admin/update', { method: 'POST' })
}

export interface UpdateCheckResult {
  update_available: boolean
  current_version: string
  current_commit: string
  current_target: string
  latest_version: string | null
  channel: string
  download_url?: string
  sha256?: string
  error?: string
  /** RFC 3339. */
  published_at?: string
  release_url?: string
  /** The first line of each commit the update brings, newest first (at most 20). */
  changes?: string[]
  total_changes?: number
  /** When the server last asked GitHub (RFC 3339). */
  checked_at?: string
}

/** The server answers from its last check (15 minutes) unless `force` asks GitHub now. */
export async function checkForUpdates(
  force = false,
): Promise<UpdateCheckResult> {
  return request(`/admin/check-update${force ? '?force=true' : ''}`)
}

export async function selfUpdate(): Promise<{
  status: string
  message: string
}> {
  return request('/admin/self-update', { method: 'POST' })
}

export interface VersionInfo {
  version: string
  commit: string
  channel: string
  startup_time: number
}

export async function fetchVersion(): Promise<VersionInfo> {
  return request('/version')
}

//  Admin Logs

export interface AdminLog {
  id: number
  level: string
  category: string
  message: string
  details: string | null
  created_at: string
  /** Who and where, when the entry came from a request. */
  profile_name?: string | null
  ip_address?: string | null
  user_agent?: string | null
  request_duration_ms?: number | null
}

export interface AdminLogQuery {
  /** One level or several, comma-separated: "warn,error". */
  level?: string
  category?: string
  /** Words in the message, details, user name or address. */
  q?: string
  /** Entries older than this id: the next page. */
  before?: number
  limit?: number
}

export async function fetchAdminLogs(
  query: AdminLogQuery = {},
): Promise<AdminLog[]> {
  const params = new URLSearchParams()
  if (query.level) params.set('level', query.level)
  if (query.category) params.set('category', query.category)
  if (query.q) params.set('q', query.q)
  if (query.before) params.set('before', String(query.before))
  params.set('limit', String(query.limit ?? 100))
  const data = await request<{ logs: AdminLog[] }>(`/admin/logs?${params}`)
  return data.logs
}

export async function addAdminLog(
  level: string,
  category: string,
  message: string,
  details?: string,
): Promise<void> {
  try {
    await request('/admin/log', {
      method: 'POST',
      body: JSON.stringify({
        level,
        category,
        message,
        details: details ?? null,
      }),
    })
  } catch {
    // Non-critical, silently fail
  }
}

//  Admin Backup

export interface BackupInfo {
  filename: string
  size: number
  created_at: string
}

export async function triggerBackup(): Promise<{
  filename: string
  size: number
}> {
  return request('/admin/backup', { method: 'POST' })
}

export async function fetchBackups(): Promise<BackupInfo[]> {
  const data = await request<{ backups: BackupInfo[] }>('/admin/backups')
  return data.backups
}

/**
 * A backup's file. Fetched with the session in a header, not a link: a link would put the
 * token in the address, and the address in the browser's download history.
 */
export async function downloadBackup(filename: string): Promise<Blob> {
  const token = useAppStore.getState().token
  const res = await fetch(
    `${BASE}/admin/backups/${encodeURIComponent(filename)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  )
  if (!res.ok) throw await ApiError.from(res)
  return res.blob()
}

export async function deleteBackup(filename: string): Promise<void> {
  await request(`/admin/backups/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  })
}

//  Admin overview

export interface LastRead {
  series_id: string
  series_name: string
  book_id: string
  book_title: string
  /** 1-based, like the reader. */
  page: number
  page_count: number
  is_completed: boolean
  /** SQLite time (UTC). */
  updated_at: string
}

export interface ReaderActivity {
  id: string
  name: string
  is_admin: boolean
  /** SQLite time (UTC). */
  last_active_at: string | null
  devices: number
  books_completed: number
  last_read: LastRead | null
}

export interface AdminOverview {
  version: string
  commit: string
  channel: string
  uptime_seconds: number
  /** The database file and its write-ahead log. */
  database_bytes: number
  library: {
    libraries: number
    series: number
    books: number
    pages: number
    bytes: number
    /** Series without AniList metadata. */
    unmatched: number
  }
  scan: ScanStatus
  scan_on_startup: boolean
  auto_scan_interval_min: number
  backups: {
    count: number
    /** RFC 3339. */
    latest_at: string | null
    auto_interval_hours: number
  }
  /** Logged in the last 24 hours. */
  problems: { errors: number; warnings: number; failed_sign_ins: number }
  readers: ReaderActivity[]
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return request('/admin/overview')
}

//  Admin metadata review

export interface SeriesMatch {
  id: string
  name: string
  library_name: string
  book_count: number
  anilist_id: number | null
  /** "auto", "manual" or "folder" (an id in the folder name). */
  anilist_id_source: string | null
  title_english: string | null
  title_romaji: string | null
  cover_url: string | null
  start_year: number | null
  /** How alike the folder name and the matched titles are, 0 to 1; null without a match. */
  match_score: number | null
}

export interface RematchStatus {
  running: boolean
  done: number
  total: number
  /** Series whose match changed. */
  changed: number
  finished_at: string | null
}

export interface MetadataReview {
  series: SeriesMatch[]
  rematch: RematchStatus
}

/** Below this likeness, an automatic match is worth a second look (as on the server). */
export const DOUBTFUL_MATCH = 0.8

/** A series without a match, or with an automatic one that may be another work. */
export function needsReview(series: SeriesMatch): boolean {
  if (series.match_score === null) return true
  const automatic =
    series.anilist_id_source === null || series.anilist_id_source === 'auto'
  return automatic && series.match_score < DOUBTFUL_MATCH
}

export async function fetchMetadataReview(): Promise<MetadataReview> {
  return request('/admin/metadata')
}

/** Matches series again on AniList, in the background. "review": the ones needing review. */
export async function startRematch(
  scope: 'review' | 'all',
): Promise<RematchStatus> {
  return request('/admin/metadata/rematch', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

//  Directory Browser

export interface DirectoryEntry {
  name: string
  path: string
  is_dir: boolean
}

export interface BrowseDirectoriesResponse {
  entries: DirectoryEntry[]
  current_path: string
}

export async function browseDirectories(
  path?: string,
): Promise<BrowseDirectoriesResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  return request(`/admin/libraries/browse${query}`)
}

export interface DrivesResponse {
  drives: string[]
}

export async function fetchDrives(): Promise<DrivesResponse> {
  return request('/admin/libraries/drives')
}

//  Pages

function authQuery(): string {
  const token = useAppStore.getState().token
  return token ? `?token=${encodeURIComponent(token)}` : ''
}

export function getPageUrl(bookId: string, page: number): string {
  return `${BASE}/books/${bookId}/pages/${page}${authQuery()}`
}

//  Thumbnails

export function getThumbnailUrl(bookId: string): string {
  return `${BASE}/books/${bookId}/thumbnail${authQuery()}`
}

export function getSeriesThumbnailUrl(seriesId: string): string {
  return `${BASE}/series/${seriesId}/thumbnail${authQuery()}`
}

//  Series Metadata (AniList)

export interface SeriesMetadata {
  anilist_id: number | null
  anilist_id_source: string | null
  title_english: string | null
  title_romaji: string | null
  description: string | null
  cover_url: string | null
  banner_url: string | null
  genres: string[] | null
  status: string | null
  chapters: number | null
  volumes: number | null
  score: number | null
  author: string | null
  start_year: number | null
  end_year: number | null
}

export async function fetchSeriesMetadata(
  seriesId: string,
): Promise<SeriesMetadata> {
  return request(`/series/${seriesId}/metadata`)
}

export async function setSeriesAnilistId(
  seriesId: string,
  anilistId: number,
): Promise<SeriesMetadata> {
  return request(`/series/${seriesId}/metadata`, {
    method: 'PUT',
    body: JSON.stringify({ anilist_id: anilistId }),
  })
}

export async function clearSeriesAnilistId(
  seriesId: string,
): Promise<SeriesMetadata> {
  return request(`/series/${seriesId}/metadata`, { method: 'DELETE' })
}

export async function refreshSeriesMetadata(
  seriesId: string,
): Promise<SeriesMetadata> {
  return request(`/series/${seriesId}/metadata/refresh`, { method: 'POST' })
}
