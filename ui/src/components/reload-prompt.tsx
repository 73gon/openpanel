import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

/**
 * Registers the service worker, checks for updates every 60 s and
 * on visibility-change (app resume). When a new build is available
 * it shows a persistent sonner toast with a "Refresh" button.
 */
export function ReloadPrompt() {
  const toastShown = useRef(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      // Poll for SW updates every 60 seconds
      setInterval(() => {
        registration.update()
      }, 60_000)

      // Also check when the app becomes visible (PWA resume / tab focus)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update()
        }
      })
    },
  })

  useEffect(() => {
    if (needRefresh && !toastShown.current) {
      toastShown.current = true
      toast('New version available', {
        description: 'Tap refresh to update.',
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => updateServiceWorker(),
        },
      })
    }
  }, [needRefresh, updateServiceWorker])

  return null
}
