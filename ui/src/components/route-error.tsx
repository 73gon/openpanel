import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'}
      </p>
      <Button onClick={reset} size="sm">
        Try again
      </Button>
    </div>
  )
}
