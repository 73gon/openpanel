import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { useAppStore } from './store'
import type { ApiError } from './api'

// Mock fetch
globalThis.fetch = vi.fn()

// Import API functions after mock setup
const api = await import('./api')

// Tests swap clearAuth for a spy; each starts from the real one.
const { clearAuth } = useAppStore.getState()

function mockFetchResponse(
  body: unknown,
  status = 200,
  contentType = 'application/json',
) {
  ;(globalThis.fetch as Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function mockFetchError(
  status: number,
  text: string,
  contentType?: string,
  statusText = '',
) {
  ;(globalThis.fetch as Mock).mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
    headers: new Headers(contentType ? { 'content-type': contentType } : {}),
    text: () => Promise.resolve(text),
  })
}

/** The error a call rejects with. */
async function failure(call: Promise<unknown>): Promise<ApiError> {
  const err = await call.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(api.ApiError)
  return err as ApiError
}

describe('API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ token: 'test_token', user: null, clearAuth })
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
    mockFetchResponse({
      libraries: [{ id: '1', name: 'Manga', path: '/lib', series_count: 5 }],
    })
    const result = await api.fetchLibraries()
    expect((globalThis.fetch as Mock).mock.calls[0][0]).toBe('/api/libraries')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Manga')
  })

  it('login sends POST with credentials', async () => {
    useAppStore.setState({ token: null })
    mockFetchResponse({
      token: 'new_tok',
      profile: { id: '1', name: 'admin', is_admin: true },
    })
    const result = await api.login('admin', 'pass')
    const [url, opts] = (globalThis.fetch as Mock).mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      username: 'admin',
      password: 'pass',
    })
    expect(result.token).toBe('new_tok')
  })

  it('throws an ApiError with the server message from a JSON body', async () => {
    mockFetchError(
      400,
      JSON.stringify({ error: 'Username already exists' }),
      'application/json',
    )
    const err = await failure(api.createProfile('alice', 'pass'))
    expect(err.status).toBe(400)
    expect(err.message).toBe('Username already exists')
  })

  it('uses a plain-text body as the message', async () => {
    mockFetchError(404, '  Not Found\n', 'text/plain')
    const err = await failure(api.fetchLibraries())
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not Found')
  })

  it('uses the text when a JSON body has no error string', async () => {
    mockFetchError(422, '{"detail":"bad"}', 'application/json')
    const err = await failure(api.fetchLibraries())
    expect(err.message).toBe('{"detail":"bad"}')
  })

  it('falls back to the status when the body is empty or a page', async () => {
    mockFetchError(500, '')
    expect((await failure(api.fetchLibraries())).message).toBe(
      'The server answered 500.',
    )
    mockFetchError(502, '<html>Bad Gateway</html>', 'text/html', 'Bad Gateway')
    const err = await failure(api.fetchLibraries())
    expect(err.status).toBe(502)
    expect(err.message).toBe('The server answered 502 Bad Gateway.')
  })

  it('clears auth on a 401 for a request that sent a token', async () => {
    useAppStore
      .getState()
      .setAuth({ id: '1', name: 'x', is_admin: false }, 'tok')
    mockFetchError(401, JSON.stringify({ error: 'Unauthorized' }))
    const err = await failure(api.fetchLibraries())
    expect(err.status).toBe(401)
    expect(err.message).toBe('Unauthorized')
    expect(useAppStore.getState().token).toBeNull()
    expect(useAppStore.getState().user).toBeNull()
  })

  it('leaves auth alone on a 401 for a request without a token', async () => {
    const clearSpy = vi.fn()
    useAppStore.setState({ token: null, clearAuth: clearSpy })
    mockFetchError(401, JSON.stringify({ error: 'Unauthorized' }))
    const err = await failure(api.login('admin', 'wrong'))
    expect(err.status).toBe(401)
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('keeps a newer session when an older token gets a 401', async () => {
    useAppStore.setState({ token: 'old' })
    ;(globalThis.fetch as Mock).mockImplementationOnce(async () => {
      useAppStore.setState({ token: 'new' })
      return {
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () => Promise.resolve(''),
      }
    })
    await failure(api.fetchLibraries())
    expect(useAppStore.getState().token).toBe('new')
  })

  it('keeps the session when the current password is wrong', async () => {
    mockFetchError(
      400,
      JSON.stringify({ error: 'Current password is incorrect' }),
      'application/json',
    )
    const err = await failure(api.changePassword('typo', 'new-pass'))
    expect(err.status).toBe(400)
    expect(err.message).toBe('Current password is incorrect')
    expect(useAppStore.getState().token).toBe('test_token')
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
