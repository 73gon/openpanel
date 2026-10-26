import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Button,
  Card,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  Heading,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  toast,
  useTheme,
} from '@zonsh/ui'
import {
  ChartPieIcon,
  CheckIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  ListIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ServerCogIcon,
  SunIcon,
} from 'lucide-react'
import { type SectionVisibility, defaultSections } from '@/lib/types'
import {
  changePassword,
  fetchPreferences,
  logout,
  updatePreferences,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { AVAILABLE_LOCALES } from '@/lib/i18n'
import { queryKeys } from '@/lib/query'
import {
  useReaderPrefs,
  type FitMode,
  type ReadDirection,
  type ReadMode,
} from '@/lib/reader-store'
import { cn } from '@/lib/utils'
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'

/** Settings are read one after another: the library's section spacing is for long pages. */
const SECTION = 'py-10 md:py-12 [&_[data-slot=section-label]]:mb-6'

const HOME_SECTIONS: {
  key: keyof SectionVisibility
  title: string
  description: string
}[] = [
  {
    key: 'continueReading',
    title: 'Continue reading',
    description:
      'The book you read last at the top, with the others beside it.',
  },
  {
    key: 'recentlyAdded',
    title: 'Recently added',
    description: 'Series that arrived in your library.',
  },
  {
    key: 'recentlyUpdated',
    title: 'Recently updated',
    description: 'Series with new volumes or chapters.',
  },
]

export function AccountSettings() {
  const user = useAppStore((s) => s.user)!
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const chapterViewMode = useAppStore((s) => s.chapterViewMode)
  const volumeViewMode = useAppStore((s) => s.volumeViewMode)
  const setChapterViewMode = useAppStore((s) => s.setChapterViewMode)
  const setVolumeViewMode = useAppStore((s) => s.setVolumeViewMode)
  const {
    readMode,
    fitMode,
    direction,
    setReadMode,
    setFitMode,
    setDirection,
  } = useReaderPrefs()

  // Section visibility for the home page
  const [sections, setSections] = useState<SectionVisibility>(defaultSections)
  useEffect(() => {
    fetchPreferences()
      .then((prefs) => {
        if (prefs.homeSections && typeof prefs.homeSections === 'object') {
          setSections({
            ...defaultSections,
            ...(prefs.homeSections as Partial<SectionVisibility>),
          })
        }
      })
      .catch(() => {})
  }, [])

  const setSection = (key: keyof SectionVisibility, on: boolean) => {
    const updated = { ...sections, [key]: on }
    setSections(updated)
    updatePreferences({ homeSections: updated })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.preferences() }),
      )
      .catch((e: Error) => {
        setSections(sections)
        toast.error("The home page setting wasn't saved.", {
          description: e.message,
        })
      })
  }

  const signOut = async () => {
    await logout()
    navigate({ to: '/profiles' })
  }

  return (
    <Page>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Account"
          title="Settings"
          actions={
            <Button variant="secondary" onClick={signOut}>
              <LogOutIcon />
              Sign out
            </Button>
          }
        />

        <Section label="Profile" className={cn('mt-10', SECTION)}>
          <div className="flex flex-wrap items-center gap-6">
            <Avatar size="xl" name={user.name} />
            <div className="min-w-0 flex-1">
              <Heading level={4} as="p" className="truncate">
                {user.name}
              </Heading>
              <p className="mt-1 mb-0 font-mono text-[12px] text-muted-foreground">
                {user.is_admin ? 'Administrator' : 'Reader'}
              </p>
            </div>
          </div>
          <ItemGroup className="mt-8">
            <Item variant="outline" render={<Link to="/stats" />}>
              <ItemMedia variant="icon">
                <ChartPieIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Reading statistics</ItemTitle>
                <ItemDescription>
                  Pages, streaks and what you read most.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
            {user.is_admin && (
              <Item
                variant="outline"
                render={<Link to="/admin" search={{ tab: 'libraries' }} />}
                className="md:hidden"
              >
                <ItemMedia variant="icon">
                  <ServerCogIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Server</ItemTitle>
                  <ItemDescription>
                    Libraries, users, updates and logs.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            )}
          </ItemGroup>
        </Section>

        <Section label="Appearance" className={SECTION}>
          <Setting
            title="Theme"
            description="System follows your device's light or dark setting."
            first
          >
            <ToggleGroup
              aria-label="Theme"
              value={[theme]}
              onValueChange={(value) => value[0] && setTheme(value[0])}
            >
              <ToggleGroupItem value="system">
                <MonitorIcon />
                System
              </ToggleGroupItem>
              <ToggleGroupItem value="light">
                <SunIcon />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <MoonIcon />
                Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </Setting>
          {AVAILABLE_LOCALES.length > 1 && (
            <Setting
              title="Language"
              description="The language of OpenPanel itself."
            >
              <Select
                items={AVAILABLE_LOCALES.map((l) => ({
                  value: l.code,
                  label: l.nativeLabel,
                }))}
                value={locale}
                onValueChange={(value) => value && setLocale(value)}
              >
                <SelectTrigger
                  aria-label="Language"
                  className="w-56 max-w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_LOCALES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.nativeLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Setting>
          )}
        </Section>

        <Section label="Home" className={SECTION}>
          {HOME_SECTIONS.map((section, i) => (
            <Setting
              key={section.key}
              title={section.title}
              description={section.description}
              first={i === 0}
            >
              <Switch
                aria-label={section.title}
                checked={sections[section.key]}
                onCheckedChange={(on) => setSection(section.key, on)}
              />
            </Setting>
          ))}
        </Section>

        <Section label="Series pages" className={SECTION}>
          <Setting
            title="Volumes"
            description="How a series lists its volumes."
            first
          >
            <ListOrGrid
              label="Volumes"
              value={volumeViewMode}
              onChange={setVolumeViewMode}
            />
          </Setting>
          <Setting
            title="Chapters"
            description="How a series lists its chapters."
          >
            <ListOrGrid
              label="Chapters"
              value={chapterViewMode}
              onChange={setChapterViewMode}
            />
          </Setting>
        </Section>

        <Section label="Reader" className={SECTION}>
          <Setting
            title="Reading mode"
            description="How pages follow one another."
            first
          >
            <ToggleGroup
              aria-label="Reading mode"
              value={[readMode]}
              onValueChange={(value) => value[0] && setReadMode(value[0])}
            >
              <ToggleGroupItem value="scroll">Scroll</ToggleGroupItem>
              <ToggleGroupItem value="single">Single</ToggleGroupItem>
              <ToggleGroupItem value="double">Two pages</ToggleGroupItem>
            </ToggleGroup>
          </Setting>
          <Setting title="Page size" description="How a page fits the screen.">
            <ToggleGroup
              aria-label="Page size"
              value={[fitMode]}
              onValueChange={(value) => value[0] && setFitMode(value[0])}
            >
              <ToggleGroupItem value="width">Width</ToggleGroupItem>
              <ToggleGroupItem value="height">Height</ToggleGroupItem>
              <ToggleGroupItem value="original">Original</ToggleGroupItem>
            </ToggleGroup>
          </Setting>
          <Setting
            title="Direction"
            description="The default. Each series can choose its own in the reader."
          >
            <ToggleGroup
              aria-label="Direction"
              value={[direction]}
              onValueChange={(value) => value[0] && setDirection(value[0])}
            >
              <ToggleGroupItem value="ltr">Left to right</ToggleGroupItem>
              <ToggleGroupItem value="rtl">Right to left</ToggleGroupItem>
            </ToggleGroup>
          </Setting>
          <ReaderPreview
            readMode={readMode}
            fitMode={fitMode}
            direction={direction}
          />
        </Section>

        <Section label="Password" last className={SECTION}>
          <PasswordForm />
        </Section>
      </div>
    </Page>
  )
}

