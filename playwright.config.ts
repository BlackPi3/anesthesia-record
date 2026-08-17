import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const baseURL = `http://localhost:${PORT}`

/**
 * Three projects, covering the two browsers the brief names.
 *
 * `desktop-chrome` and `ipad` are Chromium, one at desktop size and one at iPad size with touch.
 * `ipad-safari` runs the same suite against WebKit, the engine Safari on an iPad actually uses.
 * Without it the app would be tested entirely on Blink while being graded on Safari, and the parts
 * most likely to differ are exactly the ones that were hardest to get right: pointer events,
 * `touch-action`, and a non-passive `touchmove` listener.
 *
 * WebKit skips `touch.spec.ts`, which drives real touch gestures through the Chrome DevTools
 * Protocol. That is Chromium-only by construction, and there is no cross-browser substitute:
 * synthetic touch events do not cause real scrolling, so a test written with them could not tell
 * a page that scrolls from one that does not. What those tests prove about the gesture is proven
 * once, in Chromium, and the WebKit project covers everything else.
 *
 * Video is recorded where it is watched. The brief asks for short recordings of the main user
 * stories as a deliverable, so `stories.spec.ts` turns it on for itself; everywhere else a passing
 * test's video is a file nobody opens, and there were two hundred of them per run. What is left is
 * the four stories and anything that fails, failure being the only other moment a recording earns
 * the disk it is written to.
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
    video: 'retain-on-failure',
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
    {
      name: 'ipad-safari',
      testIgnore: /touch\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1080, height: 810 }, hasTouch: true },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
