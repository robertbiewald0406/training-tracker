import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { loadInitialSession, resolveSession } from './offlineSession'

interface AuthCtx {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Ohne Netz und mit abgelaufenem Token liefert getSession keine Sitzung: dann bleibt die gespeicherte bestehen
    // (die Daten sind lokal; zum Synchronisieren wird eine gueltige Sitzung gebraucht).
    void loadInitialSession(supabase.auth, localStorage, navigator.onLine).then((s) => {
      setSession(s)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') setSession(null)
      else setSession(resolveSession(s, null, localStorage, navigator.onLine))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    if (!navigator.onLine || /fetch/i.test(error.message)) return 'Keine Verbindung. Zum Anmelden wird Internet benötigt.'
    return 'E-Mail oder Passwort falsch.'
  }
  const signOut = async () => {
    try {
      await supabase.auth.signOut() // widerruft die Sitzung auch auf dem Server
    } catch {
      /* ohne Netz: lokal abmelden genuegt */
    } finally {
      await supabase.auth.signOut({ scope: 'local' })
    }
  }

  return <Ctx.Provider value={{ session, loading, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth außerhalb von AuthProvider')
  return c
}
