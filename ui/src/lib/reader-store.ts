import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchPreferences, updatePreferences } from './api'

export type ReadMode = 'scroll' | 'single' | 'double'
export type FitMode = 'width' | 'height' | 'original'
export type ReadDirection = 'ltr' | 'rtl'

/** How a novel's text is set: the reader's own choices over the book's styles. */
export interface TextPrefs {
  /** Pages turned sideways, or one long scroll per chapter. */
  layout: 'paged' | 'scroll'
  /** The book's own font, or the reader's. */
  font: 'book' | 'serif' | 'sans'
  /** Text size, as a percentage of 18px. */
  size: number
  lineHeight: 'tight' | 'normal' | 'loose'
  margins: 'narrow' | 'normal' | 'wide'
  /** The app's colours, or warm paper. */
  theme: 'app' | 'paper'
}

export const defaultTextPrefs: TextPrefs = {
  layout: 'paged',
  font: 'serif',
  size: 100,
  lineHeight: 'normal',
  margins: 'normal',
  theme: 'app',
}

interface SeriesOverride {
  direction?: ReadDirection
}

interface ReaderPrefsState {
  // Global defaults
  readMode: ReadMode
  fitMode: FitMode
  direction: ReadDirection
  /** Keep the screen from dimming while a book is open (where the browser allows it). */
  keepScreenOn: boolean
  /** How novels (EPUB books) are set. */
  text: TextPrefs

  // Per-series overrides (keyed by series ID)
  seriesOverrides: Record<string, SeriesOverride>

  // Actions
  setReadMode: (mode: ReadMode) => void
  setFitMode: (mode: FitMode) => void
  setDirection: (dir: ReadDirection) => void
  setKeepScreenOn: (on: boolean) => void
  setText: (text: Partial<TextPrefs>) => void
  setSeriesDirection: (seriesId: string, dir: ReadDirection | null) => void
  getEffectiveDirection: (seriesId: string) => ReadDirection

  // Server sync
  syncToServer: () => void
  loadFromServer: () => Promise<void>
}

export const useReaderPrefs = create<ReaderPrefsState>()(
  persist(
    (set, get) => ({
      readMode: 'scroll',
      fitMode: 'width',
      direction: 'ltr',
      keepScreenOn: true,
      text: defaultTextPrefs,
      seriesOverrides: {},

      setReadMode: (mode) => {
        set({ readMode: mode })
        get().syncToServer()
      },

      setFitMode: (mode) => {
        set({ fitMode: mode })
        get().syncToServer()
      },

      setDirection: (dir) => {
        set({ direction: dir })
        get().syncToServer()
      },

      setKeepScreenOn: (on) => {
        set({ keepScreenOn: on })
        get().syncToServer()
      },

      setText: (text) => {
        set((s) => ({ text: { ...s.text, ...text } }))
        get().syncToServer()
      },

      setSeriesDirection: (seriesId, dir) => {
        set((s) => {
          const overrides = { ...s.seriesOverrides }
          if (dir === null) {
            delete overrides[seriesId]
          } else {
            overrides[seriesId] = { ...overrides[seriesId], direction: dir }
          }
          return { seriesOverrides: overrides }
        })
        get().syncToServer()
      },

      getEffectiveDirection: (seriesId) => {
        const state = get()
        return state.seriesOverrides[seriesId]?.direction ?? state.direction
      },

      syncToServer: () => {
        const {
          readMode,
          fitMode,
          direction,
          keepScreenOn,
          text,
          seriesOverrides,
        } = get()
        updatePreferences({
          readerPrefs: {
            readMode,
            fitMode,
            direction,
            keepScreenOn,
            text,
            seriesOverrides,
          },
        }).catch(() => {})
      },

      loadFromServer: async () => {
        try {
          const prefs = await fetchPreferences()
          const reader = prefs.readerPrefs as
            | {
                readMode?: ReadMode
                fitMode?: FitMode
                direction?: ReadDirection
                keepScreenOn?: boolean
                text?: Partial<TextPrefs>
                seriesOverrides?: Record<string, SeriesOverride>
              }
            | undefined
          if (reader) {
            set({
              ...(reader.readMode ? { readMode: reader.readMode } : {}),
              ...(reader.fitMode ? { fitMode: reader.fitMode } : {}),
              ...(reader.direction ? { direction: reader.direction } : {}),
              ...(typeof reader.keepScreenOn === 'boolean'
                ? { keepScreenOn: reader.keepScreenOn }
                : {}),
              ...(reader.text
                ? { text: { ...defaultTextPrefs, ...reader.text } }
                : {}),
              ...(reader.seriesOverrides
                ? { seriesOverrides: reader.seriesOverrides }
                : {}),
            })
          }
        } catch {
          // Server unreachable — keep localStorage values
        }
      },
    }),
    {
      name: 'openpanel-reader-prefs',
      partialize: (state) => ({
        readMode: state.readMode,
        fitMode: state.fitMode,
        direction: state.direction,
        keepScreenOn: state.keepScreenOn,
        text: state.text,
        seriesOverrides: state.seriesOverrides,
      }),
      // A store saved before novels lacks their settings, or some of them
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ReaderPrefsState>
        return {
          ...current,
          ...saved,
          text: { ...defaultTextPrefs, ...saved.text },
        }
      },
    },
  ),
)
