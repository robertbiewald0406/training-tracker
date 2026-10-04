import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Wordmark } from '../ui/Wordmark'
import { Ribbon } from '../ui/Ribbon'
import { Scene } from '../ui/Scene'
import { Dumbbell, Sun } from '../ui/icons'

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(email.trim(), password))
    setBusy(false)
  }

  const input =
    'min-h-14 w-full border-[3px] border-ink bg-white px-4 text-xl text-ink outline-none placeholder:text-[#5f4f85] focus:bg-baby/40'

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Scene sun={false} />
      <main className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-3 px-4 pb-44 pt-6">
        <Sun className="size-28" />
        <Wordmark />
        <Ribbon />
        <form onSubmit={submit} className="mt-3 w-full">
          <Card className="space-y-4">
            <input
              className={input}
              type="email"
              autoComplete="username"
              placeholder="E-Mail"
              aria-label="E-Mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={input}
              type="password"
              autoComplete="current-password"
              placeholder="Passwort"
              aria-label="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p role="alert" className="border-[3px] border-ink bg-err px-3 py-2 text-white">
                {error}
              </p>
            )}
            <Dumbbell className="mx-auto size-10 text-ink" />
            <Button variant="primary" disabled={busy}>
              {busy ? 'Anmelden …' : 'Anmelden'}
            </Button>
          </Card>
        </form>
      </main>
    </div>
  )
}
