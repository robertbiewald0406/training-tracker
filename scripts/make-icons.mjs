// Erzeugt public/icon.svg und die PNG-Icons (Dusk: Nachtblau, Korall, Sand). Aufruf: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const NIGHT = '#12203a'
const CORAL = '#e4572e'
const SAND = '#f3e9dc'

// Maskable: Grafik auf 80 % verkleinert, damit sie komplett in der Safe Zone (Kreis, 80 % Durchmesser) liegt.
const build = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="disc"><circle cx="256" cy="240" r="150"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="${NIGHT}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <g clip-path="url(#disc)">
      <rect x="100" y="90" width="312" height="300" fill="${CORAL}"/>
      <rect x="100" y="282" width="312" height="8" fill="${NIGHT}"/>
      <rect x="100" y="312" width="312" height="13" fill="${NIGHT}"/>
      <rect x="100" y="348" width="312" height="19" fill="${NIGHT}"/>
    </g>
    <rect x="70" y="399" width="372" height="4" fill="${SAND}"/>
    <g fill="${SAND}">
      <rect x="96" y="226" width="320" height="16"/>
      <rect x="116" y="176" width="26" height="116"/>
      <rect x="150" y="196" width="18" height="76"/>
      <rect x="344" y="196" width="18" height="76"/>
      <rect x="370" y="176" width="26" height="116"/>
    </g>
  </g>
</svg>
`
const svg = build(1)
const maskable = build(0.8)

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
  await sharp(Buffer.from(src), { density: 384 }).resize(size, size).flatten({ background: NIGHT }).png().toFile(file)
  console.log('geschrieben:', file, `${size}x${size}`)
}
