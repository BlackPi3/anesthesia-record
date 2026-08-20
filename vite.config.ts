/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/, not from the root of the domain, so the built
  // asset URLs have to carry that prefix. It comes from the environment rather than being
  // hard-coded, because dev and the Playwright suite run at the root and would otherwise have to
  // know the deploy path. The Pages workflow is the only thing that sets it.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    // Unit tests live beside the code they cover. `tests/` holds the Playwright suite, which
    // needs a browser and must not be collected here.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
