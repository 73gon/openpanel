import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
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
  Skeleton,
  Spinner,
  Tag,
  toast,
} from '@zonsh/ui'
import {
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  DatabaseBackupIcon,
  DownloadIcon,
  FileWarningIcon,
  LinkIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import {
  needsReview,
  startScan,
  triggerBackup,
  type AdminOverview as Overview,
  type MetadataReview,
  type ReaderActivity,
  type UpdateCheckResult,
} from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import { formatBytes } from '@/lib/downloads'
import { queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import {
  cn,
  countLabel,
  formatDuration,
  parseServerDate,
  stripTitleZeros,
  timeAgo,
} from '@/lib/utils'
import type { AdminSearch } from '@/routes/admin'
import { SectionTitle } from '@/components/page-header'
import { ErrorNotice } from '@/components/route-error'
import { useMetadataReview, useOverview, useUpdateCheck } from './queries'

/** The state of the server at a glance: what needs doing, the last scan, and who reads. */
export function AdminOverview() {
  const { data: overview, error, refetch, isPending } = useOverview()
  const { data: review } = useMetadataReview()
  const { data: update } = useUpdateCheck()

  if (isPending) return <OverviewSkeleton />
  if (error || !overview) {
    return (
      <ErrorNotice
        title="The overview didn't load"
        error={error}
        onRetry={() => refetch()}
        className="max-w-2xl"
      />
    )
  }

  return (
    <div className="flex flex-col gap-12 sm:gap-14">
      <Figures overview={overview} />
      <Attention overview={overview} review={review} update={update} />
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <ScanSummary overview={overview} />
        <Readers readers={overview.readers} />
      </div>
    </div>
  )
}

/* ── Figures ─────────────────────────────────────────────────────────────── */

function Figures({ overview }: { overview: Overview }) {
  const { library } = overview
  const day = Date.now() - 24 * 3600_000
  const activeToday = overview.readers.filter(
    (r) => (parseServerDate(r.last_active_at)?.getTime() ?? 0) > day,
  ).length

  const figures: { label: string; value: string; note: string }[] = [
    {
      label: 'Series',
      value: library.series.toLocaleString('en-US'),
      note: `${countLabel(library.books, 'book')} in ${countLabel(library.libraries, 'library', 'libraries')}`,
    },
    {
      label: 'Pages',
      value: library.pages.toLocaleString('en-US'),
      note: `${formatBytes(library.bytes)} of files`,
    },
    {
      label: 'Readers',
      value: overview.readers.length.toLocaleString('en-US'),
      note: `${activeToday.toLocaleString('en-US')} active today`,
    },
    {
      label: 'Running for',
      value: formatDuration(overview.uptime_seconds),
      note: `Database ${formatBytes(overview.database_bytes)}`,
    },
  ]

  return (
    <dl className="m-0 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="flex min-w-0 flex-col gap-3 border-t border-border/60 pt-4 pb-6"
        >
          <dt className="eyebrow">{figure.label}</dt>
          <dd className="m-0 flex flex-col gap-1.5">
            <span className="font-mono text-2xl leading-none text-foreground tabular-nums">
              {figure.value}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {figure.note}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Needs attention ─────────────────────────────────────────────────────── */

interface Concern {
  key: string
  tone: 'warning' | 'info' | 'destructive'
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action: ReactNode
}

const TONE_INK: Record<Concern['tone'], string> = {
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
}

/** What an administrator should look at, most pressing first; or that nothing needs them. */
function Attention({
  overview,
  review,
  update,
}: {
  overview: Overview
  review: MetadataReview | undefined
  update: UpdateCheckResult | undefined
}) {
  const queryClient = useQueryClient()
  const [backingUp, setBackingUp] = useState(false)
  const { scan, problems, backups } = overview
  const concerns: Concern[] = []

  const linkButton = (label: string, search: AdminSearch, hash?: string) => (
    <Button
      variant="secondary"
      size="sm"
      nativeButton={false}
      render={<Link to="/admin" search={search} hash={hash} />}
    >
      {label}
    </Button>
  )

  if (scan.errors > 0 && !scan.running) {
    concerns.push({
      key: 'scan',
      tone: 'warning',
      icon: FileWarningIcon,
      title: `${countLabel(scan.errors, 'file')} couldn't be read in the last scan`,
      description:
        'Damaged or unfinished downloads, or a library folder that is gone.',
      action: linkButton('See which', { tab: 'libraries' }),
    })
  }
  if (problems.errors > 0) {
    concerns.push({
      key: 'errors',
      tone: 'destructive',
      icon: CircleAlertIcon,
      title: `${countLabel(problems.errors, 'error')} logged today`,
      description: 'Something went wrong on the server in the last 24 hours.',
      action: linkButton('Open the logs', { tab: 'logs', level: 'error' }),
    })
  }
  if (problems.failed_sign_ins > 0) {
    concerns.push({
      key: 'sign-ins',
      tone: 'warning',
      icon: ShieldAlertIcon,
      title: `${countLabel(problems.failed_sign_ins, 'failed sign-in')} today`,
      description:
        'Wrong passwords in the last 24 hours. Many from one address is worth a look.',
      action: linkButton('See who', { tab: 'logs', category: 'auth' }),
    })
  }
  if (update?.update_available) {
    concerns.push({
      key: 'update',
      tone: 'info',
      icon: DownloadIcon,
      title: `${update.latest_version ?? 'An update'} is available`,
      description: update.total_changes
        ? `${countLabel(update.total_changes, 'change')} since your version.`
        : 'A newer version of OpenPanel is out.',
      action: linkButton('See the update', { tab: 'system' }, 'updates'),
    })
  }
  const toReview = review?.series.filter(needsReview) ?? []
  if (toReview.length > 0) {
    const unmatched = toReview.filter((s) => s.anilist_id === null).length
    concerns.push({
      key: 'metadata',
      tone: 'info',
      icon: LinkIcon,
      title:
        unmatched === toReview.length
          ? `${countLabel(unmatched, 'series', 'series')} without AniList details`
          : `${countLabel(toReview.length, 'series', 'series')} may show the wrong details`,
      description:
        'Their AniList match is missing or looks like another work: covers, titles and genres come from it.',
      action: linkButton('Review', { tab: 'libraries' }, 'metadata'),
    })
  }

  const latestBackup = parseServerDate(backups.latest_at)
  const weekAgo = Date.now() - 7 * 24 * 3600_000
  if (!latestBackup || latestBackup.getTime() < weekAgo) {
    const backUp = async () => {
      setBackingUp(true)
      try {
        const result = await triggerBackup()
        toast.success('The database is backed up.', {
          description: result.filename,
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.adminOverview(),
        })
        void queryClient.invalidateQueries({ queryKey: queryKeys.backups() })
      } catch (err) {
        toast.error('The backup failed.', {
          description: err instanceof Error ? err.message : undefined,
        })
      } finally {
        setBackingUp(false)
      }
    }
    concerns.push({
      key: 'backup',
      tone: 'warning',
      icon: DatabaseBackupIcon,
      title: latestBackup
        ? `The last backup is from ${timeAgo(backups.latest_at)}`
        : 'The database has no backup yet',
      description:
        backups.auto_interval_hours > 0
          ? 'Automatic backups are on, but none was made lately.'
          : 'Accounts, reading progress and collections live only in the database. Automatic backups are off.',
      action: (
        <Button
          variant="secondary"
          size="sm"
          onClick={backUp}
          aria-busy={backingUp}
          className="relative"
        >
          <span className={backingUp ? 'invisible' : undefined}>
            Back up now
          </span>
          {backingUp && <Spinner label="Backing up" className="absolute" />}
        </Button>
      ),
    })
  }
  if (overview.auto_scan_interval_min === 0) {
    concerns.push({
      key: 'schedule',
      tone: 'info',
      icon: CalendarClockIcon,
      title: 'New files show up only after a scan',
      description:
        'Scan on a schedule to pick up what a downloader adds, without coming here.',
      action: linkButton('Schedule scans', { tab: 'system' }),
    })
  }

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-4">
      <SectionTitle
        id="attention-title"
        title="Needs attention"
        context={concerns.length ? String(concerns.length) : undefined}
      />
      {concerns.length === 0 ? (
        <p className="m-0 flex items-center gap-2.5 border-y border-border/60 py-5 text-[15px] text-foreground-soft">
          <CircleCheckIcon className="size-4 text-success" aria-hidden />
          Nothing right now. Scans, sign-ins, backups and updates look fine.
        </p>
      ) : (
        <ItemGroup
          render={<ul />}
          className="m-0 gap-0 border-y border-border/60 p-0"
        >
          {concerns.map((concern, i) => (
            <ConcernRow key={concern.key} concern={concern} first={i === 0} />
          ))}
        </ItemGroup>
      )}
    </section>
  )
}

function ConcernRow({ concern, first }: { concern: Concern; first: boolean }) {
  const Icon = concern.icon
  return (
    <>
      {!first && <ItemSeparator />}
      <Item
        render={<li />}
        className="flex-wrap px-0 sm:flex-nowrap"
        aria-label={concern.title}
      >
        <ItemMedia>
          <Icon className={cn('size-4', TONE_INK[concern.tone])} />
        </ItemMedia>
        <ItemContent className="min-w-0 basis-[calc(100%-3rem)] sm:basis-auto">
          <ItemTitle className="text-[15px] font-normal">
            {concern.title}
          </ItemTitle>
          <ItemDescription>{concern.description}</ItemDescription>
        </ItemContent>
        <ItemActions className="ml-9 sm:ml-0">{concern.action}</ItemActions>
      </Item>
    </>
  )
}

/* ── Scanning ────────────────────────────────────────────────────────────── */

const TRIGGERS: Record<string, string> = {
  manual: 'started by hand',
  startup: 'when the server started',
  schedule: 'on schedule',
}

function scheduleSentence(overview: Overview): string {
  const minutes = overview.auto_scan_interval_min
  if (minutes > 0) {
    const every =
      minutes % 1440 === 0
        ? minutes === 1440
          ? 'once a day'
          : `every ${minutes / 1440} days`
        : minutes % 60 === 0
          ? minutes === 60
            ? 'every hour'
            : `every ${minutes / 60} hours`
          : `every ${minutes} minutes`
    return overview.scan_on_startup
      ? `Scans ${every}, and when the server starts.`
      : `Scans ${every}.`
  }
  return overview.scan_on_startup
    ? 'Scans when the server starts, and when you start one.'
    : 'Scans only when you start one.'
}

function ScanSummary({ overview }: { overview: Overview }) {
  const { scan } = overview
  const queryClient = useQueryClient()
  const setScanRunning = useAppStore((s) => s.setScanRunning)
  const [starting, setStarting] = useState(false)

  const started = parseServerDate(scan.started_at)
  const finished = parseServerDate(scan.finished_at)
  const took =
    started && finished
      ? formatDuration((finished.getTime() - started.getTime()) / 1000)
      : null
  const pct =
    scan.running && scan.total > 0
      ? Math.round((scan.scanned / scan.total) * 100)
      : null

  const scanNow = async () => {
    setStarting(true)
    try {
      await startScan()
      setScanRunning(true)
      void queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus() })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.adminOverview(),
      })
    } catch (err) {
      toast.error('The scan did not start.', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setStarting(false)
    }
  }

  const counts: [string, number | undefined][] = [
    ['Files', scan.scanned],
    ['New', scan.added],
    ['Changed', scan.updated],
    ['Removed', scan.removed],
    ['Errors', scan.errors],
  ]

  return (
    <section aria-labelledby="scanning-title" className="flex flex-col gap-5">
      <SectionTitle
        id="scanning-title"
        title="Scanning"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={scanNow}
            disabled={scan.running || starting}
          >
            {scan.running ? (
              <Spinner size="sm" label="Scanning" />
            ) : (
              <RefreshCwIcon />
            )}
            {scan.running ? 'Scanning' : 'Scan now'}
          </Button>
        }
      />

      {scan.running ? (
        <Progress
          value={scan.phase === 'cleanup' ? null : pct}
          label={
            scan.phase === 'cleanup'
              ? 'Cleaning up'
              : scan.total > 0
                ? `${scan.scanned.toLocaleString('en-US')} of ${scan.total.toLocaleString('en-US')} files`
                : 'Finding files'
          }
          showValue={pct !== null && scan.phase !== 'cleanup'}
        />
      ) : finished ? (
        <p className="m-0 text-[15px] text-foreground-soft">
          The last scan finished {timeAgo(scan.finished_at)}
          {took && <>, took {took}</>}
          {scan.trigger && TRIGGERS[scan.trigger] && (
            <>, {TRIGGERS[scan.trigger]}</>
          )}
          .
        </p>
      ) : (
        <p className="m-0 text-[15px] text-foreground-soft">
          No scan since the server started.
        </p>
      )}

      {(finished || scan.running) && (
        <dl className="m-0 grid grid-cols-5 gap-x-3 border-y border-border/60 py-4">
          {counts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1.5">
              <dt className="truncate font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                {label}
              </dt>
              <dd
                className={cn(
                  'm-0 font-mono text-[15px] tabular-nums',
                  label === 'Errors' && (value ?? 0) > 0
                    ? 'text-destructive'
                    : 'text-foreground',
                )}
              >
                {(value ?? 0).toLocaleString('en-US')}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="m-0 text-sm text-muted-foreground">
        {scheduleSentence(overview)}{' '}
        <Link
          to="/admin"
          search={{ tab: 'system' }}
          className="rounded-item text-foreground-soft underline underline-offset-4 focus-ring hover:text-foreground"
        >
          Change
        </Link>
      </p>
    </section>
  )
}

/* ── Readers ─────────────────────────────────────────────────────────────── */

function Readers({ readers }: { readers: ReaderActivity[] }) {
  // The most recently active first.
  const sorted = [...readers].sort(
    (a, b) =>
      (parseServerDate(b.last_active_at)?.getTime() ?? 0) -
      (parseServerDate(a.last_active_at)?.getTime() ?? 0),
  )
  return (
    <section aria-labelledby="readers-title" className="flex flex-col gap-5">
      <SectionTitle
        id="readers-title"
        title="Readers"
        context={countLabel(readers.length, 'account')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/admin" search={{ tab: 'users' }} />}
          >
            Manage
          </Button>
        }
      />
      <ItemGroup
        render={<ul />}
        className="m-0 gap-0 border-y border-border/60 p-0"
      >
        {sorted.map((reader, i) => (
          <ReaderRow key={reader.id} reader={reader} first={i === 0} />
        ))}
      </ItemGroup>
    </section>
  )
}

function ReaderRow({
  reader,
  first,
}: {
  reader: ReaderActivity
  first: boolean
}) {
  const me = useAppStore((s) => s.user?.id)
  const last = reader.last_read
  const active = timeAgo(reader.last_active_at)
  const pct =
    last && !last.is_completed && last.page_count > 0
      ? Math.round((last.page / last.page_count) * 100)
      : null

  return (
    <>
      {!first && <ItemSeparator />}
      <Item render={<li />} className="items-start px-0">
        <ItemMedia>
          <Avatar name={reader.name} aria-hidden />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap">
            {reader.name}
            {reader.is_admin && <Tag variant="muted">Administrator</Tag>}
            {reader.id === me && <Tag variant="outline">You</Tag>}
          </ItemTitle>
          <ItemDescription className="font-mono text-xs tabular-nums">
            {active ? `Active ${active}` : 'No activity yet'}
            {' · '}
            {countLabel(reader.devices, 'device')}
          </ItemDescription>
          {last ? (
            <div className="mt-2 flex min-w-0 flex-col gap-1.5">
              <Link
                to="/series/$seriesId"
                params={{ seriesId: last.series_id }}
                className="truncate rounded-item text-sm text-foreground-soft focus-ring hover:text-foreground"
              >
                {last.is_completed ? 'Finished ' : ''}
                {displaySeriesName(last.series_name)} ·{' '}
                {stripTitleZeros(last.book_title)}
                {!last.is_completed &&
                  ` · page ${last.page} of ${last.page_count}`}
              </Link>
              {pct !== null && (
                <Progress
                  value={pct}
                  aria-label={`${pct}% of ${stripTitleZeros(last.book_title)} read`}
                  className="max-w-56"
                />
              )}
            </div>
          ) : (
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              Hasn't opened a book yet.
            </p>
          )}
        </ItemContent>
      </Item>
    </>
  )
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-12">
      <span className="sr-only">Loading the overview…</span>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 border-t border-border/60 pt-4 pb-6"
          >
            <Skeleton shape="text" className="w-20" />
            <Skeleton shape="text" className="h-6 w-16" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} shape="item" className="h-14" />
      ))}
    </div>
  )
}
