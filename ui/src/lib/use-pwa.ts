import { useState, useEffect } from 'react'

/**
 * Detects whether the app is running as an installed PWA (standalone mode)
 * vs in a regular browser tab.
 */
export function usePWA() {
  const [isPWA, setIsPWA] = useState(() => checkStandalone())

  useEffect(() => {
    // Listen for display-mode changes (e.g. user installs while browsing)
    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setIsPWA(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return { isPWA }
}

function checkStandalone(): boolean {
  // iOS Safari
  if ('standalone' in navigator && (navigator as any).standalone === true) {
    return true
  }
  // Standard PWA detection
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true
  }
  return false
}
