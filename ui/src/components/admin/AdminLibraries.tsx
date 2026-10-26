import { Fragment, useState, useEffect } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
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
  Progress,
  Spinner,
  toast,
} from '@zonsh/ui'
import {
  CircleAlertIcon,
  CircleCheckIcon,
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
  fetchScanStatus,
  type Library as LibraryType,
  type ScanStatus,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { countLabel } from '@/lib/utils'
import { SectionTitle } from '@/components/page-header'
import { DirectoryBrowser } from './DirectoryBrowser'
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
  const setScanRunning = useAppStore((s) => s.setScanRunning)

  // The library being added (null) or edited, while the dialog is open.
  const [editing, setEditing] = useState<LibraryType | null | undefined>(
    undefined,
  )

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
      setScanRunning(true)
      setScanStatus(null)
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'The scan did not start.',
      )
    }
  }

  const handleDeleteLibrary = (lib: LibraryType) => {
    setConfirmAction({
      title: `Delete the library “${lib.name}”?`,
      description:
        'Its series, reading progress and bookmarks are removed from OpenPanel. The files in the folder are not touched.',
      confirmLabel: 'Delete library',
      onConfirm: async () => {
        try {
          await deleteLibrary(lib.id)
          loadData()
          toast.success(`“${lib.name}” is deleted.`)
        } catch (err) {
          toast.error("The library wasn't deleted.", {
            description: err instanceof Error ? err.message : undefined,
          })
        }
      },
    })
  }

  const pct =
    scanStatus && scanStatus.total > 0
      ? Math.round((scanStatus.scanned / scanStatus.total) * 100)
      : null

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="scan-title" className="flex flex-col gap-4">
        <SectionTitle
          id="scan-title"
          title="Scan"
          actions={
            <Button
              onClick={handleScan}
              aria-busy={scanning}
              className="relative"
            >
              <span
                className={scanning ? 'invisible' : 'flex items-center gap-2'}
              >
                <RefreshCwIcon />
                Scan libraries
              </span>
              {scanning && <Spinner label="Scanning" className="absolute" />}
            </Button>
          }
        />
        <p className="m-0 max-w-xl text-sm text-muted-foreground">
          Looks through every library for new and changed CBZ files, and removes
          what is gone.
        </p>

        {scanning && (
          <div className="flex max-w-xl flex-col gap-2">
            <Progress
              value={scanStatus?.phase === 'cleanup' ? null : pct}
              label={
                scanStatus?.phase === 'cleanup'
                  ? 'Cleaning up'
                  : scanStatus && scanStatus.total > 0
                    ? `Scanning ${scanStatus.scanned.toLocaleString('en-US')} of ${scanStatus.total.toLocaleString('en-US')} files`
                    : 'Finding files'
              }
              showValue={pct !== null && scanStatus?.phase !== 'cleanup'}
            />
            {(scanStatus?.current_file || scanStatus?.message) && (
              <p className="m-0 truncate font-mono text-xs text-muted-foreground">
                {scanStatus.current_file || scanStatus.message}
              </p>
            )}
            {!!scanStatus?.errors && (
              <p className="m-0 font-mono text-xs text-destructive">
                {countLabel(scanStatus.errors, 'file')} could not be read
              </p>
            )}
          </div>
        )}

        {!scanning && scanStatus?.phase === 'complete' && (
          <Alert
            variant={scanStatus.errors ? 'warning' : 'success'}
            className="max-w-xl"
          >
            {scanStatus.errors ? <CircleAlertIcon /> : <CircleCheckIcon />}
            <AlertTitle>
              {scanStatus.errors
                ? 'The scan finished with errors'
                : 'The scan is done'}
            </AlertTitle>
            {scanStatus.message && (
              <AlertDescription>{scanStatus.message}</AlertDescription>
            )}
          </Alert>
        )}

        {scanError && (
          <Alert variant="destructive" className="max-w-xl">
            <CircleAlertIcon />
            <AlertTitle>The scan did not start</AlertTitle>
            <AlertDescription>{scanError}</AlertDescription>
          </Alert>
        )}
      </section>

      <section
        aria-labelledby="libraries-title"
        className="flex flex-col gap-4"
      >
        <SectionTitle
          id="libraries-title"
          title="Libraries"
          context={countLabel(libraries.length, 'library', 'libraries')}
          actions={
            <Button variant="secondary" onClick={() => setEditing(null)}>
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
                    <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">
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

      <LibraryDialog
        library={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={loadData}
      />
    </div>
  )
}

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
