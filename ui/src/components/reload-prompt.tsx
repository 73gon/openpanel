import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'

/**
 * Ensures the PWA always gets fresh content after a deploy:
 *
 * 1. Checks for a new service worker every 60 s and on app resume.
 * 2. workbox skipWaiting + clientsClaim (in vite.config) force the
 *    new SW to take control immediately.
 * 3. When the browser's active SW controller changes, we reload the
 *    page so the new cached assets are actually served.
 */
export function ReloadPrompt() {
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      // Poll for SW updates every 60 seconds
      setInterval(() => registration.update(), 60_000)

      // Also check when the app becomes visible (PWA resume / tab focus)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update()
        }
      })
    },
  })

  // When a new SW activates and claims this client, reload so the
  // browser fetches the new precached assets.
  useEffect(() => {
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      onControllerChange,
    )
    return () =>
      navigator.serviceWorker?.removeEventListener(
        'controllerchange',
        onControllerChange,
      )
  }, [])

  return null
}
