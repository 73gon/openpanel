// Backend API client for the Read server

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  })

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }

  return res.json()
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const profileToken = localStorage.getItem('profile_token')
  if (profileToken) headers['Authorization'] = `Bearer ${profileToken}`
  const deviceId = localStorage.getItem('device_id')
  if (deviceId) headers['X-Device-Id'] = deviceId
  const adminToken = sessionStorage.getItem('admin_token')
  if (adminToken) headers['Authorization'] = `Admin ${adminToken}`
  return headers
}

// Ensure device ID exists
export function ensureDeviceId(): string {
  let id = localStorage.getItem('device_id')
  if (!id) {
    // crypto.randomUUID() requires secure context (HTTPS); fall back for HTTP
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      id = crypto.randomUUID()
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
    }
    localStorage.setItem('device_id', id)
  }
  return id
}

// ── Libraries ──

export interface Library {
  id: string
  name: string
  series_count: number
}

export interface Series {
  id: string
  name: string
  book_count: number
  book_type: string
  year?: number | null
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

export async function fetchAllSeries(
  page = 1,
  perPage = 200,
): Promise<{ series: Series[]; total: number }> {
  return request(`/series?page=${page}&per_page=${perPage}`)
}

export async function rescanSeries(
  seriesId: string,
): Promise<{ status: string; books_scanned: number }> {
  return request(`/series/${seriesId}/rescan`, { method: 'POST' })
}

export async function fetchBooks(
  seriesId: string,
): Promise<{ series: { id: string; name: string }; books: Book[] }> {
  return request(`/series/${seriesId}/books`)
}

export async function fetchBookDetail(bookId: string): Promise<BookDetail> {
  return request(`/books/${bookId}`)
}

// ── Progress ──

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

// ── Preferences ──

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

// ── Profiles ──

export interface Profile {
  id: string
  name: string
  has_pin: boolean
  avatar_url: string | null
}

export async function fetchProfiles(): Promise<Profile[]> {
  const data = await request<{ profiles: Profile[] }>('/profiles')
  return data.profiles
}

export async function selectProfile(
  profileId: string,
  pin?: string,
): Promise<{ token: string; profile: Profile; expires_at: string }> {
  return request(`/profiles/${profileId}/select`, {
    method: 'POST',
    body: JSON.stringify({ pin: pin || null }),
  })
}

export async function logout(): Promise<void> {
  await request('/profiles/logout', { method: 'POST' })
  localStorage.removeItem('profile_token')
  localStorage.removeItem('profile')
}

// ── Admin ──

export interface AdminStatus {
  password_set: boolean
  remote_enabled: boolean
}

export interface AdminSettings {
  remote_enabled: boolean
  scan_on_startup: boolean
  admin_session_timeout_min: number
}

export interface ScanStatus {
  running: boolean
  scanned: number
  total: number
  errors: number
  message: string
}

export async function fetchAdminStatus(): Promise<AdminStatus> {
  return request('/admin/status')
}

export async function adminSetup(password: string): Promise<void> {
  await request('/admin/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function adminUnlock(
  password: string,
): Promise<{ admin_token: string; expires_at: string }> {
  return request('/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: {}, // Don't send admin token for unlock
  })
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

export async function createProfile(
  name: string,
  pin?: string,
): Promise<{ id: string; name: string }> {
  return request('/admin/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, pin: pin || null }),
  })
}

export async function deleteProfile(profileId: string): Promise<void> {
  await request(`/admin/profiles/${profileId}`, { method: 'DELETE' })
}

export async function changeAdminPassword(
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

export interface VersionInfo {
  version: string
  commit: string
}

export async function fetchVersion(): Promise<VersionInfo> {
  return request('/version')
}

// ── Directory Browser ──

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

// ── Pages ──

export function getPageUrl(bookId: string, page: number): string {
  return `${BASE}/books/${bookId}/pages/${page}`
}

// ── Thumbnails ──

export function getThumbnailUrl(bookId: string): string {
  return `${BASE}/books/${bookId}/thumbnail`
}

export function getSeriesThumbnailUrl(seriesId: string): string {
  return `${BASE}/series/${seriesId}/thumbnail`
}
