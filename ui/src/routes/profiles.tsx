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
  LockPasswordIcon,
  Tick01Icon,
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
  changePassword,
  fetchPreferences,
  updatePreferences,
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

  // Password change state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwSubmitting, setPwSubmitting] = useState(false)

  // Section visibility (moved from home page)
  interface SectionVisibility {
    continueReading: boolean
    recentlyAdded: boolean
    recentlyUpdated: boolean
  }
  const defaultSections: SectionVisibility = {
    continueReading: true,
    recentlyAdded: true,
    recentlyUpdated: true,
  }
  const [sections, setSections] = useState<SectionVisibility>(defaultSections)

  // Load section prefs
  useEffect(() => {
    if (token && user) {
      fetchPreferences()
        .then((prefs) => {
          if (prefs.homeSections && typeof prefs.homeSections === 'object') {
            setSections({
              ...defaultSections,
              ...(prefs.homeSections as Partial<SectionVisibility>),
            })
          }
        })
        .catch(() => {})
    }
  }, [token, user])

  const toggleSection = (key: keyof SectionVisibility) => {
    const updated = { ...sections, [key]: !sections[key] }
    setSections(updated)
    updatePreferences({ homeSections: updated }).catch(() => {})
  }

  const handleChangePassword = async () => {
    setPwError('')
    setPwSuccess(false)
    if (newPw.length < 4) {
      setPwError('Password must be at least 4 characters')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match')
      return
    }
    setPwSubmitting(true)
    try {
      await changePassword(currentPw, newPw)
      setPwSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch {
      setPwError('Failed to change password. Check your current password.')
    } finally {
      setPwSubmitting(false)
    }
  }

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
              className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-accent md:hidden"
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
          <div className="space-y-1.5">
            {/* Theme toggle \u2013 mobile only (desktop has sidebar toggle) */}
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-accent md:hidden"
            >
              <HugeiconsIcon
                icon={theme === 'dark' ? Sun01Icon : Moon02Icon}
                size={18}
                className="text-muted-foreground"
              />
              <div className="text-left">
                <p className="text-sm font-medium">
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </p>
              </div>
            </button>

            {/* Chapter View Mode */}
            <div className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Chapter View</p>
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
            <div className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Volume View</p>
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

          <Separator className="my-4" />

          {/* Home Sections */}
          <h2 className="mb-3 text-lg font-semibold">Home Sections</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['continueReading', 'Continue Reading'],
                ['recentlyAdded', 'Recently Added'],
                ['recentlyUpdated', 'Recently Updated'],
              ] as [keyof typeof sections, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleSection(key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  sections[key]
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Change Password */}
          <h2 className="mb-3 text-lg font-semibold">Change Password</h2>
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw" className="text-xs">
                Current Password
              </Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw" className="text-xs">
                New Password
              </Label>
              <Input
                id="new-pw"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 4 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw" className="text-xs">
                Confirm New Password
              </Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
              />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwSuccess && (
              <p className="flex items-center gap-1.5 text-sm text-green-500">
                <HugeiconsIcon icon={Tick01Icon} size={14} />
                Password changed successfully
              </p>
            )}
            <Button
              onClick={handleChangePassword}
              disabled={pwSubmitting || !currentPw || !newPw || !confirmPw}
              className="w-full gap-2"
              size="sm"
            >
              {pwSubmitting ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <HugeiconsIcon icon={LockPasswordIcon} size={14} />
              )}
              {pwSubmitting ? 'Changing...' : 'Change Password'}
            </Button>
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
            <img
              src={theme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'}
              alt="OpenPanel"
              className="mx-auto mb-2 h-10 w-auto"
            />
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
