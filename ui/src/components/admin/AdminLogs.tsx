import { useState, useEffect, useCallback, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { fetchAdminLogs, type AdminLog } from '@/lib/api'

export function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [logLevel, setLogLevel] = useState<string>('')
  const [logCategory, setLogCategory] = useState<string>('')
  const [messageSearch, setMessageSearch] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [sortField, setSortField] = useState<
    'created_at' | 'level' | 'category' | 'message'
  >('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const data = await fetchAdminLogs(
        logLevel || undefined,
        logCategory || undefined,
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

  const handleSort = (field: typeof sortField) => {
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

  const SortHeader = ({
    field,
    label,
  }: {
    field: typeof sortField
    label: string
  }) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left font-medium transition-colors hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
        )}
      </span>
    </th>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Admin Logs</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
              <select
                value={logCategory}
                onChange={(e) => setLogCategory(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">All categories</option>
                <option value="auth">Auth</option>
                <option value="download">Downloads</option>
                <option value="admin">Admin</option>
                <option value="scanner">Scanner</option>
              </select>
              <Input
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                placeholder="Search messages..."
                className="h-8 w-40 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={loadLogs}
                disabled={logsLoading}
                className="gap-1.5"
              >
                {logsLoading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={12}
                    className="animate-spin"
                  />
                )}
                {logsLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAndSorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {logsLoading ? 'Loading logs...' : 'No logs found'}
            </p>
          ) : (
            <div className="max-h-[calc(100vh-20rem)] overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-muted/90 backdrop-blur-sm">
                    <SortHeader field="created_at" label="Time" />
                    <SortHeader field="level" label="Level" />
                    <SortHeader field="category" label="Category" />
                    <SortHeader field="message" label="Message" />
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            log.level === 'error'
                              ? 'destructive'
                              : log.level === 'warn'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {log.level}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.category}
                      </td>
                      <td className="px-3 py-2">
                        <span>{log.message}</span>
                        {log.details && (
                          <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                            {log.details}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
