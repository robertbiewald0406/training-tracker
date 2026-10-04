import { useEffect } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { LoginScreen } from './auth/LoginScreen'
import { SyncStatusBar } from './SyncStatusBar'
import { Button } from './ui/Button'
import { AppLayout } from './ui/AppLayout'
import { Logger } from './screens/Logger'
import { SettingsCard } from './screens/SettingsCard'
import { Divider } from './ui/Divider'
import { DevTools } from './DevTools'
import { loadSettings } from './lib/settings'
import { startSync } from './lib/sync'
import { supabase, supabaseConfigured } from './lib/supabase'

function Shell() {
  const { session, loading, signOut } = useAuth()
  const loggedIn = Boolean(session)

  // Sync beim App-Start (sobald eingeloggt) und beim online-Event.
  useEffect(() => (loggedIn ? startSync(supabase) : undefined), [loggedIn])
  useEffect(() => void loadSettings(), [])

  if (!supabaseConfigured)
    return (
      <main className="p-6 font-semibold">
        VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY in .env eintragen.
      </main>
    )
  if (loading) return null
  if (!session) return <LoginScreen />

  return (
    <AppLayout>
      <Logger
        extras={
          <>
            <SyncStatusBar />
            <SettingsCard />
            <Divider />
            {import.meta.env.DEV && <DevTools />}
            <Button onClick={signOut}>Abmelden</Button>
          </>
        }
      />
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
