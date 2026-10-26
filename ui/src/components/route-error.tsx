import type { ErrorComponentProps } from '@tanstack/react-router'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Button,
} from '@zonsh/ui'
import { CircleAlertIcon } from 'lucide-react'
import { Page } from '@/components/page'

export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <Page>
      <ErrorNotice
        title="This page didn't load"
        error={error}
        onRetry={reset}
        className="mx-auto max-w-2xl"
      />
    </Page>
  )
}

/** A failure inside a page: what went wrong and a way to try again. */
export function ErrorNotice({
  title,
  error,
  onRetry,
  className,
}: {
  title: string
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {error instanceof Error
          ? error.message
          : 'Something unexpected happened. Check that the server is running, then try again.'}
      </AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
