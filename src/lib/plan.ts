import planJson from '../../plan.json'

export interface Exercise {
  name: string
  equipment: string
  attachment: string
  unilateral?: boolean
  unit?: 'sec' // Zeituebung: Dauer in Sekunden wird in reps gespeichert
  bodyweight?: boolean // Gewicht = Zusatzgewicht, Vorbelegung 0
  primary_muscle: string
  secondary_muscles: string[]
  alternatives: string[]
  cue: string
}
export interface PlanItem {
  exercise_key: string
  sets: number
  rep_min: number
  rep_max: number
  rest_sec: number
  variant?: string // nur in dieser Variante des Tages (ohne variant: immer)
}
export interface PlanDay {
  key: string
  weekday: number // 1 = Montag ... 5 = Freitag
  name: string
  rotation?: { variants: string[]; labels: Record<string, string>; rule?: string }
  items: PlanItem[]
}
export interface Plan {
  version: number
  notes: string
  ramp_up: { weeks: number; sets_minus: number; min_sets: number }
  exercises: Record<string, Exercise>
  days: PlanDay[]
}

// plan.json ist die einzige Quelle für Übungen und Tagesplan (nicht in der DB).
export const plan = planJson as Plan
