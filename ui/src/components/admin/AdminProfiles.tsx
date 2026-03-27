import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Add,
  Delete,
  UserCircleIcon,
  LockPasswordIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  createProfile,
  deleteProfile,
  resetUserPassword,
  type AdminProfile,
} from '@/lib/api'
import { toast } from 'sonner'
import type { ConfirmAction } from './types'

interface AdminProfilesProps {
  profiles: AdminProfile[]
  loadData: () => void
  setConfirmAction: (action: ConfirmAction | null) => void
}

export function AdminProfiles({
  profiles,
  loadData,
  setConfirmAction,
}: AdminProfilesProps) {
  // Add profile dialog state
  const [newProfName, setNewProfName] = useState('')
  const [newProfPw, setNewProfPw] = useState('')
  const [addProfOpen, setAddProfOpen] = useState(false)
  const [addingProf, setAddingProf] = useState(false)

  // Reset password dialog state
  const [resetPwProfileId, setResetPwProfileId] = useState<string | null>(null)
  const [resetPwProfileName, setResetPwProfileName] = useState('')
  const [resetPwValue, setResetPwValue] = useState('')
  const [resettingPw, setResettingPw] = useState(false)
  const [resetPwMsg, setResetPwMsg] = useState('')

  const handleAddProfile = async () => {
    if (!newProfName || !newProfPw) return
    setAddingProf(true)
    try {
      await createProfile(newProfName, newProfPw)
      setAddProfOpen(false)
      setNewProfName('')
      setNewProfPw('')
      loadData()
      toast.success('Profile created')
    } catch (err) {
      toast.error('Failed to create profile', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setAddingProf(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    const prof = profiles.find((p) => p.id === id)
    setConfirmAction({
      title: 'Delete Profile',
      description: `Are you sure you want to delete "${prof?.name || 'this profile'}"? All reading progress will be lost.`,
      onConfirm: async () => {
        try {
          await deleteProfile(id)
          loadData()
          toast.success('Profile deleted')
        } catch (err) {
          toast.error('Failed to delete profile', {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  const handleResetPassword = async () => {
    if (!resetPwProfileId || resetPwValue.length < 4) return
    setResettingPw(true)
    setResetPwMsg('')
    try {
      await resetUserPassword(resetPwProfileId, resetPwValue)
      setResetPwMsg('Password reset successfully')
      setResetPwValue('')
      setTimeout(() => {
        setResetPwProfileId(null)
        setResetPwMsg('')
      }, 1500)
    } catch {
      setResetPwMsg('Failed to reset password')
    } finally {
      setResettingPw(false)
    }
  }

  return (
    <div className="space-y-4">
      {profiles.map((profile) => (
        <Card key={profile.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <HugeiconsIcon
                  icon={UserCircleIcon}
                  size={20}
                  className="text-muted-foreground"
                />
              </div>
              <div>
                <p className="font-medium">{profile.name}</p>
                {profile.is_admin && (
                  <Badge variant="secondary" className="text-xs">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Reset password"
                onClick={() => {
                  setResetPwProfileId(profile.id)
                  setResetPwProfileName(profile.name)
                  setResetPwValue('')
                  setResetPwMsg('')
                }}
              >
                <HugeiconsIcon icon={LockPasswordIcon} size={14} />
              </Button>
              {!profile.is_admin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label="Delete profile"
                  onClick={() => handleDeleteProfile(profile.id)}
                >
                  <HugeiconsIcon icon={Delete} size={14} />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={addProfOpen} onOpenChange={setAddProfOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" className="w-full gap-2">
              <HugeiconsIcon icon={Add} size={14} />
              Add Profile
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={newProfName}
                onChange={(e) => setNewProfName(e.target.value)}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={newProfPw}
                onChange={(e) => setNewProfPw(e.target.value)}
                placeholder="Password"
              />
            </div>
            <Button
              onClick={handleAddProfile}
              className="w-full gap-2"
              disabled={addingProf}
            >
              {addingProf && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              {addingProf ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetPwProfileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetPwProfileId(null)
            setResetPwMsg('')
            setResetPwValue('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reset Password for {resetPwProfileName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={resetPwValue}
                onChange={(e) => setResetPwValue(e.target.value)}
                placeholder="New password (min 4 characters)"
              />
            </div>
            {resetPwMsg && (
              <p
                className={`text-sm ${resetPwMsg.includes('success') ? 'text-green-600' : 'text-destructive'}`}
              >
                {resetPwMsg}
              </p>
            )}
            <Button
              onClick={handleResetPassword}
              className="w-full gap-2"
              disabled={resettingPw || resetPwValue.length < 4}
            >
              {resettingPw && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              {resettingPw ? 'Resetting...' : 'Reset Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
