import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupPasswordToggle,
  Spinner,
} from '@zonsh/ui'
import { ApiError, login, register } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { OpenPanelLogo } from '@/components/openpanel-mark'

type Errors = Record<string, string>

/**
 * Signing in — or, on a new server, creating the first account. A card under the logo, on a
 * blueprint grid that fades out.
 */
export function SignIn({ setup }: { setup: boolean }) {
  const navigate = useNavigate()
  const setAuth = useAppStore((s) => s.setAuth)
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending) return
    const username = String(values.username ?? '').trim()
    const password = String(values.password ?? '')
    setPending(true)
    setErrors({})
    try {
      const result = setup
        ? await register(username, password)
        : await login(username, password)
      setAuth(result.profile, result.token)
      navigate({ to: '/' })
    } catch (err) {
      // Only the server's own message: a failed fetch says nothing a reader can act on.
      const message = err instanceof ApiError ? err.message : ''
      if (err instanceof ApiError && err.status === 429) {
        setErrors({
          password: 'Too many attempts. Wait a minute, then try again.',
        })
      } else if (setup) {
        setErrors({
          username: `The account wasn't created. ${message || 'Check that the server is running.'}`,
        })
      } else if (err instanceof ApiError && err.status === 401) {
        setErrors({
          password:
            "That username and password don't match. Check both and try again.",
        })
      } else {
        setErrors({
          password: `You weren't signed in. ${message || 'Check that the server is running.'}`,
        })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-1 blueprint [mask-image:radial-gradient(ellipse_55%_50%_at_50%_50%,#000_20%,transparent_75%)]"
      />
      <OpenPanelLogo size={22} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          {setup && <p className="m-0 eyebrow">New server</p>}
          <CardTitle render={<h1 />}>
            {setup ? 'Create the first account' : 'Sign in'}
          </CardTitle>
          <CardDescription>
            {setup
              ? 'This account looks after the server: its libraries, its readers and its updates.'
              : 'Your library, your progress and your bookmarks.'}
          </CardDescription>
        </CardHeader>

        <Form errors={errors} onFormSubmit={submit}>
          <Field name="username">
            <FieldLabel>Username</FieldLabel>
            <Input
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            <FieldError match="valueMissing">Enter your username.</FieldError>
            {errors.username && (
              <FieldError match>{errors.username}</FieldError>
            )}
          </Field>

          <Field name="password">
            <FieldLabel>Password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                required
                type={visible ? 'text' : 'password'}
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={setup ? 4 : undefined}
                spellCheck={false}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupPasswordToggle
                  visible={visible}
                  onVisibleChange={setVisible}
                />
              </InputGroupAddon>
            </InputGroup>
            {setup && (
              <FieldDescription>At least 4 characters.</FieldDescription>
            )}
            <FieldError match="valueMissing">Enter your password.</FieldError>
            <FieldError match="tooShort">Use at least 4 characters.</FieldError>
            {errors.password && (
              <FieldError match>{errors.password}</FieldError>
            )}
          </Field>

          <FormActions>
            <Button type="submit" aria-busy={pending} className="relative">
              <span className={pending ? 'invisible' : undefined}>
                {setup ? 'Create account' : 'Sign in'}
              </span>
              {pending && (
                <Spinner
                  label={setup ? 'Creating the account' : 'Signing in'}
                  className="absolute"
                />
              )}
            </Button>
          </FormActions>
        </Form>
      </Card>
      {!setup && (
        <p className="m-0 max-w-xs text-center text-[13px] leading-normal text-balance text-muted-foreground">
          No account yet? Ask whoever runs this server to add you.
        </p>
      )}
    </div>
  )
}
