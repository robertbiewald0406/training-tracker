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

export type AdjustTyp = 'auslassen' | 'tauschen' | 'reihenfolge'
export type AdjustGrund = 'schmerz' | 'geraet_belegt' | 'zeit' | 'anderes'

/** Anpassung einer Einheit: Uebung ausgelassen, getauscht oder in der Reihenfolge verschoben. */
export interface SessionAdjustmentRow {
  id: string
  session_id: string
  typ: AdjustTyp
  original_key: string
  neuer_key: string | null // nur bei 'tauschen'
  position: number | null // nur bei 'reihenfolge': Zielposition in der Tagesliste (0-basiert)
  grund: AdjustGrund | null
  note: string | null // hoechstens 200 Zeichen
  dauerhaft: boolean // zusaetzlich als plan_override gespeichert
  logged_at: string
}

/** Dauerhafte Anpassung eines Plan-Tags, wird beim Laden ueber plan.json gelegt. */
export interface PlanOverrideRow {
  id: string
  day_key: string // Plan-Tag (ohne Variante), z. B. mi_beine
  typ: AdjustTyp
  exercise_key: string
  neuer_key: string | null
  position: number | null
  created_at: string
}

export type StoreName = 'session' | 'workout_set' | 'bodyweight' | 'session_adjustment' | 'plan_override'

export interface RowByStore {
  session: SessionRow
  workout_set: WorkoutSetRow
  bodyweight: BodyweightRow
  session_adjustment: SessionAdjustmentRow
  plan_override: PlanOverrideRow
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
