import { expect, test, type Page } from '@playwright/test'

/**
 * Creating a vital measurement through the "+" flow.
 *
 * Like the correction tests, the assertions run through to what local storage holds. A point
 * appearing on the chart is not evidence that anything was recorded, and a test that stopped at
 * the rendered SVG would pass with persistence broken.
 */

const STORAGE_KEY = 'anesthesia-record:case'

/** Every vital entry of one kind, as local storage currently holds them. */
async function storedVitals(page: Page, kind: string) {
  return page.evaluate(
    ([key, vital]) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('nothing stored')
      const envelope = JSON.parse(raw)
      return envelope.case.entries.filter(
        (entry: { type: string; vital?: string }) => entry.type === 'vital' && entry.vital === vital,
      )
    },
    [STORAGE_KEY, kind] as const,
  )
}

/** Opens the sheet and picks a metric, leaving the value step on screen. */
async function openEntry(page: Page, metric: RegExp) {
  await page.getByRole('button', { name: /Wert erfassen/ }).click()
  await page.getByRole('button', { name: metric }).click()
}

/**
 * Saves the entry and waits for the sheet to finish closing.
 *
 * The wait is not cosmetic: the drawer's mask stays over the chart for the length of its close
 * animation, so a drag started immediately after saving lands on the mask and never reaches the
 * timeline.
 */
async function commit(page: Page) {
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('records a new value with the steppers and saves it', async ({ page }) => {
  const before = await storedVitals(page, 'temperature')
  expect(before).toHaveLength(5)

  await openEntry(page, /^Temp/)

  // The control opens on the last reading for the metric, which is what makes most entries a
  // couple of taps rather than a hunt across the range.
  await expect(page.locator('.value-field__number')).toHaveText('36,5')

  await page.getByRole('button', { name: 'Temperatur erhöhen' }).click()
  await page.getByRole('button', { name: 'Temperatur erhöhen' }).click()
  await expect(page.locator('.value-field__number')).toHaveText('36,7')

  await commit(page)
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()

  const after = await storedVitals(page, 'temperature')
  expect(after).toHaveLength(6)

  const created = after[after.length - 1]
  expect(created.value).toBeCloseTo(36.7, 5)
  // A new entry is not a correction: it starts with an empty audit trail.
  expect(created.revisions).toEqual([])
  expect(created.deletedAt).toBeNull()
})

test('the new value is drawn on the timeline and survives a reload', async ({ page }) => {
  await openEntry(page, /^SpO₂/)
  await page.getByRole('button', { name: 'Sauerstoffsättigung verringern' }).click()
  await commit(page)

  const created = (await storedVitals(page, 'spo2')).at(-1)
  const marker = page.locator(`[data-entry-id="${created.id}"]`)
  await expect(marker).toBeVisible()

  // Compare the stored bytes across the reload. A re-seeded demo case would look identical on
  // screen, so "the point is still there" proves nothing on its own.
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  await page.reload()
  const restored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)

  expect(restored).toBe(stored)
  await expect(page.locator(`[data-entry-id="${created.id}"]`)).toBeVisible()
})

test('the timestamp defaults into the case and is adjustable', async ({ page }) => {
  await openEntry(page, /^HF/)

  // The demo case is pinned to a fixed date, so "now" is resolved against the case rather than
  // the wall clock: the entry must land in the record, not days after it. Scoped to the sheet's
  // own clock, since the axis and the event band show these times too.
  const clock = page.locator('.time-field__clock')
  await expect(clock).toHaveText('09:45')

  await page.getByRole('button', { name: '5 Minuten früher' }).click()
  await expect(clock).toHaveText('09:40')

  await commit(page)

  const created = (await storedVitals(page, 'heartRate')).at(-1)
  const at = new Date(created.at)
  expect(`${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`).toBe('9:40')
})

test('a value can be entered and then corrected on the chart', async ({ page }) => {
  // The two halves of the brief's core interaction meeting: entry through the sheet, correction
  // by pointer, on the same entry.
  await openEntry(page, /^Temp/)
  await commit(page)

  const created = (await storedVitals(page, 'temperature')).at(-1)
  expect(created.revisions).toEqual([])

  const box = await page.locator(`[data-entry-id="${created.id}"]`).boundingBox()
  if (!box) throw new Error('no marker for the entry just created')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 18, { steps: 8 })
  await page.mouse.up()

  const corrected = (await storedVitals(page, 'temperature')).find(
    (entry: { id: string }) => entry.id === created.id,
  )
  expect(corrected.value).toBeGreaterThan(created.value)
  expect(corrected.revisions).toHaveLength(1)
})

test('leaving the sheet records nothing', async ({ page }) => {
  const before = await storedVitals(page, 'temperature')

  await openEntry(page, /^Temp/)
  await page.getByRole('button', { name: 'Temperatur erhöhen' }).click()
  await page.getByRole('button', { name: 'Zurück' }).click()
  await page.keyboard.press('Escape')

  expect(await storedVitals(page, 'temperature')).toHaveLength(before.length)
})
