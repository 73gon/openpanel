import { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Download04Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  updateAdminSettings,
  changePassword,
  triggerUpdate,
  fetchVersion,
  checkForUpdates,
  triggerBackup,
  fetchBackups,
  type AdminSettings,
  type VersionInfo,
  type UpdateCheckResult,
  type BackupInfo,
} from '@/lib/api'
import { toast } from 'sonner'

interface AdminSettingsTabProps {
  settings: AdminSettings | null
  setSettings: (s: AdminSettings) => void
  versionInfo: VersionInfo | null
  setVersionInfo: (v: VersionInfo) => void
  updateCheck: UpdateCheckResult | null
  setUpdateCheck: (v: UpdateCheckResult | null) => void
}

export function AdminSettingsTab({
  settings,
  setSettings,
  versionInfo,
  setVersionInfo,
  updateCheck,
  setUpdateCheck,
}: AdminSettingsTabProps) {
  // Change password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  // Update
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updatePhase, setUpdatePhase] = useState<
    'idle' | 'triggered' | 'restarting' | 'success' | 'failed'
  >('idle')
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Backups
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')

  useEffect(() => {
    return () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current)
    }
  }, [])

  const handleSettingChange = async (
    key: keyof AdminSettings,
    value: boolean | number | string,
  ) => {
    if (!settings) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    try {
      await updateAdminSettings(updated)
    } catch {}
  }

  const handleChangePassword = async () => {
    setChangingPw(true)
    try {
      await changePassword(currentPw, newPw)
      setPwMsg('Password changed')
      setCurrentPw('')
      setNewPw('')
    } catch {
      setPwMsg('Failed to change password')
    } finally {
      setChangingPw(false)
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateMsg('')
    setUpdatePhase('idle')
    try {
      const result = await checkForUpdates()
      setUpdateCheck(result)
      if (result.error) {
        setUpdatePhase('failed')
        setUpdateMsg(`Update check failed: ${result.error}`)
      } else if (!result.update_available) {
        setUpdatePhase('success')
        setUpdateMsg('Already up to date.')
      }
    } catch {
      setUpdatePhase('failed')
      setUpdateMsg('Failed to check for updates')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    setUpdatePhase('idle')

    // Check for updates first before triggering
    try {
      const result = await checkForUpdates()
      setUpdateCheck(result)
      if (result.error) {
        setUpdateMsg(`Update check failed: ${result.error}`)
        setUpdatePhase('failed')
        setUpdating(false)
        return
      }
      if (!result.update_available) {
        setUpdateMsg('Already up to date.')
        setUpdatePhase('success')
        setUpdating(false)
        return
      }
    } catch {
      setUpdateMsg('Failed to check for updates')
      setUpdatePhase('failed')
      setUpdating(false)
      return
    }

    const preVersion = versionInfo
    try {
      await triggerUpdate()
      setUpdatePhase('triggered')
      setUpdateMsg('Update scheduled — host updater will pick this up shortly.')
      let serverWentDown = false
      let elapsed = 0
      const pollInterval = 1000
      const maxWait = 300000
      if (updatePollRef.current) clearInterval(updatePollRef.current)
      updatePollRef.current = setInterval(async () => {
        elapsed += pollInterval
        if (elapsed > maxWait) {
          clearInterval(updatePollRef.current!)
          updatePollRef.current = null
          setUpdatePhase('failed')
          setUpdateMsg(
            'Update is taking too long — check the updater log on the host.',
          )
          setUpdating(false)
          return
        }
        try {
          const ver = await fetchVersion()
          const startupChanged =
            preVersion &&
            ver.startup_time != null &&
            preVersion.startup_time != null &&
            ver.startup_time !== 0 &&
            ver.startup_time !== preVersion.startup_time
          const cameBack = serverWentDown
          if (startupChanged || cameBack) {
            clearInterval(updatePollRef.current!)
            updatePollRef.current = null
            setVersionInfo(ver)
            if (preVersion && ver.commit !== preVersion.commit) {
              const shortOld = preVersion.commit.slice(0, 7)
              const shortNew = ver.commit.slice(0, 7)
              setUpdatePhase('success')
              setUpdateMsg(
                `Updated: ${shortOld} → ${shortNew} (v${ver.version})`,
              )
            } else {
              setUpdatePhase('success')
              setUpdateMsg(`Server restarted on v${ver.version}`)
            }
            setUpdating(false)
            setUpdateCheck(null)
          } else if (elapsed > 60000) {
            setUpdateMsg('Still waiting — this may take a minute...')
          } else if (elapsed > 20000) {
            setUpdateMsg(
              'Host updater is running — server will restart shortly...',
            )
          }
        } catch {
          if (!serverWentDown) {
            serverWentDown = true
            setUpdatePhase('restarting')
            setUpdateMsg('Pulling & restarting container...')
          }
        }
      }, pollInterval)
    } catch {
      setUpdateMsg('Failed to trigger update')
      setUpdatePhase('failed')
      setUpdating(false)
    }
  }

  const handleBackup = async () => {
    setBackingUp(true)
    setBackupMsg('')
    try {
      const result = await triggerBackup()
      setBackupMsg('Backup created: ' + result.filename)
      const bks = await fetchBackups()
      setBackups(bks)
      toast.success('Backup created')
    } catch {
      setBackupMsg('Backup failed')
      toast.error('Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const loadBackups = async () => {
    try {
      const bks = await fetchBackups()
      setBackups(bks)
    } catch {}
  }

  if (!settings) return null

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Remote Access</Label>
              <p className="text-xs text-muted-foreground">
                Allow access from other devices
              </p>
            </div>
            <Switch
              checked={settings.remote_enabled}
              onCheckedChange={(v) =>
                handleSettingChange('remote_enabled', v)
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Scan on Startup</Label>
              <p className="text-xs text-muted-foreground">
                Automatically scan when server starts
              </p>
            </div>
            <Switch
              checked={settings.scan_on_startup}
              onCheckedChange={(v) =>
                handleSettingChange('scan_on_startup', v)
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="password"
            placeholder="Current password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          {pwMsg && (
            <p className="text-sm text-muted-foreground">{pwMsg}</p>
          )}
          <Button
            onClick={handleChangePassword}
            variant="outline"
            className="gap-2"
            disabled={changingPw}
          >
            {changingPw && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin"
              />
            )}
            {changingPw ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="w-full space-y-1 sm:w-auto">
              <div className="flex items-center gap-2">
                <p className="font-medium">Update OpenPanel</p>
                {updateCheck?.update_available &&
                  updatePhase === 'idle' && (
                    <Badge variant="default" className="text-xs">
                      Update available
                    </Badge>
                  )}
              </div>
              {versionInfo && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-xs"
                  >
                    v{versionInfo.version}
                  </Badge>
                  <Badge
                    variant={
                      versionInfo.channel === 'stable'
                        ? 'default'
                        : versionInfo.channel === 'nightly'
                          ? 'destructive'
                          : 'outline'
                    }
                    className="text-xs"
                  >
                    {versionInfo.channel}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {versionInfo.commit}
                  </span>
                  {updateCheck?.update_available &&
                    updateCheck.latest_version && (
                      <span className="text-xs text-muted-foreground">
                        {'-> ' + updateCheck.latest_version}
                      </span>
                    )}
                </div>
              )}
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {!updating && (
                <Button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-xs"
                >
                  {checkingUpdate && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={12}
                      className="animate-spin"
                    />
                  )}
                  Check
                </Button>
              )}
              <Button
                onClick={handleUpdate}
                disabled={updating || updatePhase === 'success'}
                size="sm"
                variant={
                  updateCheck?.update_available
                    ? 'default'
                    : 'outline'
                }
                className="flex-1 gap-2 sm:flex-none"
              >
                {updating ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    className="animate-spin"
                  />
                ) : updatePhase === 'success' ? (
                  <HugeiconsIcon icon={Tick02Icon} size={14} />
                ) : (
                  <HugeiconsIcon icon={Download04Icon} size={14} />
                )}
                {updating
                  ? updatePhase === 'restarting'
                    ? 'Restarting...'
                    : updatePhase === 'triggered'
                      ? 'Scheduled...'
                      : 'Updating...'
                  : updatePhase === 'success'
                    ? 'Done'
                    : 'Update'}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Update Channel</Label>
              <p className="text-xs text-muted-foreground">
                {settings.update_channel === 'nightly'
                  ? 'Nightly builds'
                  : 'Stable releases only'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Stable
              </span>
              <Switch
                checked={settings.update_channel === 'nightly'}
                onCheckedChange={(v) => {
                  handleSettingChange(
                    'update_channel',
                    v ? 'nightly' : 'stable',
                  )
                  setUpdateCheck(null)
                  setTimeout(handleCheckUpdate, 500)
                }}
              />
              <span className="text-xs text-muted-foreground">
                Nightly
              </span>
            </div>
          </div>
          {updateMsg && (
            <p
              className={`text-xs ${updatePhase === 'success' ? 'text-green-600 dark:text-green-400' : updatePhase === 'failed' ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}
            >
              {updateMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Database Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleBackup}
            disabled={backingUp}
            size="sm"
            className="gap-2"
          >
            {backingUp && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin"
              />
            )}
            {backingUp ? 'Creating...' : 'Create Backup'}
          </Button>
          {backupMsg && (
            <p className="text-xs text-muted-foreground">
              {backupMsg}
            </p>
          )}
          {backups.length === 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={loadBackups}
              className="text-xs"
            >
              Load existing backups
            </Button>
          )}
          {backups.length > 0 && (
            <div className="space-y-1">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs"
                >
                  <span>{b.filename}</span>
                  <span className="text-muted-foreground">
                    {(b.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
