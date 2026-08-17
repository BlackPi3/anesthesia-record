import { expect, test, type Page } from '@playwright/test'

/**
 * Creating a vital measurement through a lane's own „Erfassen“ button.
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

/**
 * Opens a lane's sheet, which lands on the value step directly: the button that was pressed is
 * what named the metric, so there is no picker in between.
 */
async function openEntry(page: Page, lane: string) {
  await page.getByRole('button', { name: `${lane} erfassen` }).click()
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

  await openEntry(page, 'Temperatur')

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
  await openEntry(page, 'Sauerstoffsättigung')
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
  await openEntry(page, 'Herzfrequenz')

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
  await openEntry(page, 'Temperatur')
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

/**
 * Blood pressure is the one entry that is more than one number, because a cuff inflates once and
 * reports three. The assertion that matters is the shared timestamp: that is what makes them one
 * reading rather than three that happen to land near each other.
 */
test('records all three pressures as one reading on one timestamp', async ({ page }) => {
  const before = {
    systolic: await storedVitals(page, 'bloodPressureSystolic'),
    mean: await storedVitals(page, 'bloodPressureMean'),
    diastolic: await storedVitals(page, 'bloodPressureDiastolic'),
  }

  await openEntry(page, 'Blutdruck')

  // Written the way a monitor writes it, and the way it is read aloud.
  await expect(page.locator('.pressure__notation')).toHaveText('133/80 (98)')

  await page.getByRole('button', { name: 'Blutdruck systolisch erhöhen' }).click()
  await expect(page.locator('.pressure__notation')).toHaveText('134/80 (98)')

  await commit(page)

  const after = {
    systolic: await storedVitals(page, 'bloodPressureSystolic'),
    mean: await storedVitals(page, 'bloodPressureMean'),
    diastolic: await storedVitals(page, 'bloodPressureDiastolic'),
  }

  expect(after.systolic).toHaveLength(before.systolic.length + 1)
  expect(after.mean).toHaveLength(before.mean.length + 1)
  expect(after.diastolic).toHaveLength(before.diastolic.length + 1)

  expect(after.systolic.at(-1).value).toBe(134)
  const at = after.systolic.at(-1).at
  expect(after.mean.at(-1).at).toBe(at)
  expect(after.diastolic.at(-1).at).toBe(at)
})

/** A manual cuff gives a systolic and a diastolic and no mean at all. */
test('a pressure switched off is not written', async ({ page }) => {
  const before = {
    systolic: (await storedVitals(page, 'bloodPressureSystolic')).length,
    mean: (await storedVitals(page, 'bloodPressureMean')).length,
  }

  await openEntry(page, 'Blutdruck')
  await page.getByRole('checkbox', { name: 'Mittlerer arterieller Druck gemessen' }).click()
  await expect(page.locator('.pressure__notation')).toHaveText('133/80 (–)')

  await commit(page)

  expect(await storedVitals(page, 'bloodPressureMean')).toHaveLength(before.mean)
  expect(await storedVitals(page, 'bloodPressureSystolic')).toHaveLength(before.systolic + 1)
})

/**
 * The first reading of a case has nothing to copy, so it opens on the pre-operative values in the
 * header — a real measurement of this patient. There is no pre-operative mean, and rather than
 * proposing the middle of the axis for it the sheet opens that one switched off.
 */
test('the first reading opens on the pre-operative values, with no mean invented', async ({
  page,
}) => {
  await page.evaluate(() => {
    const key = 'anesthesia-record:case'
    const envelope = JSON.parse(window.localStorage.getItem(key)!)
    envelope.case.entries = []
    window.localStorage.setItem(key, JSON.stringify(envelope))
  })
  await page.reload()

  await openEntry(page, 'Blutdruck')

  await expect(page.locator('.pressure__notation')).toHaveText('142/85 (–)')
  await expect(
    page.getByRole('checkbox', { name: 'Mittlerer arterieller Druck gemessen' }),
  ).not.toBeChecked()
})

/** All three switched off is not a measurement, and the sheet says so by refusing to save. */
test('a reading with nothing measured cannot be saved', async ({ page }) => {
  await openEntry(page, 'Blutdruck')

  for (const name of [
    'Blutdruck systolisch gemessen',
    'Mittlerer arterieller Druck gemessen',
    'Blutdruck diastolisch gemessen',
  ]) {
    await page.getByRole('checkbox', { name }).click()
  }

  await expect(page.getByRole('button', { name: 'Übernehmen' })).toBeDisabled()
})

/** One cuff inflation is one act, so taking it back is one undo rather than three. */
test('undo takes back the whole reading', async ({ page }) => {
  const counts = async () => ({
    systolic: (await storedVitals(page, 'bloodPressureSystolic')).length,
    mean: (await storedVitals(page, 'bloodPressureMean')).length,
    diastolic: (await storedVitals(page, 'bloodPressureDiastolic')).length,
  })
  const before = await counts()

  await openEntry(page, 'Blutdruck')
  await commit(page)
  expect((await counts()).systolic).toBe(before.systolic + 1)

  await page.getByRole('button', { name: 'Rückgängig' }).click()

  expect(await counts()).toEqual(before)
})

test('leaving the sheet records nothing', async ({ page }) => {
  const before = await storedVitals(page, 'temperature')

  await openEntry(page, 'Temperatur')
  await page.getByRole('button', { name: 'Temperatur erhöhen' }).click()
  // A lane's sheet has no step behind it to go back to, so the way out is out.
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  expect(await storedVitals(page, 'temperature')).toHaveLength(before.length)
})
