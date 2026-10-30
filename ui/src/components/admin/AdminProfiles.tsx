import { Fragment, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  Spinner,
  Tag,
  toast,
} from '@zonsh/ui'
import {
  EllipsisIcon,
  KeyRoundIcon,
  LaptopIcon,
  LogOutIcon,
  ShieldIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import {
  createProfile,
  deleteProfile,
  fetchUserSessions,
  resetUserPassword,
  revokeSession,
  revokeUserSessions,
  setUserRole,
  type AdminProfile,
  type SessionInfo,
} from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { countLabel, formatServerDate, timeAgo } from '@/lib/utils'
import { SectionTitle } from '@/components/page-header'
import { SessionRow } from '@/components/session-row'
import { ErrorNotice } from '@/components/route-error'
import { useProfiles } from './queries'
import type { ConfirmAction } from './types'

interface AdminProfilesProps {
  setConfirmAction: (action: ConfirmAction | null) => void
}

const joined = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

export function AdminProfiles({ setConfirmAction }: AdminProfilesProps) {
  const me = useAppStore((s) => s.user)
  const queryClient = useQueryClient()
  const { data: profiles, error, refetch } = useProfiles()
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<AdminProfile | null>(null)
  const [devicesOf, setDevicesOf] = useState<AdminProfile | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminProfiles() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview() })
    // Every user's device list, and your own on the account page.
    void queryClient.invalidateQueries({ queryKey: ['userSessions'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mySessions() })
  }

  const handleDeleteProfile = (profile: AdminProfile) => {
    setConfirmAction({
      title: `Delete ${profile.name}?`,
      description: `${profile.name} can no longer sign in, and their reading progress, bookmarks and collections are deleted.`,
      confirmLabel: 'Delete user',
      onConfirm: async () => {
        try {
          await deleteProfile(profile.id)
          refresh()
          toast.success(`${profile.name} is deleted.`)
        } catch (err) {
          toast.error(`${profile.name} wasn't deleted.`, {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  const handleRole = (profile: AdminProfile) => {
    const promote = !profile.is_admin
    setConfirmAction({
      title: promote
        ? `Make ${profile.name} an administrator?`
        : `Make ${profile.name} a reader?`,
      description: promote
        ? 'Administrators manage libraries, users, updates and backups, and can read the logs.'
        : `${profile.name} keeps their reading, but can no longer change the server.`,
      confirmLabel: promote ? 'Make administrator' : 'Make reader',
      destructive: false,
      onConfirm: async () => {
        try {
          await setUserRole(profile.id, promote)
          refresh()
          toast.success(
            promote
              ? `${profile.name} is an administrator.`
              : `${profile.name} is a reader.`,
          )
        } catch (err) {
          toast.error(`${profile.name}'s role wasn't changed.`, {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  const handleSignOut = (profile: AdminProfile) => {
    const self = profile.id === me?.id
    setConfirmAction({
      title: self
        ? 'Sign out your other devices?'
        : `Sign ${profile.name} out everywhere?`,
      description: self
        ? 'Every device but this one has to sign in again.'
        : `${profile.name} has to sign in again on every device. Their reading is kept.`,
      confirmLabel: self ? 'Sign out other devices' : 'Sign out everywhere',
      destructive: false,
      onConfirm: async () => {
        try {
          const { revoked } = await revokeUserSessions(profile.id)
          refresh()
          toast.success(
            `${countLabel(revoked, 'device')} signed out.`,
          )
        } catch (err) {
          toast.error('Nothing was signed out.', {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  if (error && !profiles) {
    return (
      <ErrorNotice
        title="The users didn't load"
        error={error}
        onRetry={() => refetch()}
        className="max-w-2xl"
      />
    )
  }

  return (
    <section aria-labelledby="users-title" className="flex flex-col gap-4">
      <SectionTitle
        id="users-title"
        title="Users"
        context={profiles ? countLabel(profiles.length, 'user') : undefined}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <UserPlusIcon />
            Add user
          </Button>
        }
      />
      <p className="m-0 max-w-xl text-sm text-muted-foreground">
        Each user has their own progress, bookmarks and collections. Only
        administrators add accounts: nobody can sign up on their own.
      </p>
      {!profiles ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} shape="item" className="h-16" />
          ))}
        </div>
      ) : (
        <ItemGroup
          render={<ul />}
          className="m-0 gap-0 border-y border-border/60 p-0"
        >
          {profiles.map((profile, i) => {
            const self = profile.id === me?.id
            const active = timeAgo(profile.last_active_at)
            const since = formatServerDate(joined, profile.created_at)
            return (
              <Fragment key={profile.id}>
                {i > 0 && <ItemSeparator />}
                <Item render={<li />} className="px-0">
                  <ItemMedia>
                    <Avatar name={profile.name} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="flex-wrap">
                      {profile.name}
                      {profile.is_admin && (
                        <Tag variant="muted">Administrator</Tag>
                      )}
                      {self && <Tag variant="outline">You</Tag>}
                    </ItemTitle>
                    <ItemDescription className="font-mono text-xs tabular-nums">
                      {[
                        active ? `Active ${active}` : 'No activity yet',
                        countLabel(profile.devices ?? 0, 'device'),
                        `${(profile.books_completed ?? 0).toLocaleString('en-US')} read`,
                        since ? `since ${since}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${profile.name}`}
                          />
                        }
                      >
                        <EllipsisIcon />
                      </MenuTrigger>
                      <MenuContent align="end" className="min-w-60">
                        <MenuItem onClick={() => setDevicesOf(profile)}>
                          <LaptopIcon />
                          Devices…
                        </MenuItem>
                        <MenuItem
                          onClick={() => handleSignOut(profile)}
                          disabled={!profile.devices || (self && profile.devices <= 1)}
                        >
                          <LogOutIcon />
                          {self ? 'Sign out other devices' : 'Sign out everywhere'}
                        </MenuItem>
                        {!self && (
                          <MenuItem onClick={() => setResetting(profile)}>
                            <KeyRoundIcon />
                            Reset password…
                          </MenuItem>
                        )}
                        {!self && (
                          <>
                            <MenuSeparator />
                            <MenuItem onClick={() => handleRole(profile)}>
                              {profile.is_admin ? (
                                <ShieldOffIcon />
                              ) : (
                                <ShieldIcon />
                              )}
                              {profile.is_admin
                                ? 'Make reader'
                                : 'Make administrator'}
                            </MenuItem>
                            <MenuItem
                              variant="destructive"
                              onClick={() => handleDeleteProfile(profile)}
                              disabled={profile.is_admin}
                            >
                              <Trash2Icon />
                              Delete user
                            </MenuItem>
                          </>
                        )}
                      </MenuContent>
                    </Menu>
                  </ItemActions>
                </Item>
              </Fragment>
            )
          })}
        </ItemGroup>
      )}

      <AddUserDialog open={adding} onOpenChange={setAdding} onAdded={refresh} />
      <ResetPasswordDialog
        profile={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onReset={refresh}
      />
      <DevicesDialog
        profile={devicesOf}
        onOpenChange={(open) => !open && setDevicesOf(null)}
        onChanged={refresh}
      />
    </section>
  )
}

/** Where a user is signed in, with a way to sign one device out. */
function DevicesDialog({
  profile,
  onOpenChange,
  onChanged,
}: {
  profile: AdminProfile | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)
  const { data: sessions, error } = useQuery({
    queryKey: queryKeys.userSessions(profile?.id ?? ''),
    queryFn: () => fetchUserSessions(profile!.id),
    enabled: !!profile,
  })

  const signOut = async (session: SessionInfo) => {
    setPending(session.id)
    try {
      await revokeSession(session.id)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.userSessions(profile!.id),
      })
      onChanged()
    } catch (err) {
      toast.error('The device is still signed in.', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile?.name}'s devices</DialogTitle>
          <DialogDescription>
            Where {profile?.name} is signed in. A device signed out has to sign
            in again; nothing else is lost.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <p className="m-0 text-sm text-destructive">
              The devices didn't load.
            </p>
          ) : !sessions ? (
            <Spinner label="Loading the devices" />
          ) : sessions.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              Not signed in anywhere.
            </p>
          ) : (
            <ItemGroup
              render={<ul />}
              className="m-0 gap-0 border-y border-border/60 p-0"
            >
              {sessions.map((session, i) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  first={i === 0}
                  busy={pending === session.id}
                  onSignOut={() => signOut(session)}
                />
              ))}
            </ItemGroup>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean
  pendingLabel: string
  children: React.ReactNode
}) {
  return (
    <Button type="submit" aria-busy={pending} className="relative">
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending && <Spinner label={pendingLabel} className="absolute" />}
    </Button>
  )
}

function AddUserDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending) return
    const name = String(values.username ?? '').trim()
    setPending(true)
    setErrors({})
    try {
      await createProfile(name, String(values.password ?? ''))
      onAdded()
      onOpenChange(false)
      toast.success(`${name} can sign in now.`)
    } catch (err) {
      setErrors({
        username:
          `${name} wasn't added. ${err instanceof Error ? err.message : ''}`.trim(),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            They get their own progress, bookmarks and collections.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onFormSubmit={submit} className="contents">
          <DialogBody className="flex flex-col gap-5">
            <Field name="username">
              <FieldLabel>Username</FieldLabel>
              <Input
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <FieldError match="valueMissing">Choose a username.</FieldError>
              {errors.username && (
                <FieldError match>{errors.username}</FieldError>
              )}
            </Field>
            <Field name="password">
              <FieldLabel>Password</FieldLabel>
              <Input
                required
                type="password"
                autoComplete="new-password"
                minLength={4}
              />
              <FieldDescription>
                At least 4 characters. They can change it later.
              </FieldDescription>
              <FieldError match="valueMissing">Choose a password.</FieldError>
              <FieldError match="tooShort">
                Use at least 4 characters.
              </FieldError>
            </Field>
          </DialogBody>
          <DialogFooter>
            <SubmitButton pending={pending} pendingLabel="Adding the user">
              Add user
            </SubmitButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  profile,
  onOpenChange,
  onReset,
}: {
  profile: AdminProfile | null
  onOpenChange: (open: boolean) => void
  onReset: () => void
}) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending || !profile) return
    setPending(true)
    setErrors({})
    try {
      await resetUserPassword(profile.id, String(values.password ?? ''))
      onReset()
      onOpenChange(false)
      toast.success(`${profile.name}'s password is reset.`, {
        description:
          'They are signed out everywhere. Let them know the new one.',
      })
    } catch (err) {
      setErrors({
        password:
          `The password wasn't reset. ${err instanceof Error ? err.message : ''}`.trim(),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Reset {profile?.name}'s password</DialogTitle>
          <DialogDescription>
            The old password stops working at once, and {profile?.name} is
            signed out on every device.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onFormSubmit={submit} className="contents">
          <DialogBody>
            <Field name="password">
              <FieldLabel>New password</FieldLabel>
              <Input
                required
                type="password"
                autoComplete="new-password"
                minLength={4}
              />
              <FieldDescription>At least 4 characters.</FieldDescription>
              <FieldError match="valueMissing">
                Choose the new password.
              </FieldError>
              <FieldError match="tooShort">
                Use at least 4 characters.
              </FieldError>
              {errors.password && (
                <FieldError match>{errors.password}</FieldError>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <SubmitButton
              pending={pending}
              pendingLabel="Resetting the password"
            >
              Reset password
            </SubmitButton>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
