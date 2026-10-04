import { useEffect, useState, useSyncExternalStore } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { LoginScreen } from './auth/LoginScreen'
import { SyncStatusBar } from './SyncStatusBar'
import { Button } from './ui/Button'
import { AppLayout } from './ui/AppLayout'
import { Logger } from './screens/Logger'
import { SettingsCard } from './screens/SettingsCard'
import { Dashboard } from './screens/Dashboard'
import { TabBar, type Tab } from './ui/TabBar'
import { useLocalData } from './lib/useLocalData'
import { UpdateBanner } from './ui/UpdateBanner'
import { DevTools } from './DevTools'
import { loadSettings } from './lib/settings'
import { getSyncStatus, startSync, subscribeSyncStatus } from './lib/sync'
import { supabase, supabaseConfigured } from './lib/supabase'

function VerlaufTab() {
  const d = useLocalData()
  return d.loaded ? <Dashboard sessions={d.sessions} sets={d.sets} bodyweight={d.bodyweight} /> : null
}

function Shell() {
  const { session, loading, signOut } = useAuth()
  const loggedIn = Boolean(session)
  const [tab, setTab] = useState<Tab>('training')
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)

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

  // Alle Tabs bleiben eingehaengt, damit ein laufendes Training beim Wechsel nichts verliert (nur ausgeblendet).
  return (
    <AppLayout>
      <div hidden={tab !== 'training'} className="space-y-5">
        <Logger />
      </div>
      {tab === 'verlauf' && <VerlaufTab />}
      {tab === 'mehr' && (
        <>
          <h1 className="text-3xl">Mehr</h1>
          <SyncStatusBar />
          <SettingsCard />
          {import.meta.env.DEV && <DevTools />}
          <Button onClick={signOut}>Abmelden</Button>
        </>
      )}
      <TabBar tab={tab} onTab={setTab} badge={sync.error || sync.held ? 1 : 0} />
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
      <UpdateBanner />
    </AuthProvider>
  )
}
