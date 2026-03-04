import {
  Outlet,
  createRootRoute,
  useNavigate,
  useLocation,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayout } from '@/components/layout'
import { useAppStore } from '@/lib/store'

function RouteLoadingBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="h-full w-full animate-pulse bg-primary/60" />
    </div>
  )
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
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

  useEffect(() => {
    // Allow access to /profiles (login/register page) without auth
    if (!token && location.pathname !== '/profiles') {
      navigate({ to: '/profiles', replace: true })
    }
  }, [token, location.pathname, navigate])
}

function RootComponent() {
  useRequireAuth()

  return (
    <ThemeProvider>
      <TooltipProvider delay={300}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </TooltipProvider>
    </ThemeProvider>
  )
}
