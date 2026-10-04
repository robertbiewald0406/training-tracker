import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'

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
    'w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-4 text-lg outline-none focus:border-emerald-500'

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Training Tracker</h1>
        <input
          className={input}
          type="email"
          autoComplete="username"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={input}
          type="password"
          autoComplete="current-password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-medium disabled:opacity-50"
        >
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  )
}
