import { Fragment, useState, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Progress,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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
  ExternalLinkIcon,
  InfoIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  checkForUpdates,
  deleteBackup,
  downloadBackup,
  fetchVersion,
  selfUpdate,
  triggerBackup,
  updateAdminSettings,
  type AdminSettings,
  type BackupInfo,
} from '@/lib/api'
import { formatBytes } from '@/lib/downloads'
import { queryKeys } from '@/lib/query'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'
import { cn, countLabel, formatServerDate, timeAgo } from '@/lib/utils'
import {
  useAdminSettings,
  useBackups,
  useUpdateCheck,
  useVersion,
} from './queries'
import type { ConfirmAction } from './types'

const SECTION = 'py-10 md:py-12 [&_[data-slot=section-label]]:mb-6'

const AUTO_SCAN_ITEMS = [
  { value: '0', label: 'Off' },
  { value: '15', label: 'Every 15 minutes' },
  { value: '30', label: 'Every 30 minutes' },
  { value: '60', label: 'Every hour' },
  { value: '360', label: 'Every 6 hours' },
  { value: '1440', label: 'Once a day' },
]

const AUTO_BACKUP_ITEMS = [
  { value: '0', label: 'Off' },
  { value: '24', label: 'Every day' },
  { value: '168', label: 'Every week' },
]

const KEEP_ITEMS = [
  { value: '5', label: 'Keep 5' },
  { value: '10', label: 'Keep 10' },
  { value: '20', label: 'Keep 20' },
  { value: '30', label: 'Keep 30' },
]

/** A choice list that still shows a value set outside its choices, as itself. */
function withCurrent(
  items: { value: string; label: string }[],
  value: string,
  label: (value: string) => string,
) {
  return items.some((i) => i.value === value)
    ? items
    : [...items, { value, label: label(value) }]
}

const backupDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type UpdatePhase = 'idle' | 'triggered' | 'restarting' | 'success' | 'failed'

export function AdminSettingsTab({
  setConfirmAction,
}: {
  setConfirmAction: (action: ConfirmAction | null) => void
}) {
  const queryClient = useQueryClient()
  const { data: settings } = useAdminSettings()

  const handleSettingChange = async (patch: Partial<AdminSettings>) => {
    if (!settings) return
    const previous = settings
    queryClient.setQueryData(queryKeys.adminSettings(), {
      ...settings,
      ...patch,
    })
    try {
      await updateAdminSettings(patch)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adminOverview(),
      })
    } catch (err) {
      queryClient.setQueryData(queryKeys.adminSettings(), previous)
      toast.error("The setting wasn't saved.", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  if (!settings) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 pt-10">
        <span className="sr-only">Loading the settings…</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} shape="item" className="h-14" />
        ))}
      </div>
    )
  }

  const autoScan = String(settings.auto_scan_interval_min ?? 0)

  return (
    <div>
      <Section label="Scanning" className={SECTION}>
        <Setting
          title="Scan when the server starts"
          description="Look for new and changed files each time OpenPanel starts."
          first
        >
          <Switch
            aria-label="Scan when the server starts"
            checked={settings.scan_on_startup}
            onCheckedChange={(v) =>
              handleSettingChange({ scan_on_startup: v })
            }
          />
        </Setting>
        <Setting
          title="Scan automatically"
          description="Look for new, changed and removed files on a schedule, like those a downloader adds."
        >
          <SettingSelect
            label="Scan automatically"
            items={withCurrent(
              AUTO_SCAN_ITEMS,
              autoScan,
              (v) => `Every ${v} minutes`,
            )}
            value={autoScan}
            onChange={(value) =>
              handleSettingChange({ auto_scan_interval_min: Number(value) })
            }
          />
        </Setting>
      </Section>

      <UpdatesSection settings={settings} onChange={handleSettingChange} />

      <BackupsSection
        settings={settings}
        onChange={handleSettingChange}
        setConfirmAction={setConfirmAction}
      />
    </div>
  )
}

function SettingSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next && onChange(next as string)}
    >
      <SelectTrigger aria-label={label} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ── Updates ─────────────────────────────────────────────────────────────── */

