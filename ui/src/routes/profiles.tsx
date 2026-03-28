import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { type SectionVisibility, defaultSections } from '@/lib/types'
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
  Book02Icon,
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
import { toast } from 'sonner'
import { AVAILABLE_LOCALES } from '@/lib/i18n'
import {
  useReaderPrefs,
  type ReadMode,
  type FitMode,
  type ReadDirection,
} from '@/lib/reader-store'

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
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)

  // Reader prefs
  const {
    readMode,
    fitMode,
    direction,
    setReadMode,
    setFitMode,
    setDirection,
  } = useReaderPrefs()

  // Password change state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwSubmitting, setPwSubmitting] = useState(false)

  // Section visibility (moved from home page)
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
    updatePreferences({ homeSections: updated }).catch((e: Error) => {
      toast.error('Failed to save preference', { description: e.message })
    })
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
      <div className="mx-auto max-w-lg px-6 py-8 md:max-w-3xl lg:max-w-4xl">
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

          {/* Reading Statistics */}
          <Link
            to="/stats"
            className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-accent"
          >
            <HugeiconsIcon
              icon={Book02Icon}
              size={20}
              className="text-muted-foreground"
            />
            <div className="text-left">
              <p className="text-sm font-medium">Reading Statistics</p>
              <p className="text-xs text-muted-foreground">
                Pages, streaks, and activity
              </p>
            </div>
          </Link>

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

            {/* Language */}
            <div className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Language</p>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  {AVAILABLE_LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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

          {/* Reader Preferences */}
          <h2 className="mb-3 text-lg font-semibold">Reader Preferences</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Default settings when opening any book. Direction can be overridden
            per-series in the reader.
          </p>
          <div className="space-y-4">
            <SettingRow
              label="Reading Mode"
              description="How pages are displayed"
            >
              <SegmentedControl
                value={readMode}
                onChange={(v) => setReadMode(v as ReadMode)}
                options={[
                  { value: 'scroll', label: 'Scroll' },
                  { value: 'single', label: 'Single' },
                  { value: 'double', label: 'Double' },
                ]}
              />
            </SettingRow>
            <SettingRow
              label="Page Fit"
              description="How pages scale to viewport"
            >
              <SegmentedControl
                value={fitMode}
                onChange={(v) => setFitMode(v as FitMode)}
                options={[
                  { value: 'width', label: 'Width' },
                  { value: 'height', label: 'Height' },
                  { value: 'original', label: 'Original' },
                ]}
              />
            </SettingRow>
            <SettingRow
              label="Direction"
              description="Default page turn direction"
            >
              <SegmentedControl
                value={direction}
                onChange={(v) => setDirection(v as ReadDirection)}
                options={[
                  { value: 'ltr', label: 'Left → Right' },
                  { value: 'rtl', label: 'Right → Left' },
                ]}
              />
            </SettingRow>
          </div>

          {/* Mini Preview */}
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                Preview
              </span>
              <span className="text-[10px] text-muted-foreground">
                {readMode} · {fitMode} · {direction === 'ltr' ? 'LTR' : 'RTL'}
              </span>
            </div>
            <div className="bg-background p-3">
              <ReaderPreview
                readMode={readMode}
                fitMode={fitMode}
                direction={direction}
              />
            </div>
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

// -- Setting Row --

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// -- Segmented Control --

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// -- Live Reader Preview --

function ReaderPreview({
  readMode,
  fitMode,
  direction,
}: {
  readMode: ReadMode
  fitMode: FitMode
  direction: ReadDirection
}) {
  const getPageStyle = (): React.CSSProperties => {
    switch (fitMode) {
      case 'width':
        return { width: '100%', maxWidth: 100, aspectRatio: '2/3' }
      case 'height':
        return { height: 100, aspectRatio: '2/3' }
      case 'original':
        return { width: 70, aspectRatio: '2/3' }
    }
  }

  const pageStyle = getPageStyle()

  const PagePlaceholder = ({ page }: { page: number }) => (
    <div
      className={`flex items-center justify-center rounded border border-border bg-muted/50`}
      style={pageStyle}
    >
      <div className="flex flex-col items-center gap-0.5">
        <HugeiconsIcon
          icon={Book02Icon}
          size={14}
          className="text-muted-foreground/40"
        />
        <span className="text-[9px] text-muted-foreground">{page}</span>
      </div>
    </div>
  )

  if (readMode === 'scroll') {
    return (
      <div className="mx-auto flex max-h-40 flex-col items-center gap-1 overflow-y-auto">
        {[1, 2, 3].map((p) => (
          <PagePlaceholder key={p} page={p} />
        ))}
      </div>
    )
  }

  if (readMode === 'double') {
    return (
      <div
        className={`flex items-center justify-center gap-1 ${
          direction === 'rtl' ? 'flex-row-reverse' : ''
        }`}
      >
        <PagePlaceholder page={1} />
        <PagePlaceholder page={2} />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <PagePlaceholder page={1} />
        <div
          className={`absolute inset-0 flex items-center justify-between px-0.5 ${
            direction === 'rtl' ? 'flex-row-reverse' : ''
          }`}
        >
          <span className="text-[9px] text-muted-foreground/40">←</span>
          <span className="text-[9px] text-muted-foreground/40">→</span>
        </div>
      </div>
    </div>
  )
}
