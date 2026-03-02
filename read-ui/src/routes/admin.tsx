import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ShieldKeyIcon,
  Settings01Icon,
  Library,
  UserCircleIcon,
  Logout01Icon,
  Delete,
  Add,
  Loading03Icon,
  Download04Icon,
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
  fetchAdminStatus,
  adminSetup,
  adminUnlock,
  fetchAdminSettings,
  updateAdminSettings,
  startScan,
  fetchScanStatus,
  fetchLibraries,
  createLibrary,
  deleteLibrary,
  fetchProfiles,
  createProfile,
  deleteProfile,
  changeAdminPassword,
  triggerUpdate,
  browseDirectories,
  type AdminStatus,
  type AdminSettings,
  type ScanStatus,
  type Library as LibraryType,
  type Profile,
} from '@/lib/api'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAdminStatus()
      .then((s) => {
        setStatus(s)
        const token = sessionStorage.getItem('admin_token')
        if (token && s.password_set) {
          // Validate token by trying to fetch settings
          fetchAdminSettings()
            .then(() => setAuthenticated(true))
            .catch(() => {
              sessionStorage.removeItem('admin_token')
            })
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleAuth = async () => {
    if (!status) return
    setError('')
    setSubmitting(true)
    try {
      if (!status.password_set) {
        await adminSetup(password)
        setStatus({ ...status, password_set: true })
      }
      const result = await adminUnlock(password)
      sessionStorage.setItem('admin_token', result.admin_token)
      setAuthenticated(true)
    } catch (err) {
      setError(
        !status.password_set ? 'Failed to set password' : 'Incorrect password',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token')
    setAuthenticated(false)
    setPassword('')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-full items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <HugeiconsIcon
                  icon={ShieldKeyIcon}
                  size={24}
                  className="text-muted-foreground"
                />
              </div>
              <CardTitle>
                {status?.password_set ? 'Admin Login' : 'Set Admin Password'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleAuth()
                }}
                className="space-y-4"
              >
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  autoFocus
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting}
                >
                  {submitting && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={14}
                      className="animate-spin"
                    />
                  )}
                  {status?.password_set ? 'Unlock' : 'Set Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return <AdminDashboard onLogout={handleLogout} />
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [libraries, setLibraries] = useState<LibraryType[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [scanning, setScanning] = useState(false)

  // Add library dialog state
  const [newLibName, setNewLibName] = useState('')
  const [newLibPath, setNewLibPath] = useState('')
  const [addLibOpen, setAddLibOpen] = useState(false)
  const [addingLib, setAddingLib] = useState(false)

  // Directory browser state
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserPath, setBrowserPath] = useState('')
  const [browserEntries, setBrowserEntries] = useState<Array<{ name: string; path: string; is_dir: boolean }>>([])
  const [browsingDir, setBrowsingDir] = useState(false)

  // Add profile dialog state
  const [newProfName, setNewProfName] = useState('')
  const [newProfPin, setNewProfPin] = useState('')
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

  const loadData = useCallback(async () => {
    try {
      const [s, libs, profs] = await Promise.all([
        fetchAdminSettings(),
        fetchLibraries(),
        fetchProfiles(),
      ])
      setSettings(s)
      setLibraries(libs)
      setProfiles(profs)
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
    }, 2000)
    return () => clearInterval(interval)
  }, [scanning, loadData])

  const handleScan = async () => {
    try {
      await startScan()
      setScanning(true)
      setScanStatus(null)
    } catch {}
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

  const handleAddProfile = async () => {
    if (!newProfName) return
    setAddingProf(true)
    try {
      await createProfile(newProfName, newProfPin || undefined)
      setAddProfOpen(false)
      setNewProfName('')
      setNewProfPin('')
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
      await changeAdminPassword(currentPw, newPw)
      setPwMsg('Password changed')
      setCurrentPw('')
      setNewPw('')
    } catch {
      setPwMsg('Failed to change password')
    } finally {
      setChangingPw(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    setUpdateMsg('')
    try {
      const result = await triggerUpdate()
      setUpdateMsg(result.message)
    } catch {
      setUpdateMsg('Failed to trigger update')
    } finally {
      setUpdating(false)
    }
  }

  const handleSettingChange = async (
    key: keyof AdminSettings,
    value: boolean | number,
  ) => {
    if (!settings) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    try {
      await updateAdminSettings(updated)
    } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="gap-2"
          >
            <HugeiconsIcon icon={Logout01Icon} size={14} />
            Lock
          </Button>
        </div>

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
            {/* Scan Button */}
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">Scan Libraries</p>
                  {scanStatus && (
                    <p className="text-xs text-muted-foreground">
                      {scanStatus.message}
                    </p>
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
              </CardContent>
            </Card>

            {/* Library List */}
            {libraries.map((lib) => (
              <Card key={lib.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{lib.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lib.series_count} series
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteLibrary(lib.id)}
                  >
                    <HugeiconsIcon icon={Delete} size={14} />
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Add Library */}
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
                        placeholder="C:\Users\user\Books"
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

            {/* Directory Browser */}
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
                            onClick={() => {
                              if (entry.name === '..') {
                                handleBrowseDirectory(entry.path)
                              } else if (entry.is_dir) {
                                handleBrowseDirectory(entry.path)
                              }
                            }}
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
                      {profile.has_pin && (
                        <Badge variant="secondary" className="text-xs">
                          PIN
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
                    <Label>Name</Label>
                    <Input
                      value={newProfName}
                      onChange={(e) => setNewProfName(e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>PIN (optional)</Label>
                    <Input
                      type="password"
                      value={newProfPin}
                      onChange={(e) => setNewProfPin(e.target.value)}
                      placeholder="4-digit PIN"
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
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">Update Panel</p>
                      <p className="text-xs text-muted-foreground">
                        Pull latest code and restart the server
                      </p>
                      {updateMsg && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {updateMsg}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handleUpdate}
                      disabled={updating}
                      size="sm"
                      variant="outline"
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
                      {updating ? 'Updating...' : 'Update'}
                    </Button>
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
