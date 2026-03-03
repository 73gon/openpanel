// ─── API response wrappers ───

export interface Library {
  id: string;
  name: string;
  series_count: number;
}

export interface Series {
  id: string;
  name: string;
  book_count: number;
  book_type: string;
  year?: number;
}

export interface Book {
  id: string;
  title: string;
  page_count: number;
  sort_order: number;
}

export interface BookDetail {
  id: string;
  title: string;
  series_id: string;
  series_name: string;
  page_count: number;
  file_size: number;
  metadata: {
    writer?: string;
    year?: number;
    summary?: string;
  };
}

export interface Profile {
  id: string;
  name: string;
  has_pin: boolean;
}

export interface ReadingProgress {
  book_id: string;
  page: number;
  is_completed: boolean;
  updated_at: string;
}

export interface PageInfo {
  index: number;
  filename: string;
  size: number;
}

export interface PageManifest {
  book_id: string;
  page_count: number;
  pages: PageInfo[];
}

export interface AdminStatusResponse {
  is_set_up: boolean;
  is_unlocked: boolean;
}

export interface ScanStatusResponse {
  scanning: boolean;
  progress?: number;
}

// ─── Response wrappers ───

export interface LibrariesResponse {
  libraries: Library[];
}

export interface SeriesResponse {
  series: Series[];
  total: number;
  page: number;
  per_page: number;
}

export interface BooksResponse {
  series: { id: string; name: string };
  books: Book[];
}

export interface ProfilesResponse {
  profiles: Profile[];
}

export interface ProfileSelectResponse {
  token: string;
  profile: Profile;
}

export interface BatchProgressResponse {
  progress: Record<string, ReadingProgress>;
}

// ─── Navigation param types ───

export type RootStackParamList = {
  ServerConnect: undefined;
  ProfilePicker: undefined;
  Main: undefined;
  SeriesDetail: { seriesId: string; seriesName: string };
  Reader: { bookId: string; bookTitle: string; seriesId: string };
};

export type MainTabParamList = {
  Library: undefined;
  Settings: undefined;
};
