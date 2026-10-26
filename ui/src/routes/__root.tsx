import {
  Outlet,
  createRootRoute,
  useNavigate,
  useLocation,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { Spinner, Toaster, TooltipProvider } from '@zonsh/ui'
import { AppLayout } from '@/components/layout'
import { ErrorNotice } from '@/components/route-error'
import { useAppStore } from '@/lib/store'
import { useReaderPrefs } from '@/lib/reader-store'
import { ReloadPrompt } from '@/components/reload-prompt'

function RouteLoadingBar() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
      <Spinner size="lg" label="Loading OpenPanel" />
    </div>
  )
}

/** Detect if an error is a network/fetch failure (server unreachable). */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch')
    return true
  if (
    error instanceof Error &&
    (error.message.includes('NetworkError') ||
      error.message.includes('net::ERR_') ||
      error.message.includes('fetch'))
  )
    return true
  return !navigator.onLine
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const token = useAppStore((s) => s.token)
  const navigate = useNavigate()
  const offline = isNetworkError(error) && !!token

  useEffect(() => {
    if (offline) navigate({ to: '/downloads', replace: true })
  }, [offline, navigate])

  return (
    <div className="container-page flex min-h-dvh items-center justify-center py-16">
      {offline ? (
        <p className="flex items-center gap-3 font-mono text-sm text-muted-foreground">
          <Spinner label="Opening your downloads" />
          You're offline. Opening your downloads…
        </p>
      ) : (
        <ErrorNotice
          title="OpenPanel didn't load"
          error={error}
          onRetry={reset}
          className="w-full max-w-xl"
        />
      )}
    </div>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  pendingComponent: RouteLoadingBar,
  errorComponent: RootErrorComponent,
})

/** Redirect unauthenticated users to the login page. */
function useRequireAuth() {
  const token = useAppStore((s) => s.token)
  const navigate = useNavigate()
  const location = useLocation()
  const loadReaderPrefs = useReaderPrefs((s) => s.loadFromServer)

  useEffect(() => {
    // Allow access to /profiles (login/register page) without auth
    if (!token && location.pathname !== '/profiles') {
      navigate({ to: '/profiles', replace: true })
    }
  }, [token, location.pathname, navigate])

  // Sync reader prefs from server on login (Task 54)
  useEffect(() => {
    if (token) {
      loadReaderPrefs()
    }
  }, [token, loadReaderPrefs])
}

function RootComponent() {
  useRequireAuth()

  return (
    <TooltipProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <Toaster />
      <ReloadPrompt />
    </TooltipProvider>
  )
}
