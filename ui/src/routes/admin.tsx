import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Settings01Icon,
  Library,
  UserCircleIcon,
  Audit01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  fetchAdminSettings,
  fetchLibraries,
  fetchAdminProfiles,
  fetchVersion,
  checkForUpdates,
  type VersionInfo,
  type UpdateCheckResult,
  type AdminSettings,
  type Library as LibraryType,
  type AdminProfile,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import {
  AdminLibraries,
  AdminProfiles,
  AdminSettingsTab,
  AdminLogs,
  AdminSetupWizard,
  type ConfirmAction,
} from '@/components/admin'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || 'libraries',
  }),
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
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [libraries, setLibraries] = useState<LibraryType[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Confirmation dialog state for destructive operations
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

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
      setLoaded(true)

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

  // Show setup wizard when no libraries exist (first-run experience)
  if (loaded && libraries.length === 0) {
    return <AdminSetupWizard onComplete={loadData} />
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mb-6 text-2xl font-bold">Admin</h1>

        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ to: '/admin', search: { tab: v }, replace: true })
          }
        >
          <TabsList className="mb-6 w-full overflow-x-auto">
            <TabsTrigger
              value="libraries"
              className="select-none whitespace-nowrap"
            >
              <HugeiconsIcon icon={Library} size={14} className="mr-1.5" />
              Libraries
            </TabsTrigger>
            <TabsTrigger
              value="profiles"
              className="select-none whitespace-nowrap"
            >
              <HugeiconsIcon
                icon={UserCircleIcon}
                size={14}
                className="mr-1.5"
              />
              Profiles
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="select-none whitespace-nowrap"
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={14}
                className="mr-1.5"
              />
              Settings
            </TabsTrigger>
            <TabsTrigger value="logs" className="select-none whitespace-nowrap">
              <HugeiconsIcon icon={Audit01Icon} size={14} className="mr-1.5" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="libraries">
            <AdminLibraries
              libraries={libraries}
              loadData={loadData}
              setConfirmAction={setConfirmAction}
            />
          </TabsContent>

          <TabsContent value="profiles">
            <AdminProfiles
              profiles={profiles}
              loadData={loadData}
              setConfirmAction={setConfirmAction}
            />
          </TabsContent>

          <TabsContent value="settings">
            <AdminSettingsTab
              settings={settings}
              setSettings={setSettings}
              versionInfo={versionInfo}
              setVersionInfo={setVersionInfo}
              updateCheck={updateCheck}
              setUpdateCheck={setUpdateCheck}
            />
          </TabsContent>

          <TabsContent value="logs">
            <AdminLogs />
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction?.description}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                confirmAction?.onConfirm()
                setConfirmAction(null)
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
