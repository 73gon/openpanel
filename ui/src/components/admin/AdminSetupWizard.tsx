import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  FolderLibraryIcon,
  Loading03Icon,
  Tick02Icon,
  ArrowRight,
  Folder01Icon,
  ArrowLeft,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createLibrary,
  startScan,
  fetchScanStatus,
  browseDirectories,
  type ScanStatus,
} from '@/lib/api'
import { toast } from 'sonner'

interface AdminSetupWizardProps {
  onComplete: () => void
}

export function AdminSetupWizard({ onComplete }: AdminSetupWizardProps) {
  const [step, setStep] = useState(0) // 0=create library, 1=scanning, 2=done
  const [libName, setLibName] = useState('')
  const [libPath, setLibPath] = useState('')
  const [creating, setCreating] = useState(false)

  // Directory browser
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserPath, setBrowserPath] = useState('')
  const [entries, setEntries] = useState<
    Array<{ name: string; path: string; is_dir: boolean }>
  >([])
  const [browsing, setBrowsing] = useState(false)

  // Scan
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)

  const handleBrowse = async (path: string) => {
    setBrowsing(true)
    try {
      const data = await browseDirectories(path)
      setBrowserPath(data.current_path)
      setEntries(data.entries.filter((e) => e.is_dir))
    } catch (err) {
      toast.error('Failed to browse directory', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBrowsing(false)
    }
  }

  const handleCreateAndScan = async () => {
    if (!libName.trim() || !libPath.trim()) return
    setCreating(true)
    try {
      await createLibrary(libName, libPath)
      toast.success('Library created')
      setStep(1)
      await startScan()
    } catch (err) {
      toast.error('Failed to create library', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setCreating(false)
    }
  }

  // Poll scan status during step 1
  useEffect(() => {
    if (step !== 1) return
    const interval = setInterval(async () => {
      try {
        const status = await fetchScanStatus()
        setScanStatus(status)
        if (!status.running) {
          setStep(2)
        }
      } catch {}
    }, 1000)
    return () => clearInterval(interval)
  }, [step])

  return (
    <div className="mx-auto max-w-lg py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            size={32}
            className="text-primary"
          />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Welcome to OpenPanel</h1>
        <p className="text-sm text-muted-foreground">
          Let's set up your first library to get started.
        </p>
      </motion.div>

      {/* Steps indicator */}
      <div className="mt-8 mb-8 flex items-center justify-center gap-3">
        {['Create Library', 'Scanning', 'Done'].map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={`h-px w-8 ${i <= step ? 'bg-primary' : 'bg-border'}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? (
                  <HugeiconsIcon icon={Tick02Icon} size={14} />
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-2">
              <Label>Library Name</Label>
              <Input
                placeholder="e.g. Manga, Comics"
                value={libName}
                onChange={(e) => setLibName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Library Path</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="/path/to/your/library"
                  value={libPath}
                  onChange={(e) => setLibPath(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    setBrowserOpen(true)
                    handleBrowse('')
                  }}
                >
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Point to the folder containing your series directories.
              </p>
            </div>

            {/* Directory browser */}
            <AnimatePresence>
              {browserOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Go to parent directory"
                      onClick={() => {
                        const parent = browserPath
                          .split('/')
                          .slice(0, -1)
                          .join('/')
                        handleBrowse(parent || '/')
                      }}
                    >
                      <HugeiconsIcon icon={ArrowLeft} size={12} />
                    </Button>
                    <code className="flex-1 truncate text-xs text-muted-foreground">
                      {browserPath || '/'}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setLibPath(browserPath)
                        setBrowserOpen(false)
                      }}
                    >
                      Select
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {browsing ? (
                      <div className="flex items-center justify-center py-6">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          className="animate-spin text-muted-foreground"
                        />
                      </div>
                    ) : entries.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No subdirectories
                      </p>
                    ) : (
                      entries.map((entry) => (
                        <button
                          key={entry.path}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                          onClick={() => handleBrowse(entry.path)}
                        >
                          <HugeiconsIcon
                            icon={Folder01Icon}
                            size={14}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              className="w-full gap-2"
              onClick={handleCreateAndScan}
              disabled={creating || !libName.trim() || !libPath.trim()}
            >
              {creating ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  Creating...
                </>
              ) : (
                <>
                  Create & Scan
                  <HugeiconsIcon icon={ArrowRight} size={16} />
                </>
              )}
            </Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 rounded-xl border border-border bg-card p-6 text-center"
          >
            <HugeiconsIcon
              icon={Loading03Icon}
              size={32}
              className="mx-auto animate-spin text-primary"
            />
            <h2 className="text-lg font-semibold">Scanning your library...</h2>
            {scanStatus && (
              <p className="text-sm text-muted-foreground">
                {scanStatus.series_found} series found ·{' '}
                {scanStatus.books_found} books
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              This may take a minute depending on your library size.
            </p>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 rounded-xl border border-border bg-card p-6 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <HugeiconsIcon
                icon={Tick02Icon}
                size={24}
                className="text-green-500"
              />
            </div>
            <h2 className="text-lg font-semibold">You're all set!</h2>
            {scanStatus && (
              <p className="text-sm text-muted-foreground">
                Found {scanStatus.series_found} series with{' '}
                {scanStatus.books_found} books.
              </p>
            )}
            <Button className="w-full gap-2" onClick={onComplete}>
              Go to Admin Dashboard
              <HugeiconsIcon icon={ArrowRight} size={16} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
