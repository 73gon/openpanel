import { Fragment, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
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
  MenuTrigger,
  Progress,
  Spinner,
  Tag,
  toast,
} from '@zonsh/ui'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  EllipsisIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  createLibrary,
  deleteLibrary,
  updateLibrary,
  startScan,
  startRematch,
  needsReview,
  type Library as LibraryType,
  type ScanStatus,
  type SeriesMatch,
} from '@/lib/api'
import { invalidateAfterScan, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'
import { cn, countLabel, formatDuration, parseServerDate, timeAgo } from '@/lib/utils'
import { Cover } from '@/components/cover'
import { SectionTitle } from '@/components/page-header'
import { AnilistDialog } from '@/components/series/anilist-dialog'
import { DirectoryBrowser } from './DirectoryBrowser'
import { useMetadataReview, useScanStatus } from './queries'
import type { ConfirmAction } from './types'

interface AdminLibrariesProps {
  libraries: LibraryType[]
  setConfirmAction: (action: ConfirmAction | null) => void
}

export function AdminLibraries({
  libraries,
  setConfirmAction,
}: AdminLibrariesProps) {
  const queryClient = useQueryClient()

  // The library being added (null) or edited, while the dialog is open.
  const [editing, setEditing] = useState<LibraryType | null | undefined>(
    undefined,
  )

  const refreshLibraries = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.libraries() })

  const handleDeleteLibrary = (lib: LibraryType) => {
    setConfirmAction({
      title: `Delete the library “${lib.name}”?`,
      description:
        'Its series, reading progress and bookmarks are removed from OpenPanel. The files in the folder are not touched.',
      confirmLabel: 'Delete library',
      onConfirm: async () => {
        try {
          await deleteLibrary(lib.id)
          invalidateAfterScan()
          toast.success(`“${lib.name}” is deleted.`)
        } catch (err) {
          toast.error("The library wasn't deleted.", {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-14">
      <ScanSection />

      <section
        aria-labelledby="libraries-title"
        className="flex flex-col gap-4"
      >
        <SectionTitle
          id="libraries-title"
          title="Libraries"
          context={countLabel(libraries.length, 'library', 'libraries')}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(null)}
            >
              <PlusIcon />
              Add library
            </Button>
          }
        />
        {libraries.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle render={<h3 />}>No libraries</EmptyTitle>
            <EmptyDescription>
              Add a folder of CBZ files. Each subfolder becomes a series.
            </EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup
            render={<ul />}
            className="m-0 gap-0 border-y border-border/60 p-0"
          >
            {libraries.map((lib, i) => (
              <Fragment key={lib.id}>
                {i > 0 && <ItemSeparator />}
                <Item render={<li />} className="px-0">
                  <ItemMedia variant="icon">
                    <FolderIcon />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>{lib.name}</ItemTitle>
                    <ItemDescription className="truncate font-mono text-xs">
                      {lib.path}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="mr-1 font-mono text-xs text-muted-foreground tabular-nums max-sm:hidden">
                      {countLabel(lib.series_count, 'series', 'series')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${lib.name}`}
                      onClick={() => setEditing(lib)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${lib.name}`}
                      onClick={() => handleDeleteLibrary(lib)}
                    >
                      <Trash2Icon />
                    </Button>
                  </ItemActions>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        )}
      </section>

      <MetadataSection />

      <LibraryDialog
        library={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={refreshLibraries}
      />
    </div>
  )
}

/* ── Scanning ────────────────────────────────────────────────────────────── */

const TRIGGERS: Record<string, string> = {
  manual: 'started by hand',
  startup: 'when the server started',
  schedule: 'on schedule',
}

/** The scan: start one, follow it, and see what the last one did and couldn't read. */
function ScanSection() {
  const { data: scan } = useScanStatus()
  const setScanRunning = useAppStore((s) => s.setScanRunning)
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const handleScan = async () => {
    setScanError(null)
    setStarting(true)
    try {
      await startScan()
      setScanRunning(true)
      await queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus() })
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'The scan did not start.',
      )
    } finally {
      setStarting(false)
    }
  }

  const running = !!scan?.running
  const pct =
    scan && running && scan.total > 0
      ? Math.round((scan.scanned / scan.total) * 100)
      : null

  return (
    <section aria-labelledby="scan-title" className="flex flex-col gap-4">
      <SectionTitle
        id="scan-title"
        title="Scan"
        actions={
          <Button
            size="sm"
            onClick={handleScan}
            disabled={running || starting}
            aria-busy={running || starting}
          >
            {running || starting ? (
              <Spinner size="sm" label="Scanning" />
            ) : (
              <RefreshCwIcon />
            )}
            {running ? 'Scanning' : 'Scan libraries'}
          </Button>
        }
      />
      <p className="m-0 max-w-xl text-sm text-muted-foreground">
        Looks through every library for new and changed files, and removes what
        is gone. Reading progress follows a file that is replaced or moved.
      </p>

      {running && scan && (
        <div className="flex max-w-xl flex-col gap-2">
          <Progress
            value={scan.phase === 'cleanup' ? null : pct}
            label={
              scan.phase === 'cleanup'
                ? 'Cleaning up'
                : scan.total > 0
                  ? `Scanning ${scan.scanned.toLocaleString('en-US')} of ${scan.total.toLocaleString('en-US')} files`
                  : 'Finding files'
            }
            showValue={pct !== null && scan.phase !== 'cleanup'}
          />
          {(scan.current_file || scan.message) && (
            <p className="m-0 truncate font-mono text-xs text-muted-foreground">
              {scan.current_file || scan.message}
            </p>
          )}
        </div>
      )}

      {!running && scan?.phase === 'complete' && <LastScan scan={scan} />}

      {scanError && (
        <Alert variant="destructive" className="max-w-xl">
          <CircleAlertIcon />
          <AlertTitle>The scan did not start</AlertTitle>
          <AlertDescription>{scanError}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}

/** What the last scan found, and the files it couldn't read. */
function LastScan({ scan }: { scan: ScanStatus }) {
  const started = parseServerDate(scan.started_at)
  const finished = parseServerDate(scan.finished_at)
  const took =
    started && finished
      ? formatDuration((finished.getTime() - started.getTime()) / 1000)
      : null
  const failures = scan.failures ?? []
  const changes = [
    scan.added ? `${countLabel(scan.added, 'new book')}` : null,
    scan.updated ? `${countLabel(scan.updated, 'changed book')}` : null,
    scan.removed ? `${countLabel(scan.removed, 'removed book')}` : null,
  ].filter(Boolean)

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Alert variant={scan.errors ? 'warning' : 'success'}>
        {scan.errors ? <CircleAlertIcon /> : <CircleCheckIcon />}
        <AlertTitle>
          {scan.errors
            ? `${countLabel(scan.errors, 'file')} couldn't be read`
            : 'The last scan went fine'}
        </AlertTitle>
        <AlertDescription>
          {[
            finished ? `Finished ${timeAgo(scan.finished_at)}` : null,
            took ? `took ${took}` : null,
            scan.trigger ? TRIGGERS[scan.trigger] : null,
          ]
            .filter(Boolean)
            .join(', ')}
          {finished ? '. ' : ''}
          {countLabel(scan.scanned, 'file')} looked at
          {changes.length ? `: ${changes.join(', ')}.` : ', nothing changed.'}
        </AlertDescription>
      </Alert>

      {failures.length > 0 && (
        <Collapsible defaultOpen={failures.length <= 5}>
          <CollapsibleTrigger>The files that failed</CollapsibleTrigger>
          <CollapsiblePanel>
            <ul className="m-0 mt-2 flex list-none flex-col border-y border-border/60 p-0">
              {failures.map((failure, i) => (
                <li
                  key={`${failure.path}-${i}`}
                  className={cn(
                    'flex flex-col gap-1 py-3',
                    i > 0 && 'border-t border-border/60',
                  )}
                >
                  <span className="font-mono text-xs break-all text-foreground">
                    {failure.path}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {failure.error}
                  </span>
                </li>
              ))}
            </ul>
            {scan.errors > failures.length && (
              <p className="m-0 mt-2 text-sm text-muted-foreground">
                And {countLabel(scan.errors - failures.length, 'more file')}:
                the logs list every one.
              </p>
            )}
          </CollapsiblePanel>
        </Collapsible>
      )}
    </div>
  )
}

/* ── AniList matches ─────────────────────────────────────────────────────── */

/**
 * The series whose AniList match is missing or looks like another work, with a way to fix one
 * by hand or have them all matched again.
 */
function MetadataSection() {
  const queryClient = useQueryClient()
  const { data, isPending } = useMetadataReview()
  const [fixing, setFixing] = useState<SeriesMatch | null>(null)
  const [starting, setStarting] = useState(false)

  const series = data?.series ?? []
  const toReview = series.filter(needsReview)
  const rematch = data?.rematch
  useScrollToHash('metadata', !!data)

  // When a run of matching ends, the library shows the new covers and titles.
  const running = !!rematch?.running
  const [wasRunning, setWasRunning] = useState(running)
  useEffect(() => {
    if (wasRunning && !running) {
      invalidateAfterScan()
      if (rematch) {
        toast.success('The series are matched again.', {
          description: `${countLabel(rematch.changed, 'series', 'series')} changed.`,
        })
      }
    }
    setWasRunning(running)
  }, [running, wasRunning, rematch])

  const matchAgain = async (scope: 'review' | 'all') => {
    setStarting(true)
    try {
      await startRematch(scope)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.metadataReview(),
      })
    } catch (err) {
      toast.error("Matching didn't start.", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setStarting(false)
    }
  }

  const automatic = series.filter(
    (s) => s.anilist_id_source === null || s.anilist_id_source === 'auto',
  ).length

  return (
    <section
      id="metadata"
      aria-labelledby="metadata-title"
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <SectionTitle
        id="metadata-title"
        title="AniList matches"
        context={
          data
            ? toReview.length
              ? `${toReview.length} to review`
              : `${countLabel(series.length, 'series', 'series')} matched`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {toReview.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => matchAgain('review')}
                disabled={running || starting}
              >
                {running ? (
                  <Spinner size="sm" label="Matching" />
                ) : (
                  <RefreshCwIcon />
                )}
                Match these again
              </Button>
            )}
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="More matching actions"
                  />
                }
              >
                <EllipsisIcon />
              </MenuTrigger>
              <MenuContent align="end" className="min-w-64">
                <MenuItem
                  onClick={() => matchAgain('all')}
                  disabled={running || starting || automatic === 0}
                >
                  <RefreshCwIcon />
                  Match all {countLabel(automatic, 'automatic match', 'automatic matches')} again
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        }
      />
      <p className="m-0 max-w-xl text-sm text-muted-foreground">
        Covers, titles, genres and descriptions come from AniList, matched by
        folder name. Matches set by hand, or by an AniList id in the folder
        name, are kept.
      </p>

      {rematch?.running && (
        <Progress
          value={
            rematch.total > 0
              ? Math.round((rematch.done / rematch.total) * 100)
              : null
          }
          label={`Asking AniList: ${rematch.done} of ${rematch.total} series, about ${formatDuration(((rematch.total - rematch.done) * 1.5))} left`}
          showValue
          className="max-w-xl"
        />
      )}

      {isPending ? null : toReview.length === 0 ? (
        <p className="m-0 flex items-center gap-2.5 border-y border-border/60 py-5 text-[15px] text-foreground-soft">
          <CircleCheckIcon className="size-4 text-success" aria-hidden />
          Every series has a match that fits its folder name.
        </p>
      ) : (
        <ItemGroup
          render={<ul />}
          className="m-0 gap-0 border-y border-border/60 p-0"
        >
          {toReview.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <ItemSeparator />}
              <MatchRow series={s} onFix={() => setFixing(s)} />
            </Fragment>
          ))}
        </ItemGroup>
      )}

      {fixing && (
        <AnilistDialog
          open
          onOpenChange={(open) => !open && setFixing(null)}
          seriesId={fixing.id}
          metadata={fixing}
          searchName={fixing.name}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.metadataReview(),
            })
            invalidateAfterScan()
          }}
        />
      )}
    </section>
  )
}

