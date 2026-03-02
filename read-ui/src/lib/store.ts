import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile } from './api'

export interface RecentRead {
  bookId: string
  bookTitle: string
  seriesId: string
  seriesName: string
  page: number
  totalPages: number
  timestamp: number
  coverUrl: string | null
}

interface AppState {
  // Profile
  profile: Profile | null
  profileToken: string | null
  hasChosenProfile: boolean
  setProfile: (profile: Profile | null, token: string | null) => void

  // Theme
  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void

  // Recent reads (last 3)
  recentReads: RecentRead[]
  addRecentRead: (read: RecentRead) => void

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  // Reader active (hides mobile nav)
  readerActive: boolean
  setReaderActive: (active: boolean) => void

  // View mode preferences
  chapterViewMode: 'list' | 'grid'
  volumeViewMode: 'list' | 'grid'
  setChapterViewMode: (mode: 'list' | 'grid') => void
  setVolumeViewMode: (mode: 'list' | 'grid') => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Profile
      profile: null,
      profileToken: null,
      hasChosenProfile: false,
      setProfile: (profile, token) => {
        if (token) localStorage.setItem('profile_token', token)
        else localStorage.removeItem('profile_token')
        set({ profile, profileToken: token, hasChosenProfile: true })
      },

      // Theme
      theme: 'dark',
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
      },
      setTheme: (theme) => set({ theme }),

      // Recent reads
      recentReads: [],
      addRecentRead: (read) => {
        const current = get().recentReads.filter(
          (r) => r.bookId !== read.bookId,
        )
        const updated = [read, ...current].slice(0, 10)
        set({ recentReads: updated })
      },

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
      name: 'read-app-store',
      partialize: (state) => ({
        profile: state.profile,
        profileToken: state.profileToken,
        hasChosenProfile: state.hasChosenProfile,
        theme: state.theme,
        recentReads: state.recentReads,
        chapterViewMode: state.chapterViewMode,
        volumeViewMode: state.volumeViewMode,
      }),
    },
  ),
)
