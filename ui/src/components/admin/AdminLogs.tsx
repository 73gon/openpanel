import { useEffect, useState } from 'react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Toggle,
} from '@zonsh/ui'
import { RadioIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { fetchAdminLogs, type AdminLog } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { cn, describeDevice, formatServerDate } from '@/lib/utils'

const LEVELS = [
  { value: 'all', label: 'Every level' },
  { value: 'warn,error', label: 'Problems' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
]

// The categories the server writes, most useful first
const CATEGORIES = [
  { value: 'all', label: 'Every category' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'users', label: 'Users' },
  { value: 'password', label: 'Passwords' },
  { value: 'scan', label: 'Library scans' },
  { value: 'anilist', label: 'AniList metadata' },
  { value: 'backup', label: 'Backups' },
  { value: 'update', label: 'Updates' },
  { value: 'settings', label: 'Settings' },
  { value: 'download', label: 'Downloads' },
  { value: 'server', label: 'Server starts' },
  { value: 'request', label: 'Slow or failed requests' },
]

const PAGE = 100

const logTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Who did it and from where, when the entry came from a request. */
function actor(log: AdminLog): string | null {
  const parts = [
    log.profile_name,
    log.ip_address,
    log.user_agent ? describeDevice(log.user_agent) : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function LevelTag({ level }: { level: string }) {
  return (
    <Tag
      variant={
        level === 'error'
          ? 'destructive'
          : level === 'warn'
            ? 'warning'
            : 'muted'
      }
    >
      {level}
    </Tag>
  )
}

export function AdminLogs({
  initialLevel,
  initialCategory,
}: {
  initialLevel?: string
  initialCategory?: string
}) {
  const [level, setLevel] = useState(
    LEVELS.some((l) => l.value === initialLevel) ? initialLevel! : 'all',
  )
  const [category, setCategory] = useState(
    CATEGORIES.some((c) => c.value === initialCategory)
      ? initialCategory!
      : 'all',
  )
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [live, setLive] = useState(false)

  // Ask the server once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filters = {
    level: level === 'all' ? undefined : level,
    category: category === 'all' ? undefined : category,
    q: q || undefined,
  }

  const {
    data,
    error,
    isPending,
    isFetching,
    isPlaceholderData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.adminLogs(filters),
    queryFn: ({ pageParam }) =>
      fetchAdminLogs({ ...filters, before: pageParam, limit: PAGE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.length < PAGE ? undefined : last[last.length - 1]?.id,
    placeholderData: keepPreviousData,
    // Live: the newest entries as they come.
    refetchInterval: live ? 5_000 : false,
  })

  const logs = data?.pages.flat() ?? []
  const filtered = level !== 'all' || category !== 'all' || !!q

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={LEVELS}
          value={level}
          onValueChange={(v) => v && setLevel(v as string)}
        >
          <SelectTrigger size="sm" aria-label="Level" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={CATEGORIES}
          value={category}
          onValueChange={(v) => v && setCategory(v as string)}
        >
          <SelectTrigger size="sm" aria-label="Category" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup size="sm" className="w-full sm:w-64">
          <InputGroupInput
            value={search}
            onValueChange={(value) => setSearch(value)}
            placeholder="Search messages, users, addresses"
            aria-label="Search the log"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Toggle
            size="sm"
            pressed={live}
            onPressedChange={setLive}
            aria-label="Follow new entries"
          >
            <RadioIcon className={cn(live && 'text-success')} />
            Live
          </Toggle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            aria-busy={isFetching && !isFetchingNextPage}
            className="relative"
          >
            <span
              className={cn(
                'flex items-center gap-1.5',
                isFetching && !isFetchingNextPage && !live && 'invisible',
              )}
            >
              <RefreshCwIcon />
              Refresh
            </span>
            {isFetching && !isFetchingNextPage && !live && (
              <Spinner label="Loading the logs" className="absolute" />
            )}
          </Button>
        </div>
      </div>

      {error && !data ? (
        <Empty className="py-10">
          <EmptyTitle render={<h3 />}>The logs didn't load</EmptyTitle>
          <EmptyDescription>
            {error instanceof Error ? error.message : 'Try again.'}
          </EmptyDescription>
        </Empty>
      ) : logs.length === 0 ? (
        <Empty className="py-10">
          <EmptyTitle render={<h3 />}>
            {isPending ? 'Loading the logs…' : 'No log entries'}
          </EmptyTitle>
          {!isPending && (
            <EmptyDescription>
              {filtered
                ? 'Nothing matches these filters.'
                : 'Sign-ins, scans and administration show up here as they happen.'}
            </EmptyDescription>
          )}
        </Empty>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-4 transition-opacity duration-(--duration)',
            isPlaceholderData && 'opacity-60',
          )}
        >
          {/* Wide screens: a table. */}
          <Table
            dense
            aria-label="Server log"
            className="max-md:hidden"
            containerProps={{ className: 'max-md:hidden' }}
          >
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-0 whitespace-nowrap">Time</TableHead>
                <TableHead className="w-0">Level</TableHead>
                <TableHead className="w-0">Category</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const who = actor(log)
                return (
                  <TableRow key={log.id}>
                    <TableCell className="align-top font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatServerDate(logTime, log.created_at) ??
                        log.created_at}
                    </TableCell>
                    <TableCell className="align-top">
                      <LevelTag level={log.level} />
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs text-muted-foreground">
                      {log.category}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-sm">{log.message}</span>
                      {who && (
                        <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                          {who}
                        </span>
                      )}
                      {log.details && (
                        <pre className="mt-1.5 mb-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                          {log.details}
                        </pre>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Phones: one entry under another. */}
          <ol
            aria-label="Server log"
            className="m-0 flex list-none flex-col border-y border-border/60 p-0 md:hidden"
          >
            {logs.map((log, i) => {
              const who = actor(log)
              return (
                <li
                  key={log.id}
                  className={cn(
                    'flex flex-col gap-1.5 py-3.5',
                    i > 0 && 'border-t border-border/60',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <LevelTag level={log.level} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {log.category}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatServerDate(logTime, log.created_at) ??
                        log.created_at}
                    </span>
                  </div>
                  <p className="m-0 text-sm text-foreground">{log.message}</p>
                  {who && (
                    <p className="m-0 font-mono text-[11px] break-all text-muted-foreground">
                      {who}
                    </p>
                  )}
                  {log.details && (
                    <pre className="m-0 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
                      {log.details}
                    </pre>
                  )}
                </li>
              )
            })}
          </ol>

          {hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="self-center"
            >
              {isFetchingNextPage && <Spinner size="sm" label="Loading" />}
              Older entries
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
