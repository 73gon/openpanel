import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './store'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useAppStore.setState({
      token: null,
      user: null,
      theme: 'dark',
      locale: 'en',
      commandPaletteOpen: false,
      readerActive: false,
      chapterViewMode: 'list',
      volumeViewMode: 'list',
    })
  })

  // ── Auth ──

  it('starts with no auth', () => {
    const s = useAppStore.getState()
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
  })

  it('setAuth stores user and token', () => {
    useAppStore.getState().setAuth({ id: '1', name: 'alice', is_admin: true }, 'tok_123')
    const s = useAppStore.getState()
    expect(s.token).toBe('tok_123')
    expect(s.user?.name).toBe('alice')
    expect(s.user?.is_admin).toBe(true)
  })

  it('clearAuth removes credentials', () => {
    useAppStore.getState().setAuth({ id: '1', name: 'bob', is_admin: false }, 'tok')
    useAppStore.getState().clearAuth()
    const s = useAppStore.getState()
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
  })

  // ── Theme ──

  it('default theme is dark', () => {
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('toggleTheme switches between dark and light', () => {
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('light')
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('setTheme sets exact value', () => {
    useAppStore.getState().setTheme('light')
    expect(useAppStore.getState().theme).toBe('light')
  })

  // ── Locale ──

  it('default locale is en', () => {
    expect(useAppStore.getState().locale).toBe('en')
  })

  it('setLocale updates', () => {
    useAppStore.getState().setLocale('ja')
    expect(useAppStore.getState().locale).toBe('ja')
  })

  // ── Command palette ──

  it('command palette starts closed', () => {
    expect(useAppStore.getState().commandPaletteOpen).toBe(false)
  })

  it('setCommandPaletteOpen toggles', () => {
    useAppStore.getState().setCommandPaletteOpen(true)
    expect(useAppStore.getState().commandPaletteOpen).toBe(true)
  })

  // ── Reader active ──

  it('readerActive starts false', () => {
    expect(useAppStore.getState().readerActive).toBe(false)
  })

  it('setReaderActive updates', () => {
    useAppStore.getState().setReaderActive(true)
    expect(useAppStore.getState().readerActive).toBe(true)
  })

  // ── View modes ──

  it('default view modes are list', () => {
    const s = useAppStore.getState()
    expect(s.chapterViewMode).toBe('list')
    expect(s.volumeViewMode).toBe('list')
  })

  it('setChapterViewMode updates', () => {
    useAppStore.getState().setChapterViewMode('grid')
    expect(useAppStore.getState().chapterViewMode).toBe('grid')
  })

  it('setVolumeViewMode updates', () => {
    useAppStore.getState().setVolumeViewMode('grid')
    expect(useAppStore.getState().volumeViewMode).toBe('grid')
  })
})
