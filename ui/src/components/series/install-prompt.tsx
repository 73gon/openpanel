import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Index,
} from '@zonsh/ui'

const STEPS = [
  'Open the Share menu in your browser.',
  'Choose "Add to Home Screen".',
  'Confirm with "Add", then open OpenPanel from your home screen.',
]

/** Downloads need the installed app: how to install it, for someone who tried. */
export function InstallPrompt({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Install OpenPanel to read offline</DialogTitle>
          <DialogDescription>
            Downloads live in the installed app, where they stay available
            without a connection.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="m-0 flex list-none flex-col gap-3 border-t border-border/60 p-0 pt-4">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className="flex gap-4 text-[15px] text-foreground-soft"
              >
                <Index n={i + 1} className="pt-1" />
                {step}
              </li>
            ))}
          </ol>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button />}>Got it</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
