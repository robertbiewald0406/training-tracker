import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import m002 from '../../supabase/migrations/002_session_adjustment_plan_override.sql?raw'
import m006 from '../../supabase/migrations/006_adjustment_hinzufuegen.sql?raw'
import schema from '../../supabase/schema.sql?raw'

// Führt die echten Migrationen in einer Postgres-Engine (PGlite) aus und prüft den neuen Typ "hinzufuegen".
const USER = '11111111-1111-1111-1111-111111111111'
const SESSION = '22222222-2222-2222-2222-222222222222'
let db: PGlite
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${USER}');
  `)
  await db.exec(schema)
  await db.exec(m002)
  await db.query("insert into session (id, user_id, day_key, started_at) values ($1, $2, 'mo_brust', now())", [SESSION, USER])
  // Zeilen, die es vor der Migration schon gab, bleiben gültig.
  await db.query(
    "insert into session_adjustment (id, user_id, session_id, typ, original_key, logged_at) values ($1, $2, $3, 'auslassen', 'fly_machine', now())",
    [id(), USER, SESSION],
  )
  await db.exec(m006)
  await db.exec(m006) // mehrfach ausführbar
}, 60_000)

const adj = (typ: string, position: number | null, neuer: string | null = null) =>
  db.query(
    'insert into session_adjustment (id, user_id, session_id, typ, original_key, neuer_key, position, logged_at) values ($1, $2, $3, $4, $5, $6, $7, now())',
    [id(), USER, SESSION, typ, 'y_row', neuer, position],
  )
const ovr = (typ: string, position: number | null, dayKey = 'mo_brust') =>
  db.query('insert into plan_override (id, user_id, day_key, typ, exercise_key, position, created_at) values ($1, $2, $3, $4, $5, $6, now())', [
    id(), USER, dayKey, typ, 'y_row', position,
  ])

describe('Migration 006: Anpassungstyp hinzufuegen', () => {
  it('session_adjustment: hinzufuegen mit Position ist erlaubt, ohne Position nicht', async () => {
    await expect(adj('hinzufuegen', 2)).resolves.toBeDefined()
    await expect(adj('hinzufuegen', null)).rejects.toThrow(/hinzufuegen_position|check constraint/)
    await expect(adj('hinzufuegen', -1)).rejects.toThrow(/check constraint/)
  })
  it('plan_override: auch für einen Tag mit Variante (day_key ist Text)', async () => {
    await expect(ovr('hinzufuegen', 0, 'mi_beine_b')).resolves.toBeDefined()
    await expect(ovr('hinzufuegen', null)).rejects.toThrow(/check constraint/)
  })
  it('die alten Typen gelten weiter, unbekannte nicht', async () => {
    await expect(adj('auslassen', null)).resolves.toBeDefined()
    await expect(adj('tauschen', null, 'lat_pulldown_wide')).resolves.toBeDefined()
    await expect(adj('tauschen', null)).rejects.toThrow(/check constraint/)
    await expect(adj('reihenfolge', 1)).resolves.toBeDefined()
    await expect(adj('reihenfolge', null)).rejects.toThrow(/check constraint/)
    await expect(adj('loeschen', 1)).rejects.toThrow(/check constraint/)
    await expect(ovr('loeschen', 1)).rejects.toThrow(/check constraint/)
  })
  it('bestehende Zeilen sind erhalten, RLS und Rechte unverändert', async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from session_adjustment where typ = 'auslassen' and original_key = 'fly_machine'")
    expect(r.rows[0].n).toBe(1)
    const p = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('session_adjustment', 'plan_override')")
    expect(p.rows.every((x) => x.relrowsecurity)).toBe(true)
    const g = await db.query<{ has: boolean }>("select has_table_privilege('anon', 'session_adjustment', 'select') as has")
    expect(g.rows[0].has).toBe(false)
  })
  it('keine Geheimnisse, keine Rechte an anon in der Datei', () => {
    expect(m006.replace(/--.*$/gm, '')).not.toMatch(/anon|grant|eyJ|secret/i)
  })
})
