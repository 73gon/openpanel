import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from './types';

export type { AuthUser } from './types';

interface AppState {
  // Auth
  token: string | null;
  user: AuthUser | null;
  setAuth: (user: AuthUser | null, token: string | null) => void;
  clearAuth: () => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;

  // Locale
  locale: string;
  setLocale: (locale: string) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Reader active (hides mobile nav)
  readerActive: boolean;
  setReaderActive: (active: boolean) => void;

  // View mode preferences
  chapterViewMode: 'list' | 'grid';
  volumeViewMode: 'list' | 'grid';
  setChapterViewMode: (mode: 'list' | 'grid') => void;
  setVolumeViewMode: (mode: 'list' | 'grid') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      token: null,
      user: null,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),

      // Theme
      theme: 'dark',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),

      // Locale
      locale: 'en',
      setLocale: (locale) => set({ locale }),

      // Command palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Reader active
      readerActive: false,
      setReaderActive: (active) => set({ readerActive: active }),

      // View mode preferences
      chapterViewMode: 'list',
      volumeViewMode: 'list',
      setChapterViewMode: (mode) => set({ chapterViewMode: mode }),
      setVolumeViewMode: (mode) => set({ volumeViewMode: mode }),
    }),
    {
      name: 'openpanel-store',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        theme: state.theme,
        locale: state.locale,
        chapterViewMode: state.chapterViewMode,
        volumeViewMode: state.volumeViewMode,
      }),
    },
  ),
);