function MatchRow({
  series,
  onFix,
}: {
  series: SeriesMatch
  onFix: () => void
}) {
  const matched = series.title_english ?? series.title_romaji
  return (
    <Item render={<li />} className="px-0">
      <Cover src={series.cover_url} className="w-10 shrink-0" />
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <Link
            to="/series/$seriesId"
            params={{ seriesId: series.id }}
            className="truncate rounded-item focus-ring hover:underline"
          >
            {series.name}
          </Link>
          {series.anilist_id === null ? (
            <Tag variant="warning">No match</Tag>
          ) : (
            <Tag variant="info">Doubtful</Tag>
          )}
        </ItemTitle>
        <ItemDescription className="truncate">
          {matched
            ? `Matched to “${matched}”${series.start_year ? ` (${series.start_year})` : ''}`
            : `${countLabel(series.book_count, 'book')} in ${series.library_name}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="secondary" size="sm" onClick={onFix}>
          Fix
        </Button>
      </ItemActions>
    </Item>
  )
}

/* ── Adding and editing a library ────────────────────────────────────────── */

/** Add a library (library null) or change one: its name and the folder it reads from. */
function LibraryDialog({
  library,
  onOpenChange,
  onSaved,
}: {
  library: LibraryType | null | undefined
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const open = library !== undefined
  const adding = library === null
  const [path, setPath] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setPath(library?.path ?? '')
    setBrowsing(false)
    setErrors({})
  }, [open, library])

  const submit = async (values: Record<string, unknown>) => {
    if (pending) return
    const name = String(values.name ?? '').trim()
    const folder = path.trim()
    if (!folder) {
      setErrors({ path: 'Choose the folder the library reads from.' })
      return
    }
    setPending(true)
    setErrors({})
    try {
      if (adding) await createLibrary(name, folder)
      else await updateLibrary(library!.id, { name, path: folder })
      onSaved()
      onOpenChange(false)
      toast.success(
        adding
          ? `“${name}” is added. Scan to bring in its series.`
          : `“${name}” is saved.`,
      )
    } catch (err) {
      setErrors({
        path: err instanceof Error ? err.message : "The library wasn't saved.",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {adding ? 'Add a library' : `Edit ${library?.name ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            A folder of CBZ files on the server. Each subfolder becomes a
            series; files directly in it are books of their own.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onFormSubmit={submit} className="contents">
          <DialogBody className="flex flex-col gap-5">
            <Field name="name">
              <FieldLabel>Name</FieldLabel>
              <Input
                required
                defaultValue={library?.name ?? ''}
                placeholder="Manga"
                autoComplete="off"
              />
              <FieldError match="valueMissing">
                Give the library a name.
              </FieldError>
            </Field>
            <Field name="path" invalid={!!errors.path}>
              <FieldLabel>Folder</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  value={path}
                  onValueChange={(value) => setPath(value)}
                  placeholder="/srv/manga"
                  spellCheck={false}
                  autoComplete="off"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton onClick={() => setBrowsing((b) => !b)}>
                    Browse
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                The path as the server sees it.
              </FieldDescription>
              {errors.path && <FieldError match>{errors.path}</FieldError>}
            </Field>
            {browsing && (
              <DirectoryBrowser
                initialPath={path}
                onChoose={(chosen) => {
                  setPath(chosen)
                  setBrowsing(false)
                }}
                onCancel={() => setBrowsing(false)}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" aria-busy={pending} className="relative">
              <span className={pending ? 'invisible' : undefined}>
                {adding ? 'Add library' : 'Save changes'}
              </span>
              {pending && (
                <Spinner label="Saving the library" className="absolute" />
              )}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
