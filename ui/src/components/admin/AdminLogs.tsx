import { useState, useEffect, useCallback, useMemo } from 'react'
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
} from '@zonsh/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  RefreshCwIcon,
  SearchIcon,
} from 'lucide-react'
import { fetchAdminLogs, type AdminLog } from '@/lib/api'
import { cn } from '@/lib/utils'

type SortField = 'created_at' | 'level' | 'category' | 'message'

const LEVELS = [
  { value: 'all', label: 'Every level' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' },
]

const CATEGORIES = [
  { value: 'all', label: 'Every category' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'download', label: 'Downloads' },
  { value: 'admin', label: 'Administration' },
  { value: 'scanner', label: 'Scanner' },
]

const logTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [logLevel, setLogLevel] = useState('all')
  const [logCategory, setLogCategory] = useState('all')
  const [messageSearch, setMessageSearch] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const data = await fetchAdminLogs(
        logLevel === 'all' ? undefined : logLevel,
        logCategory === 'all' ? undefined : logCategory,
      )
      setLogs(data)
    } catch {
    } finally {
      setLogsLoading(false)
    }
  }, [logLevel, logCategory])

  // Auto-load on mount and when filters change
  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'created_at' ? 'desc' : 'asc')
    }
  }

  const filteredAndSorted = useMemo(() => {
    let result = logs
    if (messageSearch) {
      const q = messageSearch.toLowerCase()
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          (l.details && l.details.toLowerCase().includes(q)),
      )
    }
    return [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortField) {
        case 'created_at':
          return (
            dir *
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime())
          )
        case 'level':
          return dir * a.level.localeCompare(b.level)
        case 'category':
          return dir * a.category.localeCompare(b.category)
        case 'message':
          return dir * a.message.localeCompare(b.message)
        default:
          return 0
      }
    })
  }, [logs, messageSearch, sortField, sortDir])

  const SortHead = ({
    field,
    label,
    className,
  }: {
    field: SortField
    label: string
    className?: string
  }) => {
    const active = sortField === field
    return (
      <TableHead
        aria-sort={
          active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
        }
        className={className}
      >
        <button
          type="button"
          onClick={() => handleSort(field)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-item uppercase focus-ring transition-colors duration-(--duration) hover:text-foreground',
            active && 'text-foreground',
          )}
        >
          {label}
          {active &&
            (sortDir === 'asc' ? (
              <ArrowUpIcon className="size-3" aria-hidden />
            ) : (
              <ArrowDownIcon className="size-3" aria-hidden />
            ))}
        </button>
      </TableHead>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={LEVELS}
          value={logLevel}
          onValueChange={(v) => v && setLogLevel(v)}
        >
          <SelectTrigger size="sm" aria-label="Level" className="w-40">
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
          value={logCategory}
          onValueChange={(v) => v && setLogCategory(v)}
        >
          <SelectTrigger size="sm" aria-label="Category" className="w-44">
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
            value={messageSearch}
            onValueChange={(value) => setMessageSearch(value)}
            placeholder="Search messages"
            aria-label="Search messages"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadLogs}
          aria-busy={logsLoading}
          className="relative sm:ml-auto"
        >
          <span
            className={cn(
              'flex items-center gap-1.5',
              logsLoading && 'invisible',
            )}
          >
            <RefreshCwIcon />
            Refresh
          </span>
          {logsLoading && (
            <Spinner label="Loading the logs" className="absolute" />
          )}
        </Button>
      </div>

      {filteredAndSorted.length === 0 ? (
        <Empty className="py-10">
          <EmptyTitle render={<h3 />}>
            {logsLoading ? 'Loading the logs…' : 'No log entries'}
          </EmptyTitle>
          {!logsLoading && (
            <EmptyDescription>
              {messageSearch || logLevel !== 'all' || logCategory !== 'all'
                ? 'Nothing matches these filters.'
                : 'Sign-ins, scans and administration show up here as they happen.'}
            </EmptyDescription>
          )}
        </Empty>
      ) : (
        <Table
          dense
          aria-label="Server log"
          containerProps={{ className: 'max-h-[calc(100dvh-22rem)] min-h-64' }}
        >
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <SortHead
                field="created_at"
                label="Time"
                className="w-0 whitespace-nowrap"
              />
              <SortHead field="level" label="Level" className="w-0" />
              <SortHead field="category" label="Category" className="w-0" />
              <SortHead field="message" label="Message" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="align-top font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {logTime.format(new Date(log.created_at))}
                </TableCell>
                <TableCell className="align-top">
                  <Tag
                    variant={
                      log.level === 'error'
                        ? 'destructive'
                        : log.level === 'warn'
                          ? 'warning'
                          : 'muted'
                    }
                  >
                    {log.level}
                  </Tag>
                </TableCell>
                <TableCell className="align-top font-mono text-xs text-muted-foreground">
                  {log.category}
                </TableCell>
                <TableCell className="align-top">
                  <span className="text-sm">{log.message}</span>
                  {log.details && (
                    <pre className="mt-1.5 mb-0 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {log.details}
                    </pre>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
