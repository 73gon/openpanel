import { Fragment, useState } from 'react'
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
  Spinner,
  Tag,
  toast,
} from '@zonsh/ui'
import { KeyRoundIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'
import {
  createProfile,
  deleteProfile,
  resetUserPassword,
  type AdminProfile,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { countLabel } from '@/lib/utils'
import { SectionTitle } from '@/components/page-header'
import type { ConfirmAction } from './types'

interface AdminProfilesProps {
  profiles: AdminProfile[]
  loadData: () => void
  setConfirmAction: (action: ConfirmAction | null) => void
}

const joined = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

export function AdminProfiles({
  profiles,
  loadData,
  setConfirmAction,
}: AdminProfilesProps) {
  const me = useAppStore((s) => s.user)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<AdminProfile | null>(null)

  const handleDeleteProfile = (profile: AdminProfile) => {
    setConfirmAction({
      title: `Delete ${profile.name}?`,
      description: `${profile.name} can no longer sign in, and their reading progress, bookmarks and collections are deleted.`,
      confirmLabel: 'Delete user',
      onConfirm: async () => {
        try {
          await deleteProfile(profile.id)
          loadData()
          toast.success(`${profile.name} is deleted.`)
        } catch (err) {
          toast.error(`${profile.name} wasn't deleted.`, {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  return (
    <section aria-labelledby="users-title" className="flex flex-col gap-4">
      <SectionTitle
        id="users-title"
        title="Users"
        context={countLabel(profiles.length, 'user')}
        actions={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <UserPlusIcon />
            Add user
          </Button>
        }
      />
      <ItemGroup
        render={<ul />}
        className="m-0 gap-0 border-y border-border/60 p-0"
      >
        {profiles.map((profile, i) => (
          <Fragment key={profile.id}>
            {i > 0 && <ItemSeparator />}
            <Item render={<li />} className="px-0">
              <ItemMedia>
                <Avatar name={profile.name} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  {profile.name}
                  {profile.is_admin && <Tag variant="muted">Administrator</Tag>}
                  {profile.id === me?.id && <Tag variant="outline">You</Tag>}
                </ItemTitle>
                <ItemDescription className="font-mono text-xs">
                  Since {joined.format(new Date(profile.created_at))}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetting(profile)}
                >
                  <KeyRoundIcon />
                  <span className="max-sm:hidden">Reset password</span>
                </Button>
                {profile.is_admin ? (
                  // Administrators can't be deleted here; the space keeps the actions in line.
                  <span aria-hidden className="w-[30px] shrink-0" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${profile.name}`}
                    onClick={() => handleDeleteProfile(profile)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>

      <AddUserDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={loadData}
      />
      <ResetPasswordDialog
        profile={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
      />
    </section>
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
}: {
  profile: AdminProfile | null
  onOpenChange: (open: boolean) => void
}) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending || !profile) return
    setPending(true)
    setErrors({})
    try {
      await resetUserPassword(profile.id, String(values.password ?? ''))
      onOpenChange(false)
      toast.success(`${profile.name}'s password is reset.`, {
        description: 'Let them know the new one.',
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
            The old password stops working at once.
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
