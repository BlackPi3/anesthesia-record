import { expect, test, type Page, type TestInfo } from '@playwright/test'

/**
 * The main user stories, recorded.
 *
 * Every test in this suite produces a video anyway — `video: 'on'` — but 120 files named after
 * assertions do not tell anyone which flows matter. These four do, and they are written to be
 * watched: whole tasks from the first tap to the saved record, at a pace a person can follow,
 * rather than the shortest path to an assertion.
 *
 * They still assert. A recording of a flow that quietly stopped working is worse than no recording,
 * so each story ends by checking what reached local storage.
 *
 * The finished videos land in `docs/videos/` under the story's name, one per project, and are
 * committed: the brief asks for recordings of the main user stories as a deliverable.
 */

const STORAGE_KEY = 'anesthesia-record:case'

/** Long enough for the eye to land on what just changed before the next thing happens. */
const BEAT = 700

const sheet = (page: Page) => page.getByRole('dialog')

async function storedEntry(page: Page, id: string) {
  return page.evaluate(
    ([key, entryId]) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('nothing stored')
      const envelope = JSON.parse(raw)
      const entry = envelope.case.entries.find((candidate: { id: string }) => candidate.id === entryId)
      if (!entry) throw new Error(`no entry ${entryId}`)
      return entry
    },
    [STORAGE_KEY, id] as const,
  )
}

async function storedEntries(page: Page, type: string) {
  return page.evaluate(
    ([key, wanted]) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('nothing stored')
      const envelope = JSON.parse(raw)
      return envelope.case.entries.filter((entry: { type: string }) => entry.type === wanted)
    },
    [STORAGE_KEY, type] as const,
  )
}

