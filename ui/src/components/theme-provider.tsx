import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const [resolved, setResolved] = useState<'light' | 'dark'>(
    theme === 'system' ? getSystemTheme() : theme,
  )

  // Listen for OS theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') {
      setResolved(theme)
      return
    }
    setResolved(getSystemTheme())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) =>
      setResolved(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [resolved])

  return <>{children}</>
}
