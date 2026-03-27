import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { useAppStore } from './store'

// Mock fetch
globalThis.fetch = vi.fn()

// Import API functions after mock setup
const api = await import('./api')

function mockFetchResponse(body: unknown, status = 200, contentType = 'application/json') {
  ;(globalThis.fetch as Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ token: 'test_token', user: null })
  })

  it('sends Authorization header when token exists', async () => {
    mockFetchResponse({ libraries: [] })
    await api.fetchLibraries()
    const [, opts] = (globalThis.fetch as Mock).mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer test_token')
  })

  it('does not send Authorization when no token', async () => {
    useAppStore.setState({ token: null })
    mockFetchResponse({ setup_complete: true, user_count: 1 })
    await api.fetchAuthStatus()
    const [, opts] = (globalThis.fetch as Mock).mock.calls[0]
    expect(opts.headers['Authorization']).toBeUndefined()
  })

  it('fetchLibraries calls correct endpoint', async () => {
    mockFetchResponse({ libraries: [{ id: '1', name: 'Manga', path: '/lib', series_count: 5 }] })
    const result = await api.fetchLibraries()
    expect((globalThis.fetch as Mock).mock.calls[0][0]).toBe('/api/libraries')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Manga')
  })

  it('login sends POST with credentials', async () => {
    useAppStore.setState({ token: null })
    mockFetchResponse({ token: 'new_tok', profile: { id: '1', name: 'admin', is_admin: true } })
    const result = await api.login('admin', 'pass')
    const [url, opts] = (globalThis.fetch as Mock).mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ username: 'admin', password: 'pass' })
    expect(result.token).toBe('new_tok')
  })

  it('throws on non-ok response', async () => {
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: () => Promise.resolve('Not Found'),
    })
    await expect(api.fetchLibraries()).rejects.toThrow('API 404')
  })

  it('clears auth on 401', async () => {
    useAppStore.getState().setAuth({ id: '1', name: 'x', is_admin: false }, 'tok')
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve('Unauthorized'),
    })
    await expect(api.fetchLibraries()).rejects.toThrow('Unauthorized')
    expect(useAppStore.getState().token).toBeNull()
    expect(useAppStore.getState().user).toBeNull()
  })

  it('handles 204 No Content', async () => {
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
    })
    const result = await api.logout()
    expect(result).toBeUndefined()
  })
})
