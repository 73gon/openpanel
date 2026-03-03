import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  UserCircleIcon,
  Logout01Icon,
  Loading03Icon,
  Moon02Icon,
  Sun01Icon,
  ShieldKeyIcon,
  UserIcon,
  GridViewIcon,
  Menu02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  fetchProfiles,
  selectProfile,
  logout as apiLogout,
  fetchGuestEnabled,
  type Profile,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'

export const Route = createFileRoute('/profiles')({
  component: ProfilesPage,
})

function ProfilesPage() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [submittingPin, setSubmittingPin] = useState(false)
  const [guestEnabled, setGuestEnabled] = useState(true)

  const currentProfile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)

  useEffect(() => {
    Promise.all([
      fetchProfiles().then(setProfiles),
      fetchGuestEnabled().then(setGuestEnabled).catch(() => setGuestEnabled(true)),
    ])
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = async (profile: Profile) => {
    if (profile.has_pin) {
      setSelectedProfile(profile)
      setPin('')
      setError('')
      return
    }

    setSelectingId(profile.id)
    try {
      const result = await selectProfile(profile.id)
      setProfile(result.profile, result.token)
      navigate({ to: '/' })
    } catch (err) {
      setError('Failed to select profile')
    } finally {
      setSelectingId(null)
    }
  }

  const handleGuest = () => {
    setProfile(null, null)
    navigate({ to: '/' })
  }

  const handlePinSubmit = async () => {
    if (!selectedProfile) return
    setSubmittingPin(true)
    try {
      const result = await selectProfile(selectedProfile.id, pin)
      setProfile(result.profile, result.token)
      setSelectedProfile(null)
      navigate({ to: '/' })
    } catch {
      setError('Incorrect PIN')
    } finally {
      setSubmittingPin(false)
    }
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
    } catch {
      /* ignore */
    }
    setProfile(null, null)
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

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      {/* Profile Selection */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mb-1 text-xl font-bold">Profiles</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Select a profile to continue
        </p>

        {currentProfile && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/30 bg-accent/50 p-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={UserCircleIcon}
                size={18}
                className="text-primary"
              />
              <span className="text-sm">
                Signed in as <strong>{currentProfile.name}</strong>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-1 text-xs"
            >
              <HugeiconsIcon icon={Logout01Icon} size={14} />
              Sign out
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profiles.map((profile, i) => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
            >
              <Card
                className={`cursor-pointer border transition-all hover:border-primary/50 hover:shadow-md ${
                  currentProfile?.id === profile.id
                    ? 'border-primary bg-accent/50'
                    : ''
                } ${selectingId === profile.id ? 'opacity-70' : ''}`}
                onClick={() => !selectingId && handleSelect(profile)}
              >
                <CardContent className="flex flex-col items-center gap-2 py-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    {selectingId === profile.id ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={22}
                        className="animate-spin text-muted-foreground"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={UserCircleIcon}
                        size={28}
                        className="text-muted-foreground"
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium">{profile.name}</span>
                  <span
                    className={`text-xs ${profile.has_pin ? 'text-muted-foreground' : 'invisible'}`}
                  >
                    PIN protected
                  </span>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {/* Guest option */}
          {guestEnabled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: profiles.length * 0.05 }}
            >
              <Card
                className={`cursor-pointer border border-dashed transition-all hover:border-primary/50 hover:shadow-md ${
                  currentProfile === null ? 'border-primary bg-accent/50' : ''
                }`}
                onClick={handleGuest}
              >
                <CardContent className="flex flex-col items-center gap-2 py-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <HugeiconsIcon
                      icon={UserIcon}
                      size={28}
                      className="text-muted-foreground"
                    />
                  </div>
                  <span className="text-sm font-medium">Guest</span>
                  <span className="invisible text-xs">placeholder</span>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </motion.div>

      <Separator className="my-6" />

      {/* Settings */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <h2 className="mb-3 text-lg font-semibold">Settings</h2>
        <div className="space-y-2">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
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

      <Separator className="my-6" />

      {/* Admin */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Link to="/admin">
          <button className="flex w-full items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent">
            <HugeiconsIcon
              icon={ShieldKeyIcon}
              size={20}
              className="text-muted-foreground"
            />
            <div className="text-left">
              <p className="text-sm font-medium">Admin</p>
              <p className="text-xs text-muted-foreground">
                Manage libraries, profiles & settings
              </p>
            </div>
          </button>
        </Link>
      </motion.div>

      {/* PIN Dialog */}
      <Dialog
        open={!!selectedProfile}
        onOpenChange={(open) => !open && setSelectedProfile(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter PIN for {selectedProfile?.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handlePinSubmit()
            }}
            className="space-y-4"
          >
            <Input
              type="password"
              placeholder="PIN"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setError('')
              }}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submittingPin}
            >
              {submittingPin && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              {submittingPin ? 'Signing in...' : 'Continue'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
