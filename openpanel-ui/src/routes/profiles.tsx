import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Moon02Icon,
  Sun01Icon,
  GridViewIcon,
  Menu02Icon,
  Logout01Icon,
  ShieldKeyIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  fetchAuthStatus,
  login,
  register,
  logout as apiLogout,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'

export const Route = createFileRoute('/profiles')({
  component: AuthPage,
})

function AuthPage() {
  const navigate = useNavigate()
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const token = useAppStore((s) => s.token)
  const user = useAppStore((s) => s.user)
  const setAuth = useAppStore((s) => s.setAuth)
  const clearAuth = useAppStore((s) => s.clearAuth)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)

  useEffect(() => {
    fetchAuthStatus()
      .then((s) => setIsSetupComplete(s.setup_complete))
      .catch(() => setIsSetupComplete(false))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async () => {
    if (!username.trim() || !password) return
    setError('')
    setSubmitting(true)
    try {
      const result = isSetupComplete
        ? await login(username, password)
        : await register(username, password)
      setAuth(result.profile, result.token)
      navigate({ to: '/' })
    } catch (err) {
      setError(
        isSetupComplete
          ? 'Invalid username or password'
          : 'Failed to create account',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
    } catch {
      /* ignore */
    }
    clearAuth()
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  // If logged in, show settings page
  if (token && user) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{user.name}</h1>
              <p className="text-sm text-muted-foreground">
                {user.is_admin ? 'Administrator' : 'User'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <HugeiconsIcon icon={Logout01Icon} size={14} />
              Sign out
            </Button>
          </div>

          <Separator className="my-4" />

          {/* Admin link – mobile only (desktop has sidebar) */}
          {user.is_admin && (
            <Link
              to="/admin"
              search={{ tab: 'libraries' }}
              className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent md:hidden"
            >
              <HugeiconsIcon
                icon={ShieldKeyIcon}
                size={20}
                className="text-muted-foreground"
              />
              <div className="text-left">
                <p className="text-sm font-medium">Admin Settings</p>
                <p className="text-xs text-muted-foreground">
                  Manage libraries and users
                </p>
              </div>
            </Link>
          )}

          <h2 className="mb-3 text-lg font-semibold">Settings</h2>
          <div className="space-y-2">
            {/* Theme toggle \u2013 mobile only (desktop has sidebar toggle) */}
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent md:hidden"
            >
              <HugeiconsIcon
                icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
                size={20}
                className="text-muted-foreground"
              />
              <div className="text-left">
                <p className="text-sm font-medium">
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                </p>
              </div>
            </button>

            {/* Chapter View Mode */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Chapter View</p>
                  <p className="text-xs text-muted-foreground">
                    How chapters are displayed
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    onClick={() => setChapterViewMode('list')}
                    className={`rounded px-2 py-1 transition-colors ${
                      chapterViewMode === 'list'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={Menu02Icon} size={14} />
                  </button>
                  <button
                    onClick={() => setChapterViewMode('grid')}
                    className={`rounded px-2 py-1 transition-colors ${
                      chapterViewMode === 'grid'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={GridViewIcon} size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Volume View Mode */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Volume View</p>
                  <p className="text-xs text-muted-foreground">
                    How volumes are displayed
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    onClick={() => setVolumeViewMode('list')}
                    className={`rounded px-2 py-1 transition-colors ${
                      volumeViewMode === 'list'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={Menu02Icon} size={14} />
                  </button>
                  <button
                    onClick={() => setVolumeViewMode('grid')}
                    className={`rounded px-2 py-1 transition-colors ${
                      volumeViewMode === 'grid'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <HugeiconsIcon icon={GridViewIcon} size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // Login / Register form
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle>
              {isSetupComplete ? 'Sign In' : 'Create Admin Account'}
            </CardTitle>
            {!isSetupComplete && (
              <p className="text-sm text-muted-foreground">
                Set up your first account to get started
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setError('')
                  }}
                  placeholder="Username"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={submitting}
              >
                {submitting && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    className="animate-spin"
                  />
                )}
                {submitting
                  ? 'Please wait...'
                  : isSetupComplete
                    ? 'Sign In'
                    : 'Create Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
