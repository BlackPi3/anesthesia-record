/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Unit tests live beside the code they cover. `tests/` holds the Playwright suite, which
    // needs a browser and must not be collected here.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
