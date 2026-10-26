import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@zonsh/ui'
import { ArrowUpIcon, FolderIcon } from 'lucide-react'
import { browseDirectories, fetchDrives, type DirectoryEntry } from '@/lib/api'

/**
 * The server's folders, to pick a library from: the current path in mono, its subfolders as
 * rows, and "Up" from the server's own ".." entry (so it is right on every operating system).
 */
export function DirectoryBrowser({
  initialPath = '',
  onChoose,
  onCancel,
}: {
  initialPath?: string
  onChoose: (path: string) => void
  onCancel: () => void
}) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [drives, setDrives] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const browse = async (to: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await browseDirectories(to)
      setPath(result.current_path)
      setEntries(result.entries.filter((e) => e.is_dir))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "This folder can't be opened.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    browse(initialPath)
    fetchDrives()
      .then((r) => setDrives(r.drives))
      .catch(() => setDrives([]))
    // Only on opening: later moves go through browse().
  }, [])

  const parent = entries.find((e) => e.name === '..')
  const folders = entries.filter((e) => e.name !== '..')
  const drive = drives.find((d) => path.startsWith(d))

  return (
    <Card variant="square" className="gap-0 [--card-padding:0]">
      <div className="flex items-center gap-2 border-b border-field-edge p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Up one folder"
          disabled={!parent || loading}
          onClick={() => parent && browse(parent.path)}
        >
          <ArrowUpIcon />
        </Button>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-soft">
          {path || '/'}
        </code>
        {drives.length > 1 && (
          <Select
            items={drives.map((d) => ({ value: d, label: d }))}
            value={drive ?? null}
            onValueChange={(value) => value && browse(value)}
          >
            <SelectTrigger size="sm" aria-label="Drive" className="w-24">
              <SelectValue placeholder="Drive" />
            </SelectTrigger>
            <SelectContent>
              {drives.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ScrollArea className="h-56" contentClassName="p-1.5">
        {loading ? (
          <div className="flex h-52 items-center justify-center text-muted-foreground">
            <Spinner label="Opening the folder" />
          </div>
        ) : error ? (
          <p className="m-0 p-4 text-sm text-destructive">{error}</p>
        ) : folders.length === 0 ? (
          <p className="m-0 p-4 text-sm text-muted-foreground">
            No folders in here. Choose this one, or go up.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {folders.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => browse(entry.path)}
                  className="flex min-h-(--control-h) w-full cursor-pointer items-center gap-2.5 rounded-item px-2.5 text-left text-sm material-row focus-ring"
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="flex items-center justify-end gap-2 border-t border-field-edge p-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!path || loading}
          onClick={() => onChoose(path)}
        >
          Choose this folder
        </Button>
      </div>
    </Card>
  )
}
