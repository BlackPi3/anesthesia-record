import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const baseURL = `http://localhost:${PORT}`

/**
 * Two projects, matching the browsers the brief names: Chrome on the desktop and an iPad.
 *
 * The iPad project runs Chromium at iPad dimensions with touch enabled for now, which exercises
 * the layout and the pointer path but not WebKit itself. Real Safari verification is a separate
 * step and cannot be replaced by emulation.
 *
 * Videos are kept for every run: the brief asks for short recordings of the main user stories as
 * a deliverable, so they are output, not just retained on failure.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 30_000,

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'on',
    // Fixes the demo case's timestamps so screenshots and assertions do not depend on the
    // machine's timezone.
    timezoneId: 'Europe/Berlin',
    locale: 'de-DE',
  },

  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'ipad',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1080, height: 810 }, hasTouch: true },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
