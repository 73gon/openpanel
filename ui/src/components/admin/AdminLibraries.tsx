import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Add,
  Delete,
  PencilEdit02Icon,
  Tick02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  createLibrary,
  deleteLibrary,
  updateLibrary,
  startScan,
  fetchScanStatus,
  browseDirectories,
  fetchDrives,
  type Library as LibraryType,
  type ScanStatus,
} from '@/lib/api'
import { toast } from 'sonner'
import type { ConfirmAction } from './types'

interface AdminLibrariesProps {
  libraries: LibraryType[]
  loadData: () => void
  setConfirmAction: (action: ConfirmAction | null) => void
}

export function AdminLibraries({
  libraries,
  loadData,
  setConfirmAction,
}: AdminLibrariesProps) {
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Add library dialog state
  const [newLibName, setNewLibName] = useState('')
  const [newLibPath, setNewLibPath] = useState('')
  const [addLibOpen, setAddLibOpen] = useState(false)
  const [addingLib, setAddingLib] = useState(false)

  // Edit library state
  const [editLibId, setEditLibId] = useState<string | null>(null)
  const [editLibName, setEditLibName] = useState('')
  const [editLibPath, setEditLibPath] = useState('')
  const [savingLib, setSavingLib] = useState(false)

  // Directory browser state
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserPath, setBrowserPath] = useState('')
  const [browserEntries, setBrowserEntries] = useState<
    Array<{ name: string; path: string; is_dir: boolean }>
  >([])
  const [browsingDir, setBrowsingDir] = useState(false)
  const [drives, setDrives] = useState<string[]>([])

  // Poll scan status while scanning
  useEffect(() => {
    if (!scanning) return
    const interval = setInterval(async () => {
      try {
        const status = await fetchScanStatus()
        setScanStatus(status)
        if (!status.running) {
          setScanning(false)
          loadData()
        }
      } catch {}
    }, 1000)
    return () => clearInterval(interval)
  }, [scanning, loadData])

  const handleScan = async () => {
    setScanError(null)
    try {
      await startScan()
      setScanning(true)
      setScanStatus(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed'
      setScanError(message)
    }
  }

  const handleAddLibrary = async () => {
    if (!newLibName || !newLibPath) return
    setAddingLib(true)
    try {
      await createLibrary(newLibName, newLibPath)
      setAddLibOpen(false)
      setNewLibName('')
      setNewLibPath('')
      loadData()
      toast.success('Library created')
    } catch (err) {
      toast.error('Failed to create library', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setAddingLib(false)
    }
  }

  const handleOpenBrowser = async () => {
    setBrowserOpen(true)
    await handleBrowseDirectory('')
    try {
      const result = await fetchDrives()
      setDrives(result.drives)
    } catch {
      setDrives([])
    }
  }

  const handleBrowseDirectory = async (path: string) => {
    setBrowsingDir(true)
    try {
      const result = await browseDirectories(path)
      setBrowserPath(result.current_path)
      setBrowserEntries(result.entries)
    } catch (err) {
      console.error('Failed to browse directories:', err)
    } finally {
      setBrowsingDir(false)
    }
  }

  const handleSelectDirectory = (path: string) => {
    setNewLibPath(path)
    setBrowserOpen(false)
  }

  const handleDeleteLibrary = async (id: string) => {
    const lib = libraries.find((l) => l.id === id)
    setConfirmAction({
      title: 'Delete Library',
      description: `Are you sure you want to delete "${lib?.name || 'this library'}"? This will remove all associated data.`,
      onConfirm: async () => {
        try {
          await deleteLibrary(id)
          loadData()
          toast.success('Library deleted')
        } catch (err) {
          toast.error('Failed to delete library', {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  const handleEditLibrary = (lib: {
    id: string
    name: string
    path: string
  }) => {
    setEditLibId(lib.id)
    setEditLibName(lib.name)
    setEditLibPath(lib.path)
  }

  const handleSaveLibrary = async () => {
    if (!editLibId) return
    setSavingLib(true)
    try {
      await updateLibrary(editLibId, { name: editLibName, path: editLibPath })
      setEditLibId(null)
      loadData()
      toast.success('Library updated')
    } catch (err) {
      toast.error('Failed to update library', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSavingLib(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Scan Libraries</p>
              {scanError && (
                <p className="text-xs text-destructive">{scanError}</p>
              )}
            </div>
            <Button
              onClick={handleScan}
              disabled={scanning}
              size="sm"
              className="gap-2"
            >
              {scanning && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              {scanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          </div>
          {scanning && scanStatus && (
            <div className="space-y-2">
              {scanStatus.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {scanStatus.phase === 'cleanup'
                        ? 'Cleaning up...'
                        : scanStatus.scanned + ' / ' + scanStatus.total}
                    </span>
                    <span className="flex items-center gap-2">
                      {scanStatus.errors > 0 && (
                        <span className="text-destructive">
                          {scanStatus.errors} errors
                        </span>
                      )}
                      {scanStatus.phase === 'scanning' &&
                        Math.round(
                          (scanStatus.scanned / scanStatus.total) * 100,
                        ) + '%'}
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width:
                          scanStatus.total > 0
                            ? Math.round(
                                (scanStatus.scanned / scanStatus.total) * 100,
                              ) + '%'
                            : '0%',
                      }}
                    />
                  </div>
                </div>
              )}
              {scanStatus.current_file && (
                <p className="truncate text-xs text-muted-foreground">
                  {scanStatus.current_file}
                </p>
              )}
              {!scanStatus.current_file && scanStatus.message && (
                <p className="text-xs text-muted-foreground">
                  {scanStatus.message}
                </p>
              )}
            </div>
          )}
          {!scanning && scanStatus && scanStatus.phase === 'complete' && (
            <p className="text-xs text-muted-foreground">
              {scanStatus.message}
            </p>
          )}
        </CardContent>
      </Card>

      {libraries.map((lib) => (
        <Card key={lib.id}>
          <CardContent className="py-4">
            {editLibId === lib.id ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={editLibName}
                    onChange={(e) => setEditLibName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Path</Label>
                  <Input
                    value={editLibPath}
                    onChange={(e) => setEditLibPath(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditLibId(null)}
                    className="gap-1"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveLibrary}
                    disabled={savingLib}
                    className="gap-1"
                  >
                    {savingLib ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={14}
                        className="animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={Tick02Icon} size={14} />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{lib.name}</p>
                  <p className="text-xs text-muted-foreground">{lib.path}</p>
                  <p className="text-xs text-muted-foreground">
                    {lib.series_count} series
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Edit library"
                    onClick={() => handleEditLibrary(lib)}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete library"
                    onClick={() => handleDeleteLibrary(lib.id)}
                  >
                    <HugeiconsIcon icon={Delete} size={14} />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={addLibOpen} onOpenChange={setAddLibOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" className="w-full gap-2">
              <HugeiconsIcon icon={Add} size={14} />
              Add Library
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                placeholder="My Books"
              />
            </div>
            <div className="space-y-2">
              <Label>Path</Label>
              <div className="flex gap-2">
                <Input
                  value={newLibPath}
                  onChange={(e) => setNewLibPath(e.target.value)}
                  placeholder="/path/to/books"
                />
                <Button
                  variant="outline"
                  onClick={handleOpenBrowser}
                  disabled={browsingDir}
                >
                  {browsingDir ? 'Loading...' : 'Browse'}
                </Button>
              </div>
            </div>
            <Button
              onClick={handleAddLibrary}
              className="w-full gap-2"
              disabled={addingLib}
            >
              {addingLib && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              {addingLib ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Directory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {drives.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {drives.map((drive) => (
                  <Button
                    key={drive}
                    variant={
                      browserPath.startsWith(drive) ? 'default' : 'outline'
                    }
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => handleBrowseDirectory(drive)}
                  >
                    {drive}
                  </Button>
                ))}
              </div>
            )}
            <div className="truncate text-sm text-muted-foreground">
              {browserPath}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              {browserEntries.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No folders found
                </div>
              ) : (
                <div className="divide-y">
                  {browserEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => handleBrowseDirectory(entry.path)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <div className="font-medium">{entry.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {entry.path}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={() => handleSelectDirectory(browserPath)}
              className="w-full"
            >
              Select This Folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
