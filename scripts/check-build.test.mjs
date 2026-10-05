import { describe, expect, it } from 'vitest'
import { scanText } from './check-build.mjs'

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${b64url({ role, iss: 'supabase' })}.c2lnbmF0dXJlMTIzNDU2`

describe('Build-Prüfung', () => {
  it('lässt Bibliothekscode mit dem Präfix-Check und dem Wort service_role durch', () => {
    expect(scanText("e.startsWith(`sb_secret_`)||e.startsWith(`sb_publishable_`)")).toEqual([])
    expect(scanText('Never expose your `service_role` key in the browser.')).toEqual([])
  })
  it('findet einen echten Secret Key', () => {
    expect(scanText('const k="sb_secret_abcdefghijklmnopqrstuvwx"')).toHaveLength(1)
  })
  it('findet einen JWT mit Rolle service_role, nicht aber anon', () => {
    expect(scanText(`k="${jwt('service_role')}"`)).toEqual(['JWT mit Rolle service_role'])
    expect(scanText(`k="${jwt('anon')}"`)).toEqual([])
  })
  it('findet Dev-Texte', () => {
    expect(scanText('Lokale Daten löschen')).toHaveLength(1)
    expect(scanText('note: "TESTDATEN"')).toHaveLength(1)
  })
  it('Publishable Key ist erlaubt', () => {
    expect(scanText('sb_publishable_DUMMYDUMMYDUMMYDUMMYDUMMY')).toEqual([])
  })
})