async function centreOf(page: Page, id: string) {
  const box = await page.locator(`[data-entry-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`no marker for ${id}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Keeps the finished recording under a name that says what it shows.
 *
 * The page is closed first: a video is finalised when its page is, and `saveAs` on a page still
 * being recorded would copy a file the browser has not finished writing.
 */
async function keepVideo(page: Page, info: TestInfo, name: string) {
  const video = page.video()
  if (!video) return

  await page.close()
  await video.saveAs(`docs/videos/${name}.${info.project.name}.webm`)
}

/** WebKit repeats what Chromium already recorded, and touch stories cannot run there at all. */
test.skip(({ browserName }) => browserName === 'webkit', 'Stories are recorded once, on Chromium')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/**
 * Story 1: document a measurement, then correct it on the curve.
 *
 * The heart of the brief. A value is entered through the sheet, appears on the timeline at once,
 * is dragged to a new position, and the record keeps what it was before.
 */
test('story: record a value and correct it on the timeline', async ({ page }, info) => {
  await page.waitForTimeout(BEAT)

  await page.getByRole('button', { name: /Erfassen/ }).click()
  await sheet(page).getByRole('button', { name: /^Wert/ }).click()
  await sheet(page).getByRole('button', { name: /Sauerstoffsättigung/ }).click()
  await page.waitForTimeout(BEAT)

  // The steppers move by the metric's own step, so the number is exact by construction.
  for (let press = 0; press < 3; press += 1) {
    await sheet(page).getByRole('button', { name: 'Sauerstoffsättigung verringern' }).click()
  }
  await page.waitForTimeout(BEAT)
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  await page.waitForTimeout(BEAT)

  const recorded = (await storedEntries(page, 'vital')).at(-1)
  expect(recorded.vital).toBe('spo2')

  // Now the correction: press the new point, drag it, release.
  const at = await centreOf(page, recorded.id)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x - 30, at.y - 14, { steps: 20 })
  await page.waitForTimeout(BEAT)
  await page.mouse.up()
  await page.waitForTimeout(BEAT)

  const corrected = await storedEntry(page, recorded.id)
  expect(corrected.value).toBeGreaterThan(recorded.value)
  expect(corrected.revisions).toHaveLength(1)

  // And the trail, where the next correction would be made.
  await page.locator(`[data-readout="${recorded.id}"]`).click()
  await expect(sheet(page).getByText('Änderungen')).toBeVisible()
  await page.waitForTimeout(BEAT * 2)

  await keepVideo(page, info, 'record-and-correct-a-value')
})

/**
 * Story 2: a drug given as a single dose, with its unit.
 */
test('story: record a bolus', async ({ page }, info) => {
  const before = await storedEntries(page, 'bolus')
  await page.waitForTimeout(BEAT)

  await page.getByRole('button', { name: /Erfassen/ }).click()
  await sheet(page).getByRole('button', { name: /^Medikament/ }).click()
  await sheet(page).getByRole('button', { name: 'Fentanyl' }).click()
  await page.waitForTimeout(BEAT)

  for (let press = 0; press < 4; press += 1) {
    await sheet(page).getByRole('button', { name: 'Dosis erhöhen' }).click()
  }
  await page.waitForTimeout(BEAT)
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  await page.waitForTimeout(BEAT * 2)

  const after = await storedEntries(page, 'bolus')
  expect(after).toHaveLength(before.length + 1)
  expect(after.at(-1).drug).toBe('Fentanyl')

  await keepVideo(page, info, 'record-a-bolus')
})

/**
 * Story 3: an infusion hung and left running, then ended, then the end taken back.
 *
 * A continuous infusion is the entry documented twice, once when it starts and once when it stops,
 * and undo is what makes the second one safe to get wrong. Both demo infusions are finished, so
 * this story hangs its own.
 */
test('story: run an infusion, stop it, then undo the stop', async ({ page }, info) => {
  await page.waitForTimeout(BEAT)

  await page.getByRole('button', { name: /Erfassen/ }).click()
  await sheet(page).getByRole('button', { name: /^Medikament/ }).click()
  await sheet(page).getByText('Dauerinfusion', { exact: true }).click()
  await sheet(page).getByRole('button', { name: 'NaCl 0,9 %' }).click()
  await page.waitForTimeout(BEAT)

  for (let press = 0; press < 3; press += 1) {
    await sheet(page).getByRole('button', { name: 'Rate erhöhen' }).click()
  }
  // An infusion documented while it runs has no end time yet, and that is a state the record holds
  // rather than a field left blank.
  await expect(sheet(page).locator('.time-field__clock--running')).toHaveText('läuft')
  await page.waitForTimeout(BEAT)
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  await page.waitForTimeout(BEAT)

  const running = (await storedEntries(page, 'infusion')).at(-1)
  expect(running.endedAt).toBeNull()

  // It is stopped from the band, in the sheet it was written in.
  await page.getByRole('button', { name: /^NaCl 0,9 %, Dauerinfusion/ }).click()
  await expect(sheet(page).locator('.time-field__clock--running')).toHaveText('läuft')
  await page.waitForTimeout(BEAT)

  await sheet(page).getByRole('button', { name: 'Jetzt beenden' }).click()
  await page.waitForTimeout(BEAT)
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  await page.waitForTimeout(BEAT)

  expect((await storedEntry(page, running.id)).endedAt).not.toBeNull()

  // Stopped by mistake. One press puts the record back, revisions included: the infusion reads as
  // running again, not as running-after-having-been-stopped.
  await page.getByRole('button', { name: /rückgängig/i }).click()
  await page.waitForTimeout(BEAT * 2)

  const restored = await storedEntry(page, running.id)
  expect(restored.endedAt).toBeNull()
  expect(restored.revisions).toEqual([])

  await keepVideo(page, info, 'run-an-infusion-stop-it-and-undo')
})

/**
 * Story 4: scrolling the record on a touchscreen without disturbing it.
 *
 * The gesture that scrolls the page and the gesture that moves a point start identically, and this
 * is how they are told apart: a swipe scrolls, a press and hold takes the point. Chromium only, and
 * only on the iPad project, because it needs real touch input from the DevTools protocol.
 */
test('story: scroll over the timeline on a touchscreen, then move a point deliberately', async ({
  page,
  hasTouch,
}, info) => {
  test.skip(!hasTouch, 'Touch stories run on the iPad project')

  const cdp = await page.context().newCDPSession(page)
  const finger = (x: number, y: number) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }]

  async function drag(from: { x: number; y: number }, dy: number, holdMs: number) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: finger(from.x, from.y) })
    if (holdMs > 0) await page.waitForTimeout(holdMs)
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: finger(from.x, from.y + (dy * step) / 12),
      })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  await page.waitForTimeout(BEAT)

  // A swipe that starts right on a point: the page scrolls, the value does not move.
  const point = await centreOf(page, 'demo-heartRate-30')
  await drag(point, -200, 0)
  await page.waitForTimeout(BEAT)

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect((await storedEntry(page, 'demo-heartRate-30')).value).toBe(81)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(BEAT)

  // The same finger, held first. The ring thickens, the point is now his, and the page stays put.
  const again = await centreOf(page, 'demo-heartRate-30')
  await drag(again, -40, 450)
  await page.waitForTimeout(BEAT)

  const moved = await storedEntry(page, 'demo-heartRate-30')
  expect(moved.value).toBeGreaterThan(81)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.waitForTimeout(BEAT)

  await cdp.detach()
  await keepVideo(page, info, 'scroll-safely-then-move-a-point')
})
