// Spiegelt supabase/schema.sql. user_id fehlt bewusst: die DB setzt ihn per auth.uid().
export type Side = 'left' | 'right' | 'both'

export interface SessionRow {
  id: string
  day_key: string
  started_at: string
  ended_at: string | null
  note: string | null
}

export interface WorkoutSetRow {
  id: string
  session_id: string
  exercise_key: string
  set_no: number
  weight_kg: number
  reps: number
  rir: number | null
  is_warmup: boolean
  side: Side
  logged_at: string
  note: string | null
}

export interface BodyweightRow {
  id: string
  measured_on: string // YYYY-MM-DD
  weight_kg: number
}

export type StoreName = 'session' | 'workout_set' | 'bodyweight'

export interface RowByStore {
  session: SessionRow
  workout_set: WorkoutSetRow
  bodyweight: BodyweightRow
}

export type SyncState = 'pending' | 'synced'

// Lokale Metadaten, werden nie zu Supabase gesendet.
export interface LocalMeta {
  _sync: SyncState
  _v: number // wird bei jedem lokalen Schreiben erhöht
  _error?: string
  _deleted?: boolean // Tombstone: lokal geloescht, Loeschung zu Supabase steht noch aus
}

export type LocalRow<S extends StoreName> = RowByStore[S] & LocalMeta
