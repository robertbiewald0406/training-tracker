// Erzeugt public/icon.svg und die PNG-Icons (Hantel auf Babyblau). Aufruf: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const BABY = '#8fd8f5'
const INK = '#2b1b4d'
const PINK = '#e91e8c'

// Maskable: Grafik auf 88 % verkleinert, damit sie komplett in der Safe Zone (Kreis, 80 % Durchmesser) liegt.
const art = (offset = 0) => `
  <g transform="translate(${256 + offset} ${256 + offset}) scale(17) translate(-12 -12)">
    <rect x="1.5" y="7" width="3.5" height="10" rx="1.2"/>
    <rect x="5" y="9" width="2.5" height="6" rx="0.8"/>
    <rect x="7.5" y="11" width="9" height="2"/>
    <rect x="16.5" y="9" width="2.5" height="6" rx="0.8"/>
    <rect x="19" y="7" width="3.5" height="10" rx="1.2"/>
  </g>`

const build = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd23f"/>
      <stop offset="1" stop-color="#ff5cb8"/>
    </linearGradient>
    <clipPath id="disc"><circle cx="256" cy="256" r="165"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="${BABY}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <g clip-path="url(#disc)">
    <rect x="80" y="80" width="352" height="352" fill="url(#sun)"/>
    <rect x="80" y="318" width="352" height="9" fill="${BABY}"/>
    <rect x="80" y="344" width="352" height="14" fill="${BABY}"/>
    <rect x="80" y="376" width="352" height="20" fill="${BABY}"/>
  </g>
  <circle cx="256" cy="256" r="165" fill="none" stroke="${INK}" stroke-width="8"/>
  <g fill="${PINK}">${art(12)}</g>
  <g fill="${INK}">${art(0)}</g>
  </g>
</svg>
`
const svg = build(1)
const maskable = build(0.88) // Schatten und Scheiben bleiben sicher innerhalb der Safe Zone

await mkdir('public', { recursive: true })
await writeFile('public/icon.svg', svg)
const out = [
  ['public/apple-touch-icon.png', 180],
  ['public/pwa-192x192.png', 192],
  ['public/pwa-512x512.png', 512],
  ['public/pwa-maskable-512x512.png', 512],
]
for (const [file, size] of out) {
  const src = file.includes('maskable') ? maskable : svg
  await sharp(Buffer.from(src), { density: 384 }).resize(size, size).flatten({ background: BABY }).png().toFile(file)
  console.log('geschrieben:', file, `${size}x${size}`)
}
