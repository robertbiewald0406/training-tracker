import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/training-tracker/',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
})
