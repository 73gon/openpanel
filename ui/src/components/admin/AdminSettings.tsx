import { Fragment, useState, useEffect, useRef, type ReactNode } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Progress,
  Section,
  Spinner,
  Switch,
  Tag,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@zonsh/ui'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  DatabaseIcon,
  DownloadIcon,
  InfoIcon,
} from 'lucide-react'
import {
  updateAdminSettings,
  selfUpdate,
  fetchVersion,
  checkForUpdates,
  triggerBackup,
  fetchBackups,
  type AdminSettings,
  type VersionInfo,
  type UpdateCheckResult,
  type BackupInfo,
} from '@/lib/api'
import { formatBytes } from '@/lib/downloads'
import { cn } from '@/lib/utils'

interface AdminSettingsTabProps {
  settings: AdminSettings | null
  setSettings: (s: AdminSettings) => void
  versionInfo: VersionInfo | null
  setVersionInfo: (v: VersionInfo) => void
  updateCheck: UpdateCheckResult | null
  setUpdateCheck: (v: UpdateCheckResult | null) => void
}

const SECTION = 'py-10 md:py-12 [&_[data-slot=section-label]]:mb-6'

const backupDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type UpdatePhase = 'idle' | 'triggered' | 'restarting' | 'success' | 'failed'

export function AdminSettingsTab({
  settings,
  setSettings,
  versionInfo,
  setVersionInfo,
  updateCheck,
  setUpdateCheck,
}: AdminSettingsTabProps) {
  // Update
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Backups
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    fetchBackups()
      .then(setBackups)
      .catch(() => setBackups([]))
    return () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current)
    }
  }, [])

  const handleSettingChange = async (
    key: keyof AdminSettings,
    value: boolean | number | string,
  ) => {
    if (!settings) return
    const previous = settings
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    try {
      await updateAdminSettings(updated)
    } catch (err) {
      setSettings(previous)
      toast.error("The setting wasn't saved.", {
        description: err instanceof Error ? err.message : undefined,
      })
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
        setUpdateMsg(`The update check failed: ${result.error}`)
      } else if (!result.update_available) {
        setUpdatePhase('success')
        setUpdateMsg('OpenPanel is up to date.')
      }
    } catch {
      setUpdatePhase('failed')
      setUpdateMsg(
        'The update check failed. Check the server can reach GitHub.',
      )
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    setUpdatePhase('idle')

    // Check for updates first
    try {
      const result = await checkForUpdates()
      setUpdateCheck(result)
      if (result.error) {
        setUpdateMsg(`The update check failed: ${result.error}`)
        setUpdatePhase('failed')
        setUpdating(false)
        return
      }
      if (!result.update_available) {
        setUpdateMsg('OpenPanel is up to date.')
        setUpdatePhase('success')
        setUpdating(false)
        return
      }
    } catch {
      setUpdateMsg(
        'The update check failed. Check the server can reach GitHub.',
      )
      setUpdatePhase('failed')
      setUpdating(false)
      return
    }

    const preVersion = versionInfo
    try {
      setUpdatePhase('triggered')
      setUpdateMsg('Downloading and applying the update…')
      await selfUpdate()

      // Server will shut down shortly — poll for restart
      setUpdatePhase('restarting')
      setUpdateMsg('The server is restarting on the new version…')

      let serverWentDown = false
      let elapsed = 0
      const pollInterval = 1500
      const maxWait = 120000
      if (updatePollRef.current) clearInterval(updatePollRef.current)
      updatePollRef.current = setInterval(async () => {
        elapsed += pollInterval
        if (elapsed > maxWait) {
          clearInterval(updatePollRef.current!)
          updatePollRef.current = null
          setUpdatePhase('failed')
          setUpdateMsg(
            "The server didn't come back within two minutes. Restart it by hand.",
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
                `Updated from ${shortOld} to ${shortNew} (v${ver.version}).`,
              )
            } else {
              setUpdatePhase('success')
              setUpdateMsg(`The server restarted on v${ver.version}.`)
            }
            setUpdating(false)
            setUpdateCheck(null)
          }
        } catch {
          if (!serverWentDown) {
            serverWentDown = true
            setUpdatePhase('restarting')
            setUpdateMsg('Waiting for the server to come back…')
          }
        }
      }, pollInterval)
    } catch (err) {
      setUpdateMsg(
        err instanceof Error ? err.message : "The update wasn't applied.",
      )
      setUpdatePhase('failed')
      setUpdating(false)
    }
  }

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const result = await triggerBackup()
      setBackups(await fetchBackups())
      toast.success('The database is backed up.', {
        description: result.filename,
      })
    } catch (err) {
      toast.error('The backup failed.', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBackingUp(false)
    }
  }

  if (!settings) return null

  const available = !!updateCheck?.update_available && updatePhase === 'idle'
  // Only a check that answered can say there is nothing new.
  const upToDate =
    !!updateCheck && !updateCheck.error && !updateCheck.update_available

  return (
    <div>
      <Section label="Access" className={SECTION}>
        <Setting
          title="Remote access"
          description="Let devices other than the server's own connect."
          first
        >
          <Switch
            aria-label="Remote access"
            checked={settings.remote_enabled}
            onCheckedChange={(v) => handleSettingChange('remote_enabled', v)}
          />
        </Setting>
        <Setting
          title="Scan when the server starts"
          description="Look for new and changed files each time OpenPanel starts."
        >
          <Switch
            aria-label="Scan when the server starts"
            checked={settings.scan_on_startup}
            onCheckedChange={(v) => handleSettingChange('scan_on_startup', v)}
          />
        </Setting>
      </Section>

      <Section label="Updates" className={SECTION}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {versionInfo ? (
            <>
              <span className="font-mono text-sm text-foreground tabular-nums">
                v{versionInfo.version}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {versionInfo.commit.slice(0, 7)}
              </span>
              <Tag variant="muted">{versionInfo.channel}</Tag>
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              Version unknown
            </span>
          )}
          {available && (
            <Tag variant="info" dot>
              {updateCheck?.latest_version
                ? `${updateCheck.latest_version} available`
                : 'Update available'}
            </Tag>
          )}
        </div>

        <Setting
          title="Channel"
          description={
            settings.update_channel === 'nightly'
              ? 'Nightly builds: every change on the main branch, as it lands.'
              : 'Stable releases only.'
          }
        >
          <ToggleGroup
            aria-label="Update channel"
            value={[
              settings.update_channel === 'nightly' ? 'nightly' : 'stable',
            ]}
            onValueChange={(value) => {
              const next = value[0]
              if (!next || next === settings.update_channel) return
              handleSettingChange('update_channel', next)
              setUpdateCheck(null)
              setTimeout(handleCheckUpdate, 500)
            }}
          >
            <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
            <ToggleGroupItem value="nightly">Nightly</ToggleGroupItem>
          </ToggleGroup>
        </Setting>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleUpdate}
            disabled={updating || upToDate}
            aria-busy={updating}
            className="relative"
          >
            <span
              className={cn('flex items-center gap-2', updating && 'invisible')}
            >
              <DownloadIcon />
              {upToDate ? 'Up to date' : 'Update now'}
            </span>
            {updating && <Spinner label="Updating" className="absolute" />}
          </Button>
          {!updating && (
            <Button
              variant="secondary"
              onClick={handleCheckUpdate}
              aria-busy={checkingUpdate}
              className="relative"
            >
              <span className={checkingUpdate ? 'invisible' : undefined}>
                Check for updates
              </span>
              {checkingUpdate && (
                <Spinner label="Checking for updates" className="absolute" />
              )}
            </Button>
          )}
        </div>

        {(updatePhase === 'triggered' || updatePhase === 'restarting') && (
          <Progress value={null} label={updateMsg} className="mt-6 max-w-md" />
        )}
        {updateMsg &&
          (updatePhase === 'success' || updatePhase === 'failed') && (
            <Alert
              variant={updatePhase === 'success' ? 'success' : 'warning'}
              className="mt-6 max-w-xl"
            >
              {updatePhase === 'success' ? (
                <CircleCheckIcon />
              ) : (
                <CircleAlertIcon />
              )}
              <AlertTitle>
                {updatePhase === 'success'
                  ? 'Up to date'
                  : 'The update needs attention'}
              </AlertTitle>
              <AlertDescription>{updateMsg}</AlertDescription>
            </Alert>
          )}
        {updatePhase === 'idle' && updateMsg && (
          <Alert variant="info" className="mt-6 max-w-xl">
            <InfoIcon />
            <AlertDescription>{updateMsg}</AlertDescription>
          </Alert>
        )}
      </Section>

      <Section label="Backups" last className={SECTION}>
        <Setting
          title="Database backup"
          description="A copy of the database — accounts, progress, collections — in the data folder."
          first
        >
          <Button
            variant="secondary"
            onClick={handleBackup}
            aria-busy={backingUp}
            className="relative"
          >
            <span className={backingUp ? 'invisible' : undefined}>
              Back up now
            </span>
            {backingUp && <Spinner label="Backing up" className="absolute" />}
          </Button>
        </Setting>
        {backups && backups.length > 0 && (
          <ItemGroup
            render={<ul />}
            className="m-0 mt-8 gap-0 border-y border-border/60 p-0"
          >
            {backups.map((b, i) => (
              <Fragment key={b.filename}>
                {i > 0 && <ItemSeparator />}
                <Item render={<li />} size="sm" className="px-0">
                  <ItemMedia>
                    <DatabaseIcon className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate font-mono text-xs font-normal">
                      {b.filename}
                    </ItemTitle>
                    <ItemDescription className="font-mono text-xs">
                      {backupDate.format(new Date(b.created_at))} ·{' '}
                      {formatBytes(b.size)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        )}
      </Section>
    </div>
  )
}

/** One setting: what it is and does on the left, its control on the right (stacked when narrow). */
function Setting({
  title,
  description,
  first,
  children,
}: {
  title: string
  description: string
  first?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]',
        !first && 'mt-8',
      )}
    >
      <div className="min-w-0">
        <p className="m-0 text-[15px] text-foreground">{title}</p>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
