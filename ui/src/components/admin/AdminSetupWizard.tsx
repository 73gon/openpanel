import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  Eyebrow,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  Heading,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Progress,
  Spinner,
} from '@zonsh/ui'
import { ArrowRightIcon, CheckIcon, CircleCheckIcon } from 'lucide-react'
import {
  createLibrary,
  startScan,
  fetchScanStatus,
  type ScanStatus,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn, countLabel, pad2 } from '@/lib/utils'
import { Page } from '@/components/page'
import { DirectoryBrowser } from './DirectoryBrowser'

interface AdminSetupWizardProps {
  onComplete: () => void
}

const STEPS = ['Choose a folder', 'Scan it', 'Start reading']

/** The first run: one library, scanned, then into the library. */
export function AdminSetupWizard({ onComplete }: AdminSetupWizardProps) {
  const navigate = useNavigate()
  const setScanRunning = useAppStore((s) => s.setScanRunning)
  const [step, setStep] = useState(0) // 0=create library, 1=scanning, 2=done
  const [libPath, setLibPath] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)

  const handleCreateAndScan = async (values: Record<string, unknown>) => {
    if (pending) return
    const name = String(values.name ?? '').trim()
    const path = libPath.trim()
    if (!path) {
      setErrors({ path: 'Choose the folder your CBZ files are in.' })
      return
    }
    setPending(true)
    setErrors({})
    try {
      await createLibrary(name, path)
      setStep(1)
      await startScan()
      setScanRunning(true)
    } catch (err) {
      setErrors({
        path:
          err instanceof Error ? err.message : "The library wasn't created.",
      })
    } finally {
      setPending(false)
    }
  }

  // Poll scan status during step 1
  useEffect(() => {
    if (step !== 1) return
    const interval = setInterval(async () => {
      try {
        const status = await fetchScanStatus()
        setScanStatus(status)
        if (!status.running) setStep(2)
      } catch {}
    }, 1000)
    return () => clearInterval(interval)
  }, [step])

  const found = scanStatus
    ? [
        countLabel(scanStatus.series_found ?? 0, 'series', 'series'),
        countLabel(scanStatus.books_found ?? 0, 'book'),
      ].join(' · ')
    : null

  return (
    <Page>
      <div className="mx-auto flex max-w-xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <Eyebrow>Setup</Eyebrow>
          <h1 className="m-0 font-heading text-[30px] leading-[1.06] font-light tracking-[-0.02em] sm:text-[36px]">
            Your first library
          </h1>
          <p className="m-0 text-[17px] leading-[1.6] text-foreground-soft">
            OpenPanel reads CBZ files from a folder on this server. Each
            subfolder becomes a series.
          </p>
        </header>

        <ol className="m-0 grid list-none grid-cols-3 gap-4 border-t border-border/60 p-0 pt-4">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'flex flex-col gap-1.5 font-mono text-xs',
                i <= step ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="flex items-center gap-1.5 tabular-nums">
                {i < step ? (
                  <CheckIcon className="size-3.5" aria-label="Done" />
                ) : (
                  pad2(i + 1)
                )}
              </span>
              <span className="uppercase tracking-[0.12em]">{label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Card>
            <Form errors={errors} onFormSubmit={handleCreateAndScan}>
              <Field name="name">
                <FieldLabel>Name</FieldLabel>
                <Input required placeholder="Manga" autoComplete="off" />
                <FieldError match="valueMissing">
                  Give the library a name.
                </FieldError>
              </Field>
              <Field name="path" invalid={!!errors.path}>
                <FieldLabel>Folder</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    value={libPath}
                    onValueChange={(value) => setLibPath(value)}
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
                  The folder that holds your series folders, as the server sees
                  it.
                </FieldDescription>
                {errors.path && <FieldError match>{errors.path}</FieldError>}
              </Field>
              {browsing && (
                <DirectoryBrowser
                  initialPath={libPath}
                  onChoose={(chosen) => {
                    setLibPath(chosen)
                    setBrowsing(false)
                  }}
                  onCancel={() => setBrowsing(false)}
                />
              )}
              <FormActions>
                <Button type="submit" aria-busy={pending} className="relative">
                  <span
                    className={cn(
                      'flex items-center gap-2',
                      pending && 'invisible',
                    )}
                  >
                    Create and scan
                    <ArrowRightIcon />
                  </span>
                  {pending && (
                    <Spinner
                      label="Creating the library"
                      className="absolute"
                    />
                  )}
                </Button>
              </FormActions>
            </Form>
          </Card>
        )}

        {step === 1 && (
          <section aria-live="polite" className="flex flex-col gap-4">
            <Heading level={3} as="h2">
              Scanning your library
            </Heading>
            <Progress
              value={
                scanStatus && scanStatus.total > 0
                  ? Math.round((scanStatus.scanned / scanStatus.total) * 100)
                  : null
              }
              label={
                scanStatus && scanStatus.total > 0
                  ? `${scanStatus.scanned.toLocaleString('en-US')} of ${scanStatus.total.toLocaleString('en-US')} files`
                  : 'Finding files'
              }
              showValue={!!scanStatus && scanStatus.total > 0}
            />
            {found && (
              <p className="m-0 font-mono text-xs text-muted-foreground">
                {found} so far
              </p>
            )}
            <p className="m-0 text-sm text-muted-foreground">
              A large library takes a few minutes. You can leave this page; the
              scan keeps going.
            </p>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col items-start gap-5">
            <CircleCheckIcon className="size-6 text-success" aria-hidden />
            <div className="flex flex-col gap-2">
              <Heading level={3} as="h2">
                Your library is ready
              </Heading>
              {found && (
                <p className="m-0 font-mono text-xs text-muted-foreground">
                  {found}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate({ to: '/' })}>
                Open the library
                <ArrowRightIcon />
              </Button>
              <Button variant="secondary" size="lg" onClick={onComplete}>
                Server settings
              </Button>
            </div>
          </section>
        )}
      </div>
    </Page>
  )
}
