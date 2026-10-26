import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Spinner } from '@zonsh/ui'
import { fetchAuthStatus } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { AccountSettings } from '@/components/account-settings'
import { SignIn } from '@/components/sign-in'

export const Route = createFileRoute('/profiles')({
  component: AuthPage,
})

/** Signed in: the account's settings. Signed out: the sign-in (or, on a new server, setup). */
function AuthPage() {
  const token = useAppStore((s) => s.token)
  const user = useAppStore((s) => s.user)
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    if (token) return
    fetchAuthStatus()
      .then((s) => setIsSetupComplete(s.setup_complete))
      .catch(() => setIsSetupComplete(false))
  }, [token])

  if (token && user) return <AccountSettings />

  if (isSetupComplete === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Spinner size="lg" label="Checking the server" />
      </div>
    )
  }

  return <SignIn setup={!isSetupComplete} />
}
