import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  UserCircleIcon,
  Logout01Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

  const currentProfile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)

  useEffect(() => {
    fetchProfiles()
      .then(setProfiles)
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
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <h1 className="mb-2 text-2xl font-bold">Who's reading?</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Select a profile to continue
          </p>
        </motion.div>

        {currentProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 flex items-center justify-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <HugeiconsIcon
              icon={UserCircleIcon}
              size={20}
              className="text-primary"
            />
            <span className="text-sm">
              Signed in as <strong>{currentProfile.name}</strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="ml-2 gap-1"
            >
              <HugeiconsIcon icon={Logout01Icon} size={14} />
              Sign out
            </Button>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                <CardContent className="flex flex-col items-center gap-3 py-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    {selectingId === profile.id ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={24}
                        className="animate-spin text-muted-foreground"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={UserCircleIcon}
                        size={32}
                        className="text-muted-foreground"
                      />
                    )}
                  </div>
                  <span className="text-sm font-medium">{profile.name}</span>
                  {profile.has_pin && (
                    <span className="text-xs text-muted-foreground">
                      PIN protected
                    </span>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

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
    </div>
  )
}