/** One setting: what it is and does on the left, its control on the right (stacked when narrow). */
function Setting({
  title,
  description,
  first,
  children,
}: {
  title: string
  description: string
  /** The first in its section, right under the label. */
  first?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]',
        !first && 'mt-8',
      )}
    >
      <div className="min-w-0">
        <p className="m-0 text-[15px] text-foreground">{title}</p>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function ListOrGrid({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'list' | 'grid'
  onChange: (value: 'list' | 'grid') => void
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => next[0] && onChange(next[0])}
    >
      <ToggleGroupItem value="list">
        <ListIcon />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="grid">
        <LayoutGridIcon />
        Grid
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** The reader's default layout, drawn small: pages as blank sheets with their numbers. */
function ReaderPreview({
  readMode,
  fitMode,
  direction,
}: {
  readMode: ReadMode
  fitMode: FitMode
  direction: ReadDirection
}) {
  const pageStyle: React.CSSProperties =
    fitMode === 'width'
      ? { width: 84, aspectRatio: '2/3' }
      : fitMode === 'height'
        ? { height: 120, aspectRatio: '2/3' }
        : { width: 64, aspectRatio: '2/3' }

  const sheet = (n: number) => (
    <div
      key={n}
      className="flex shrink-0 items-end justify-center border border-field-edge bg-field-surface pb-2 font-mono text-[11px] text-muted-foreground tabular-nums"
      style={pageStyle}
    >
      {n}
    </div>
  )

  return (
    <Card
      variant="square"
      aria-label="Preview of the reader"
      className="mt-8 gap-0 [--card-padding:0]"
    >
      <div className="flex items-center justify-between border-b border-field-edge px-4 py-2">
        <span className="eyebrow">Preview</span>
        <span className="font-mono text-[11px] text-muted-foreground uppercase">
          {direction === 'rtl' ? 'Right to left' : 'Left to right'}
        </span>
      </div>
      <div className="flex h-44 items-center justify-center overflow-hidden px-4">
        {readMode === 'scroll' ? (
          <div className="flex h-full flex-col items-center gap-1.5 overflow-hidden pt-4">
            {[1, 2, 3].map(sheet)}
          </div>
        ) : readMode === 'double' ? (
          <div
            className={cn(
              'flex gap-1',
              direction === 'rtl' && 'flex-row-reverse',
            )}
          >
            {[1, 2].map(sheet)}
          </div>
        ) : (
          sheet(1)
        )}
      </div>
    </Card>
  )
}

function PasswordForm() {
  const [round, setRound] = useState(0)
  const [pending, setPending] = useState(false)
  const [changed, setChanged] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending) return
    const current = String(values.currentPassword ?? '')
    const next = String(values.newPassword ?? '')
    if (next !== String(values.confirmPassword ?? '')) {
      setErrors({ confirmPassword: "The two new passwords don't match." })
      return
    }
    setPending(true)
    setErrors({})
    setChanged(false)
    try {
      await changePassword(current, next)
      setChanged(true)
      // A fresh form: the fields empty out.
      setRound((r) => r + 1)
    } catch {
      setErrors({ currentPassword: "That isn't your current password." })
    } finally {
      setPending(false)
    }
  }

  return (
    <Form
      key={round}
      errors={errors}
      onFormSubmit={submit}
      className="max-w-md"
    >
      <Field name="currentPassword">
        <FieldLabel>Current password</FieldLabel>
        <Input required type="password" autoComplete="current-password" />
        <FieldError match="valueMissing">
          Enter the password you use now.
        </FieldError>
        {errors.currentPassword && (
          <FieldError match>{errors.currentPassword}</FieldError>
        )}
      </Field>
      <Field name="newPassword">
        <FieldLabel>New password</FieldLabel>
        <Input
          required
          type="password"
          autoComplete="new-password"
          minLength={4}
        />
        <FieldDescription>At least 4 characters.</FieldDescription>
        <FieldError match="valueMissing">Choose a new password.</FieldError>
        <FieldError match="tooShort">Use at least 4 characters.</FieldError>
      </Field>
      <Field name="confirmPassword">
        <FieldLabel>New password, again</FieldLabel>
        <Input required type="password" autoComplete="new-password" />
        <FieldError match="valueMissing">
          Type the new password once more.
        </FieldError>
        {errors.confirmPassword && (
          <FieldError match>{errors.confirmPassword}</FieldError>
        )}
      </Field>
      <FormActions align={changed ? 'between' : 'end'}>
        {changed && (
          <p
            role="status"
            className="m-0 flex items-center gap-1.5 text-sm text-success"
          >
            <CheckIcon className="size-4" aria-hidden />
            Your password is changed.
          </p>
        )}
        <Button type="submit" aria-busy={pending} className="relative">
          <span className={pending ? 'invisible' : undefined}>
            Change password
          </span>
          {pending && (
            <Spinner label="Changing the password" className="absolute" />
          )}
        </Button>
      </FormActions>
    </Form>
  )
}
