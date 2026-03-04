import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Settings01Icon,
  Library,
  UserCircleIcon,
  Delete,
  Add,
  Loading03Icon,
  Download04Icon,
  PencilEdit02Icon,
  Tick02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  fetchAdminSettings,
  updateAdminSettings,
  startScan,
  fetchScanStatus,
  fetchLibraries,
  createLibrary,
  deleteLibrary,
  updateLibrary,
  fetchAdminProfiles,
  createProfile,
  deleteProfile,
  changePassword,
  triggerUpdate,
  fetchVersion,
  checkForUpdates,
  browseDirectories,
  fetchAdminLogs,
  triggerBackup,
  fetchBackups,
  type VersionInfo,
  type UpdateCheckResult,
  type AdminSettings,
  type ScanStatus,
  type Library as LibraryType,
  type AdminProfile,
  type AdminLog,
  type BackupInfo,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const user = useAppStore((s) => s.user)

  // Only admins can access
  if (!user?.is_admin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          You need admin privileges to access this page.
        </p>
      </div>
    )
  }

  return <AdminDashboard />
}

function AdminDashboard() {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [libraries, setLibraries] = useState<LibraryType[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [scanning, setScanning] = useState(false)

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

  // Add profile dialog state
  const [newProfName, setNewProfName] = useState('')
  const [newProfPw, setNewProfPw] = useState('')
  const [addProfOpen, setAddProfOpen] = useState(false)
  const [addingProf, setAddingProf] = useState(false)

  // Change password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  // Update
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updatePhase, setUpdatePhase] = useState<
    'idle' | 'triggered' | 'restarting' | 'success' | 'failed'
  >('idle')
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Logs
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [logLevel, setLogLevel] = useState<string>('')
  const [logsLoading, setLogsLoading] = useState(false)

  // Backups
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [s, libs, profs, ver] = await Promise.all([
        fetchAdminSettings(),
        fetchLibraries(),
        fetchAdminProfiles(),
        fetchVersion().catch(() => null),
      ])
      setSettings(s)
      setLibraries(libs)
      setProfiles(profs)
      if (ver) setVersionInfo(ver)

      // Check for updates in background
      checkForUpdates()
        .then(setUpdateCheck)
        .catch(() => {})
    } catch (err) {
      console.error('Failed to load admin data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    } catch (err) {
      console.error(err)
    } finally {
      setAddingLib(false)
    }
  }

  const handleOpenBrowser = async () => {
    setBrowserOpen(true)
    await handleBrowseDirectory('')
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
    try {
      await deleteLibrary(id)
      loadData()
    } catch {}
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
    } catch {
    } finally {
      setSavingLib(false)
    }
  }

  const handleAddProfile = async () => {
    if (!newProfName || !newProfPw) return
    setAddingProf(true)
    try {
      await createProfile(newProfName, newProfPw)
      setAddProfOpen(false)
      setNewProfName('')
      setNewProfPw('')
      loadData()
    } catch {
    } finally {
      setAddingProf(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    try {
      await deleteProfile(id)
      loadData()
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
    try {
      const result = await checkForUpdates()
      setUpdateCheck(result)
    } catch {
      setUpdateMsg('Failed to check for updates')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    setUpdatePhase('idle')
    const preVersion = versionInfo
    try {
      await triggerUpdate()
      setUpdatePhase('triggered')
      setUpdateMsg('Update triggered...')
      let serverWentDown = false
      let elapsed = 0
      const pollInterval = 3000
      const maxWait = 300000
      if (updatePollRef.current) clearInterval(updatePollRef.current)
      updatePollRef.current = setInterval(async () => {
        elapsed += pollInterval
        if (elapsed > maxWait) {
          clearInterval(updatePollRef.current!)
          updatePollRef.current = null
          setUpdatePhase('failed')
          setUpdateMsg('Update is taking longer than expected.')
          setUpdating(false)
          return
        }
        try {
          const ver = await fetchVersion()
          if (serverWentDown) {
            clearInterval(updatePollRef.current!)
            updatePollRef.current = null
            setVersionInfo(ver)
            if (preVersion && ver.commit !== preVersion.commit) {
              setUpdatePhase('success')
              setUpdateMsg('Updated to ' + ver.version)
            } else {
              setUpdatePhase('success')
              setUpdateMsg('Server restarted (' + ver.version + ')')
            }
            setUpdating(false)
            setUpdateCheck(null)
          } else if (elapsed > 15000) {
            setUpdateMsg('Waiting for host updater...')
          }
        } catch {
          if (!serverWentDown) {
            serverWentDown = true
            setUpdatePhase('restarting')
            setUpdateMsg('Server is restarting...')
          }
        }
      }, pollInterval)
    } catch {
      setUpdateMsg('Failed to trigger update')
      setUpdatePhase('failed')
      setUpdating(false)
    }
  }

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

  const loadLogs = async () => {
    setLogsLoading(true)
    try {
      const data = await fetchAdminLogs(logLevel || undefined)
      setLogs(data)
    } catch {
    } finally {
      setLogsLoading(false)
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
    } catch {
      setBackupMsg('Backup failed')
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mb-6 text-2xl font-bold">Admin</h1>

        <Tabs defaultValue="libraries">
          <TabsList className="mb-6 w-full">
            <TabsTrigger value="libraries" className="flex-1">
              <HugeiconsIcon icon={Library} size={14} className="mr-1.5" />
              Libraries
            </TabsTrigger>
            <TabsTrigger value="profiles" className="flex-1">
              <HugeiconsIcon
                icon={UserCircleIcon}
                size={14}
                className="mr-1.5"
              />
              Profiles
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">
              <HugeiconsIcon
                icon={Settings01Icon}
                size={14}
                className="mr-1.5"
              />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Libraries Tab */}
          <TabsContent value="libraries" className="space-y-4">
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
                                      (scanStatus.scanned / scanStatus.total) *
                                        100,
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
                        <p className="text-xs text-muted-foreground">
                          {lib.path}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lib.series_count} series
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditLibrary(lib)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
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
                  <div className="text-sm text-muted-foreground truncate">
                    {browserPath}
                  </div>
                  <div className="border rounded-lg overflow-y-auto max-h-72">
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
                            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors"
                          >
                            <div className="font-medium">{entry.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
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
          </TabsContent>

          {/* Profiles Tab */}
          <TabsContent value="profiles" className="space-y-4">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteProfile(profile.id)}
                  >
                    <HugeiconsIcon icon={Delete} size={14} />
                  </Button>
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
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {settings && (
              <>
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
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
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
                      <div className="flex items-center gap-2">
                        {updatePhase === 'idle' && !updating && (
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
                          className="gap-2"
                        >
                          {updating ? (
                            <HugeiconsIcon
                              icon={Loading03Icon}
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <HugeiconsIcon icon={Download04Icon} size={14} />
                          )}
                          {updating
                            ? updatePhase === 'restarting'
                              ? 'Restarting...'
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

                {/* Logs */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Admin Logs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadLogs}
                        disabled={logsLoading}
                      >
                        {logsLoading ? 'Loading...' : 'Load Logs'}
                      </Button>
                    </div>
                    {logs.length > 0 && (
                      <div className="max-h-64 overflow-y-auto rounded border border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-2 py-1 text-left">Time</th>
                              <th className="px-2 py-1 text-left">Level</th>
                              <th className="px-2 py-1 text-left">Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((log) => (
                              <tr
                                key={log.id}
                                className="border-b last:border-0"
                              >
                                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                                  {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="px-2 py-1">
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
                                <td className="px-2 py-1">{log.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
