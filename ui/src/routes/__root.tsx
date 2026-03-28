import {
  Outlet,
  createRootRoute,
  useNavigate,
  useLocation,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayout } from '@/components/layout'
import { useAppStore } from '@/lib/store'
import { useReaderPrefs } from '@/lib/reader-store'

function RouteLoadingBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="h-full w-full animate-pulse bg-primary/60" />
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

  useEffect(() => {
    if (isNetworkError(error) && token) {
      navigate({ to: '/downloads', replace: true })
    }
  }, [error, token, navigate])

  if (isNetworkError(error) && token) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <h2 className="mb-2 text-xl font-semibold">You're offline</h2>
        <p className="mb-4 max-w-md text-sm text-muted-foreground">
          Redirecting to your downloads…
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
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
  const theme = useAppStore((s) => s.theme)

  return (
    <ThemeProvider>
      <TooltipProvider delay={300}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </TooltipProvider>
      <Toaster
        position="bottom-center"
        theme={theme}
        toastOptions={{
          className: 'text-sm',
          duration: 4000,
        }}
        swipeDirections={['bottom']}
        richColors
        closeButton
      />
    </ThemeProvider>
  )
}
