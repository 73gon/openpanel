import { Outlet, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayout } from '@/components/layout'
import { ensureDeviceId, fetchProfiles, selectProfile } from '@/lib/api'
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

/** Auto-select a profile if none is persisted yet. */
function useAutoProfile() {
  const profile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)

  useEffect(() => {
    if (profile) return // already selected
    let cancelled = false

    fetchProfiles()
      .then(async (profiles) => {
        if (cancelled || profiles.length === 0) return
        // Pick the first profile without a PIN
        const noPinProfile = profiles.find((p) => !p.has_pin)
        if (!noPinProfile) return // all profiles have PINs, user must choose
        try {
          const result = await selectProfile(noPinProfile.id)
          if (!cancelled) {
            setProfile(result.profile, result.token)
          }
        } catch {
          /* guest mode — no profile selected */
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [profile, setProfile])
}

function RootComponent() {
  useAutoProfile()

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
