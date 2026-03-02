import { Outlet, createRootRoute, useNavigate, useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayout } from '@/components/layout'
import { ensureDeviceId } from '@/lib/api'
import { useAppStore } from '@/lib/store'

// Ensure device ID on app load
if (typeof window !== 'undefined') {
  ensureDeviceId()
}

function RouteLoadingBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="h-full w-full animate-pulse bg-primary/60" />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  pendingComponent: RouteLoadingBar,
})

/** Force users to the profile selection page if they haven't chosen yet. */
function useForceProfileSelection() {
  const hasChosenProfile = useAppStore((s) => s.hasChosenProfile)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!hasChosenProfile && location.pathname !== '/profiles') {
      navigate({ to: '/profiles', replace: true })
    }
  }, [hasChosenProfile, location.pathname, navigate])
}

function RootComponent() {
  useForceProfileSelection()

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </TooltipProvider>
    </ThemeProvider>
  )
}
