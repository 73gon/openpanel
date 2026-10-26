import { useState } from 'react'
import {
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
  Spinner,
  toast,
} from '@zonsh/ui'
import {
  clearSeriesAnilistId,
  setSeriesAnilistId,
  type SeriesMetadata,
} from '@/lib/api'

/** Point a series at the right AniList entry, or hand it back to automatic matching. */
export function AnilistDialog({
  open,
  onOpenChange,
  seriesId,
  metadata,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seriesId: string
  metadata: SeriesMetadata | null
  onSaved: (metadata: SeriesMetadata) => void
}) {
  const [pending, setPending] = useState<'save' | 'reset' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const manual = metadata?.anilist_id_source === 'manual'

  const save = async (values: Record<string, unknown>) => {
    const id = Number(values.anilistId)
    setPending('save')
    setErrors({})
    try {
      const fresh = await setSeriesAnilistId(seriesId, id)
      onSaved(fresh)
      onOpenChange(false)
      toast.success('The series now uses that AniList entry.')
    } catch (err) {
      setErrors({
        anilistId:
          err instanceof Error
            ? `AniList didn't accept ${id}. ${err.message}`
            : `AniList didn't accept ${id}. Check the number.`,
      })
    } finally {
      setPending(null)
    }
  }

  const reset = async () => {
    setPending('reset')
    try {
      const fresh = await clearSeriesAnilistId(seriesId)
      onSaved(fresh)
      onOpenChange(false)
      toast.success('The series is matched automatically again.')
    } catch (err) {
      toast.error("The match wasn't reset.", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Match on AniList</DialogTitle>
          <DialogDescription>
            The cover, description and details come from this AniList entry. Its
            ID is the number in the address, as in anilist.co/manga/30013.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onFormSubmit={save} className="contents">
          <DialogBody>
            <Field name="anilistId">
              <FieldLabel>AniList ID</FieldLabel>
              <Input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                autoComplete="off"
                defaultValue={metadata?.anilist_id?.toString() ?? ''}
              />
              <FieldDescription>
                {metadata?.anilist_id
                  ? manual
                    ? 'Set by hand.'
                    : 'Found automatically from the folder name.'
                  : 'No entry found automatically.'}
              </FieldDescription>
              <FieldError match="valueMissing">
                Enter the number from the AniList address.
              </FieldError>
              <FieldError match="patternMismatch">
                Use only the digits, without "anilist.co/manga/".
              </FieldError>
              {errors.anilistId && (
                <FieldError match>{errors.anilistId}</FieldError>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            {manual && (
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                aria-busy={pending === 'reset'}
                className="relative mr-auto"
              >
                <span className={pending === 'reset' ? 'invisible' : undefined}>
                  Match automatically
                </span>
                {pending === 'reset' && (
                  <Spinner label="Resetting the match" className="absolute" />
                )}
              </Button>
            )}
            <Button
              type="submit"
              aria-busy={pending === 'save'}
              className="relative"
            >
              <span className={pending === 'save' ? 'invisible' : undefined}>
                Save match
              </span>
              {pending === 'save' && (
                <Spinner label="Saving the match" className="absolute" />
              )}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
