import { useAppStore } from '@/store';
import type {
  LibrariesResponse,
  SeriesResponse,
  BooksResponse,
  BookDetail,
  ProfilesResponse,
  ProfileSelectResponse,
  ReadingProgress,
  BatchProgressResponse,
  AdminStatusResponse,
  ScanStatusResponse,
} from '@/models/types';

// ─── Helpers ───

function getBaseUrl(): string {
  const url = useAppStore.getState().serverUrl;
  if (!url) throw new Error('Server URL not set');
  return url.replace(/\/+$/, '');
}

function getHeaders(): Record<string, string> {
  const { deviceId, profileToken } = useAppStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (profileToken) headers['Authorization'] = `Bearer ${profileToken}`;
  return headers;
}

function getAdminHeaders(): Record<string, string> {
  const { deviceId, adminToken } = useAppStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (adminToken) headers['Authorization'] = `Admin ${adminToken}`;
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(admin ? getAdminHeaders() : getHeaders()),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  // Some endpoints return 204 (no content)
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Health ───

export async function healthCheck(): Promise<boolean> {
  try {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function healthCheckUrl(url: string): Promise<boolean> {
  try {
    const base = url.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Libraries ───

export async function fetchLibraries(): Promise<LibrariesResponse> {
  return request('/api/libraries');
}

// ─── Series ───

export async function fetchSeries(libraryId: string, page = 1, perPage = 50): Promise<SeriesResponse> {
  return request(`/api/libraries/${libraryId}/series?page=${page}&per_page=${perPage}`);
}

export async function fetchAllSeries(page = 1, perPage = 100): Promise<SeriesResponse> {
  return request(`/api/series?page=${page}&per_page=${perPage}`);
}

// ─── Books ───

export async function fetchBooks(seriesId: string): Promise<BooksResponse> {
  return request(`/api/series/${seriesId}/books`);
}

export async function fetchBookDetail(bookId: string): Promise<BookDetail> {
  return request(`/api/books/${bookId}`);
}

// ─── URLs (for images) ───

export function seriesThumbnailUrl(seriesId: string): string {
  return `${getBaseUrl()}/api/series/${seriesId}/thumbnail`;
}

export function bookThumbnailUrl(bookId: string): string {
  return `${getBaseUrl()}/api/books/${bookId}/thumbnail`;
}

export function pageImageUrl(bookId: string, page: number): string {
  return `${getBaseUrl()}/api/books/${bookId}/pages/${page}`;
}

export function imageHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const { deviceId, profileToken } = useAppStore.getState();
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (profileToken) headers['Authorization'] = `Bearer ${profileToken}`;
  return headers;
}

// ─── Progress ───

export async function fetchProgress(bookId: string): Promise<ReadingProgress | null> {
  try {
    return await request<ReadingProgress>(`/api/progress?book_id=${bookId}`);
  } catch {
    return null;
  }
}

export async function updateProgress(bookId: string, page: number, isCompleted: boolean): Promise<void> {
  await request('/api/progress', {
    method: 'PUT',
    body: JSON.stringify({
      book_id: bookId,
      page,
      is_completed: isCompleted,
    }),
  });
}

export async function fetchBatchProgress(bookIds: string[]): Promise<BatchProgressResponse> {
  return request(`/api/progress/batch?book_ids=${bookIds.join(',')}`);
}

// ─── Profiles ───

export async function fetchProfiles(): Promise<ProfilesResponse> {
  return request('/api/profiles');
}

export async function selectProfile(profileId: string, pin?: string): Promise<ProfileSelectResponse> {
  return request(`/api/profiles/${profileId}/select`, {
    method: 'POST',
    body: pin ? JSON.stringify({ pin }) : undefined,
  });
}

export async function logout(): Promise<void> {
  try {
    await request('/api/profiles/logout', { method: 'POST' });
  } catch {
    // Ignore logout errors
  }
}

// ─── Guest check ───

export async function fetchGuestEnabled(): Promise<boolean> {
  try {
    const res = await request<{ enabled: boolean }>('/api/guest-enabled');
    return res.enabled;
  } catch {
    return true; // Default to enabled if endpoint doesn't exist
  }
}

// ─── Admin ───

export async function adminStatus(): Promise<AdminStatusResponse> {
  return request('/api/admin/status');
}

export async function adminUnlock(password: string): Promise<{ token: string }> {
  return request('/api/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function triggerScan(): Promise<void> {
  await request('/api/admin/scan', { method: 'POST' }, true);
}

export async function scanStatus(): Promise<ScanStatusResponse> {
  return request('/api/admin/scan/status', {}, true);
}
