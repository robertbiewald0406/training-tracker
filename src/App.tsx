import { useEffect } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { LoginScreen } from './auth/LoginScreen'
import { SyncStatusBar } from './SyncStatusBar'
import { DevTools } from './DevTools'
import { startSync } from './lib/sync'
import { supabase, supabaseConfigured } from './lib/supabase'

function Shell() {
  const { session, loading, signOut } = useAuth()
  const loggedIn = Boolean(session)

  // Sync beim App-Start (sobald eingeloggt) und beim online-Event.
  useEffect(() => (loggedIn ? startSync(supabase) : undefined), [loggedIn])

  if (!supabaseConfigured)
    return (
      <main className="p-6">
        VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY in .env eintragen.
      </main>
    )
  if (loading) return null
  if (!session) return <LoginScreen />

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Training Tracker</h1>
      <SyncStatusBar />
      {import.meta.env.DEV && <DevTools />}
      <button onClick={signOut} className="w-full rounded-xl border border-neutral-700 py-3">
        Abmelden
      </button>
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
