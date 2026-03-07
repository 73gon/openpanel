// Backend API client for the OpenPanel server

import { useAppStore } from './store'

const BASE = '/api'

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

  // Handle empty-body success responses (e.g. 201 from add-to-collection)
  const ct = res.headers.get('content-type')
  if (!ct || !ct.includes('application/json')) {
    return undefined as T
  }

  if (res.status === 401) {
    // Auto-clear auth on unauthorized
    useAppStore.getState().clearAuth()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }

  return res.json()
}

//  Auth

export interface AuthUser {
  id: string
  name: string
  is_admin: boolean
}

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

//  Admin

export interface AdminSettings {
  remote_enabled: boolean
  scan_on_startup: boolean
  update_channel: string
}

export interface ScanStatus {
  running: boolean
  scanned: number
  total: number
  errors: number
  message: string
  current_file: string
  phase: string
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return request('/admin/settings')
}

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
  latest_version: string | null
  channel: string
  error?: string
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  return request('/admin/check-update')
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
}

export async function fetchAdminLogs(
  level?: string,
  limit = 50,
): Promise<AdminLog[]> {
  const params = new URLSearchParams()
  if (level) params.set('level', level)
  params.set('limit', String(limit))
  const data = await request<{ logs: AdminLog[] }>(`/admin/logs?${params}`)
  return data.logs
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

//  Pages

export function getPageUrl(bookId: string, page: number): string {
  return `${BASE}/books/${bookId}/pages/${page}`
}

//  Thumbnails

export function getThumbnailUrl(bookId: string): string {
  return `${BASE}/books/${bookId}/thumbnail`
}

export function getSeriesThumbnailUrl(seriesId: string): string {
  return `${BASE}/series/${seriesId}/thumbnail`
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