function UpdatesSection({
  settings,
  onChange,
}: {
  settings: AdminSettings
  onChange: (patch: Partial<AdminSettings>) => Promise<void>
}) {
  const queryClient = useQueryClient()
  const { data: versionInfo } = useVersion()
  const { data: updateCheck, isFetching: fetchingUpdate } = useUpdateCheck()
  // A check asked for by the button: GitHub is asked anew, so one at a time.
  const [forcedCheck, setForcedCheck] = useState(false)
  const checkingUpdate = fetchingUpdate || forcedCheck

  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useScrollToHash('updates', !!versionInfo)

  useEffect(
    () => () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current)
    },
    [],
  )

  const handleCheckUpdate = async () => {
    if (forcedCheck) return
    setForcedCheck(true)
    setUpdateMsg('')
    setUpdatePhase('idle')
    try {
      const result = await checkForUpdates(true)
      queryClient.setQueryData(queryKeys.updateCheck(), result)
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
      setForcedCheck(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    setUpdatePhase('idle')

    // Check for updates first
    try {
      const result = await checkForUpdates(true)
      queryClient.setQueryData(queryKeys.updateCheck(), result)
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
            queryClient.setQueryData(queryKeys.version(), ver)
            if (preVersion && ver.commit !== preVersion.commit) {
              const shortOld = preVersion.commit.slice(0, 7)
              const shortNew = ver.commit.slice(0, 7)
              setUpdatePhase('success')
              setUpdateMsg(
                `Updated from ${shortOld} to ${shortNew} (${ver.version}). Reload the page to use the new version.`,
              )
            } else {
              setUpdatePhase('success')
              setUpdateMsg(`The server restarted on ${ver.version}.`)
            }
            setUpdating(false)
            queryClient.removeQueries({ queryKey: queryKeys.updateCheck() })
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

  const available = !!updateCheck?.update_available && updatePhase === 'idle'
  // Only a check that answered can say there is nothing new.
  const upToDate =
    !!updateCheck && !updateCheck.error && !updateCheck.update_available
  // A nightly build on the stable channel only ever sees older releases.
  const behindChannel =
    versionInfo?.channel === 'nightly' && settings.update_channel === 'stable'
  const changes = updateCheck?.changes ?? []

  return (
    <Section label="Updates" className={SECTION}>
      <div id="updates" className="flex scroll-mt-24 flex-wrap items-center gap-x-4 gap-y-2">
        {versionInfo ? (
          <>
            <span className="font-mono text-sm text-foreground tabular-nums">
              {versionInfo.version}
            </span>
            {!versionInfo.version.includes(versionInfo.commit.slice(0, 7)) && (
              <span className="font-mono text-xs text-muted-foreground">
                {versionInfo.commit.slice(0, 7)}
              </span>
            )}
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
        {updateCheck?.checked_at && (
          <span className="font-mono text-xs text-muted-foreground">
            Checked {timeAgo(updateCheck.checked_at)}
          </span>
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
          value={[settings.update_channel === 'nightly' ? 'nightly' : 'stable']}
          onValueChange={async (value) => {
            const next = value[0]
            if (!next || next === settings.update_channel) return
            await onChange({ update_channel: next })
            await handleCheckUpdate()
          }}
        >
          <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
          <ToggleGroupItem value="nightly">Nightly</ToggleGroupItem>
        </ToggleGroup>
      </Setting>

      {behindChannel && (
        <Alert variant="info" className="mt-6 max-w-xl">
          <InfoIcon />
          <AlertDescription>
            This server runs a nightly build. Stable releases are older, so
            choose Nightly to get updates.
          </AlertDescription>
        </Alert>
      )}

      {available && changes.length > 0 && (
        <div className="mt-8 flex max-w-2xl flex-col gap-3">
          <p className="m-0 eyebrow">
            What's new ·{' '}
            {countLabel(updateCheck?.total_changes ?? changes.length, 'change')}
          </p>
          <ul className="m-0 flex list-none flex-col border-y border-border/60 p-0">
            {changes.map((change, i) => (
              <li
                key={`${i}-${change}`}
                className={cn(
                  'py-2.5 text-sm text-foreground-soft',
                  i > 0 && 'border-t border-border/60',
                )}
              >
                {change}
              </li>
            ))}
          </ul>
          {updateCheck?.release_url && (
            <a
              href={updateCheck.release_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-item text-sm text-foreground-soft underline underline-offset-4 focus-ring hover:text-foreground"
            >
              The release on GitHub
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}

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
            disabled={checkingUpdate}
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
      {updateMsg && (updatePhase === 'success' || updatePhase === 'failed') && (
        <Alert
          variant={updatePhase === 'success' ? 'success' : 'warning'}
          className="mt-6 max-w-xl"
        >
          {updatePhase === 'success' ? <CircleCheckIcon /> : <CircleAlertIcon />}
          <AlertTitle>
            {updatePhase === 'success'
              ? 'Up to date'
              : 'The update needs attention'}
          </AlertTitle>
          <AlertDescription>{updateMsg}</AlertDescription>
        </Alert>
      )}
    </Section>
  )
}

/* ── Backups ─────────────────────────────────────────────────────────────── */

function BackupsSection({
  settings,
  onChange,
  setConfirmAction,
}: {
  settings: AdminSettings
  onChange: (patch: Partial<AdminSettings>) => Promise<void>
  setConfirmAction: (action: ConfirmAction | null) => void
}) {
  const queryClient = useQueryClient()
  const { data: backups } = useBackups()
  const [backingUp, setBackingUp] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleDownload = async (backup: BackupInfo) => {
    setDownloading(backup.filename)
    try {
      const url = URL.createObjectURL(await downloadBackup(backup.filename))
      const link = document.createElement('a')
      link.href = url
      link.download = backup.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      toast.error("The backup wasn't downloaded.", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDownloading(null)
    }
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.backups() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview() })
  }

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const result = await triggerBackup()
      refresh()
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

  const handleDelete = (backup: BackupInfo) =>
    setConfirmAction({
      title: 'Delete this backup?',
      description: `${backup.filename} is removed from the backup folder. The database itself is not touched.`,
      confirmLabel: 'Delete backup',
      onConfirm: async () => {
        try {
          await deleteBackup(backup.filename)
          refresh()
          toast.success('The backup is deleted.')
        } catch (err) {
          toast.error("The backup wasn't deleted.", {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })

  const interval = String(settings.auto_backup_interval_hours ?? 0)
  const keep = String(settings.backup_keep ?? 10)

  return (
    <Section label="Backups" last className={SECTION}>
      <Setting
        title="Back up automatically"
        description="A copy of the database — accounts, progress, collections — in the data folder's backups."
        first
      >
        <SettingSelect
          label="Back up automatically"
          items={withCurrent(
            AUTO_BACKUP_ITEMS,
            interval,
            (v) => `Every ${v} hours`,
          )}
          value={interval}
          onChange={(value) =>
            onChange({ auto_backup_interval_hours: Number(value) })
          }
        />
      </Setting>
      <Setting
        title="How many to keep"
        description="The oldest backups are removed past this number."
      >
        <SettingSelect
          label="Backups to keep"
          items={withCurrent(KEEP_ITEMS, keep, (v) => `Keep ${v}`)}
          value={keep}
          onChange={(value) => onChange({ backup_keep: Number(value) })}
        />
      </Setting>
      <Setting
        title="Back up now"
        description="Before an update or a big change, for instance."
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
                    {[
                      formatServerDate(backupDate, b.created_at),
                      formatBytes(b.size),
                      b.filename.includes('_auto_') ? 'automatic' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Download ${b.filename}`}
                    onClick={() => handleDownload(b)}
                    disabled={downloading !== null}
                  >
                    {downloading === b.filename ? (
                      <Spinner size="sm" label="Downloading" />
                    ) : (
                      <DownloadIcon />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${b.filename}`}
                    onClick={() => handleDelete(b)}
                  >
                    <Trash2Icon />
                  </Button>
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </Section>
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
