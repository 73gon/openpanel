import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ErrorNotice, RouteErrorComponent } from '@/components/route-error'
import { useState } from 'react'
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
import { useAppStore } from '@/lib/store'
import {
  AdminLibraries,
  AdminLogs,
  AdminOverview,
  AdminProfiles,
  AdminSettingsTab,
  AdminSetupWizard,
  type ConfirmAction,
} from '@/components/admin'
import { useLibraries, useVersion } from '@/components/admin/queries'
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'

const TABS = ['overview', 'libraries', 'users', 'system', 'logs'] as const
export type AdminTab = (typeof TABS)[number]

/** Older links named two of the tabs differently. */
const RENAMED: Record<string, AdminTab> = {
  profiles: 'users',
  settings: 'system',
}

export interface AdminSearch {
  tab?: AdminTab
  /** The logs, filtered: the overview links straight to errors or sign-ins. */
  level?: string
  category?: string
}

export const Route = createFileRoute('/admin')({
  component: AdminPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    const raw = typeof search.tab === 'string' ? search.tab : ''
    const tab = (TABS as readonly string[]).includes(raw)
      ? (raw as AdminTab)
      : RENAMED[raw]
    return {
      ...(tab && tab !== 'overview' ? { tab } : {}),
      ...(typeof search.level === 'string' && search.level
        ? { level: search.level }
        : {}),
      ...(typeof search.category === 'string' && search.category
        ? { category: search.category }
        : {}),
    }
  },
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
  const search = Route.useSearch()
  const tab = search.tab ?? 'overview'
  const navigate = useNavigate({ from: '/admin' })
  const libraries = useLibraries()
  const { data: version } = useVersion()

  // Confirmation dialog state for destructive operations
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  if (libraries.error && !libraries.data) {
    return (
      <Page>
        <ErrorNotice
          title="The server settings didn't load"
          error={libraries.error}
          onRetry={() => libraries.refetch()}
          className="mx-auto max-w-2xl"
        />
      </Page>
    )
  }

  // Show setup wizard when no libraries exist (first-run experience)
  if (libraries.data && libraries.data.length === 0) {
    return <AdminSetupWizard onComplete={() => libraries.refetch()} />
  }

  const short = version?.commit.slice(0, 7) ?? ''

  return (
    <Page className="flex flex-col gap-8 sm:gap-10">
      <PageHeader
        eyebrow="Server"
        title="Administration"
        facts={
          version
            ? version.version.includes(short)
              ? version.version
              : `${version.version} · ${short}`
            : undefined
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({
            search: v === 'overview' ? {} : { tab: v as AdminTab },
            replace: true,
            resetScroll: false,
          })
        }
      >
        {/* On a phone the five tabs scroll sideways rather than squeeze. */}
        <div className="scrollbar-hide -mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
          <TabsList>
            <TabsTab value="overview">Overview</TabsTab>
            <TabsTab value="libraries">Libraries</TabsTab>
            <TabsTab value="users">Users</TabsTab>
            <TabsTab value="system">System</TabsTab>
            <TabsTab value="logs">Logs</TabsTab>
          </TabsList>
        </div>

        {!libraries.data ? (
          <div aria-busy="true" className="flex flex-col gap-3 pt-6">
            <span className="sr-only">Loading the server settings…</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="item" className="h-14" />
            ))}
          </div>
        ) : (
          <>
            <TabsPanel value="overview" className="pt-4 sm:pt-6">
              <AdminOverview />
            </TabsPanel>

            <TabsPanel value="libraries" className="pt-4 sm:pt-6">
              <AdminLibraries
                libraries={libraries.data}
                setConfirmAction={setConfirmAction}
              />
            </TabsPanel>

            <TabsPanel value="users" className="pt-4 sm:pt-6">
              <AdminProfiles setConfirmAction={setConfirmAction} />
            </TabsPanel>

            <TabsPanel value="system" className="pt-0">
              <AdminSettingsTab setConfirmAction={setConfirmAction} />
            </TabsPanel>

            <TabsPanel value="logs" className="pt-4 sm:pt-6">
              <AdminLogs
                key={`${search.level ?? ''}-${search.category ?? ''}`}
                initialLevel={search.level}
                initialCategory={search.category}
              />
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
              render={
                <Button
                  variant={
                    confirmAction?.destructive === false
                      ? 'primary'
                      : 'destructive'
                  }
                />
              }
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
