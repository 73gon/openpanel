import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ErrorNotice, RouteErrorComponent } from '@/components/route-error'
import { useState, useEffect, useCallback } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from '@zonsh/ui'
import { ShieldIcon } from 'lucide-react'
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
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'

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
      <Page>
        <Empty>
          <EmptyMedia>
            <ShieldIcon />
          </EmptyMedia>
          <EmptyTitle render={<h1 />}>For administrators</EmptyTitle>
          <EmptyDescription>
            Libraries, users and updates are looked after by whoever runs this
            server.
          </EmptyDescription>
        </Empty>
      </Page>
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
  const [loadError, setLoadError] = useState<unknown>(null)

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
      setLoadError(null)

      // Check for updates in background
      checkForUpdates()
        .then(setUpdateCheck)
        .catch(() => {})
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setLoadError(err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loadError && !loaded) {
    return (
      <Page>
        <ErrorNotice
          title="The server settings didn't load"
          error={loadError}
          onRetry={loadData}
          className="mx-auto max-w-2xl"
        />
      </Page>
    )
  }

  // Show setup wizard when no libraries exist (first-run experience)
  if (loaded && libraries.length === 0) {
    return <AdminSetupWizard onComplete={loadData} />
  }

  return (
    <Page className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Server"
        title="Administration"
        facts={
          versionInfo
            ? `OpenPanel v${versionInfo.version} · ${versionInfo.channel} · ${versionInfo.commit.slice(0, 7)}`
            : undefined
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({
            to: '/admin',
            search: { tab: v as string },
            replace: true,
            resetScroll: false,
          })
        }
      >
        <TabsList className="max-w-md">
          <TabsTab value="libraries">Libraries</TabsTab>
          <TabsTab value="profiles">Users</TabsTab>
          <TabsTab value="settings">System</TabsTab>
          <TabsTab value="logs">Logs</TabsTab>
        </TabsList>

        {!loaded ? (
          <div aria-busy="true" className="flex flex-col gap-3 pt-10">
            <span className="sr-only">Loading the server settings…</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="item" className="h-14" />
            ))}
          </div>
        ) : (
          <>
            <TabsPanel value="libraries" className="pt-10">
              <AdminLibraries
                libraries={libraries}
                loadData={loadData}
                setConfirmAction={setConfirmAction}
              />
            </TabsPanel>

            <TabsPanel value="profiles" className="pt-10">
              <AdminProfiles
                profiles={profiles}
                loadData={loadData}
                setConfirmAction={setConfirmAction}
              />
            </TabsPanel>

            <TabsPanel value="settings" className="pt-6">
              <AdminSettingsTab
                settings={settings}
                setSettings={setSettings}
                versionInfo={versionInfo}
                setVersionInfo={setVersionInfo}
                updateCheck={updateCheck}
                setUpdateCheck={setUpdateCheck}
              />
            </TabsPanel>

            <TabsPanel value="logs" className="pt-10">
              <AdminLogs />
            </TabsPanel>
          </>
        )}
      </Tabs>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="secondary" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => confirmAction?.onConfirm()}
            >
              {confirmAction?.confirmLabel}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
