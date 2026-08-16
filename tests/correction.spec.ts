import { expect, test, type Page } from '@playwright/test'

/**
 * Correcting a value directly on the timeline. This is the interaction the brief grades hardest,
 * so the assertions go all the way to what was written to storage rather than stopping at what
 * the chart looks like.
 */

const STORAGE_KEY = 'anesthesia-record:case'

/** The entry as it currently exists in local storage, which is the record of truth. */
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

async function centreOf(page: Page, id: string) {
  const box = await page.locator(`[data-entry-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`no marker for ${id}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.beforeEach(async ({ page }) => {
  // Every test gets a fresh browser context with empty storage, so the app seeds the demo case
  // itself. Clearing via addInitScript would run again on reload and wipe what a test just wrote.
  await page.goto('/')
})

test('dragging a point upward raises its value and saves it', async ({ page }) => {
  const before = await storedEntry(page, 'demo-heartRate-30')
  expect(before.value).toBe(81)
  expect(before.revisions).toEqual([])

  const from = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Up the screen is up the axis: the value must increase.
  await page.mouse.move(from.x, from.y - 20, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByText(/^Gespeichert /)).toBeVisible()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBeGreaterThan(before.value)
  expect(after.revisions).toHaveLength(1)
  expect(after.revisions[0].previous.value).toBe(81)
})

test('dragging left moves the entry earlier in time', async ({ page }) => {
  const before = await storedEntry(page, 'demo-heartRate-30')

  const from = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 40, from.y, { steps: 8 })
  await page.mouse.up()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.at).toBeLessThan(before.at)
  expect(after.revisions[0].previous.at).toBe(before.at)
})

test('a correction survives a reload', async ({ page }) => {
  const from = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y - 20, { steps: 8 })
  await page.mouse.up()

  const corrected = await storedEntry(page, 'demo-heartRate-30')

  await page.reload()

  const afterReload = await storedEntry(page, 'demo-heartRate-30')
  expect(afterReload.value).toBe(corrected.value)
  expect(afterReload.revisions).toHaveLength(1)
})

test('a tap selects a point without moving it', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.click(at.x, at.y)

  // The readout names the selected point, which is what makes the value exact rather than
  // approximate while it is being adjusted.
  await expect(page.locator('text=/HF 81 \\/min/')).toBeVisible()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(81)
  expect(after.revisions).toEqual([])
})

test('arrow keys adjust the selected point by exactly one step', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.click(at.x, at.y)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(84)
  expect(after.revisions).toHaveLength(3)
})

test('the value cannot be pushed past the top of the axis', async ({ page }) => {
  const from = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Far above the lane, and out of the plot entirely.
  await page.mouse.move(from.x, from.y - 600, { steps: 12 })
  await page.mouse.up()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(180) // the Herzfrequenz axis maximum
})

test('delete removes a point from the chart but keeps it in the record', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.click(at.x, at.y)
  await page.keyboard.press('Delete')

  await expect(page.locator('[data-entry-id="demo-heartRate-30"]')).toHaveCount(0)

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.deletedAt).not.toBeNull()
})

/**
 * The readout over a selected point, as the way into that value's entry sheet.
 *
 * These are the paths a drag cannot express. Removal above needs a hardware `Delete` key, which an
 * iPad does not have; the revisions are stored on every correction and were shown nowhere; and an
 * exact number is a matter of aiming as long as the chart is the only control.
 */
const sheet = (page: Page) => page.getByRole('dialog')

/** Selects a point and opens its sheet through the readout. */
async function openReadout(page: Page, id: string) {
  const at = await centreOf(page, id)
  await page.mouse.click(at.x, at.y)
  await page.locator(`[data-readout="${id}"]`).click()
  await expect(sheet(page)).toBeVisible()
}

test('the readout opens the selected value in the entry sheet', async ({ page }) => {
  await openReadout(page, 'demo-heartRate-30')

  await expect(sheet(page).getByText('Herzfrequenz')).toBeVisible()
  // The sheet opens on the value that was tapped rather than on a fresh entry.
  await expect(sheet(page).locator('.value-field__number')).toHaveText('81')
})

test('a value can be removed from its sheet, with no keyboard involved', async ({ page }) => {
  await openReadout(page, 'demo-heartRate-30')
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()

  await expect(page.locator('[data-entry-id="demo-heartRate-30"]')).toHaveCount(0)

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.deletedAt).not.toBeNull()
})

test('the sheet corrects a value to an exact number', async ({ page }) => {
  await openReadout(page, 'demo-heartRate-30')

  await sheet(page).getByRole('button', { name: 'Herzfrequenz erhöhen' }).click()
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(sheet(page)).toBeHidden()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(82)
  expect(after.revisions[0].previous.value).toBe(81)
})

test('the sheet shows what the value was before it was corrected', async ({ page }) => {
  const from = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y - 20, { steps: 8 })
  await page.mouse.up()

  await openReadout(page, 'demo-heartRate-30')

  // The trail is stored on every correction; this is the only place a vital's is legible.
  await expect(sheet(page).getByText('Änderungen')).toBeVisible()
  await expect(sheet(page).getByText(/Wert 81/)).toBeVisible()
})

test('the keyboard reaches the sheet from a selected point', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.mouse.click(at.x, at.y)

  await page.keyboard.press('Enter')

  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByText('Herzfrequenz')).toBeVisible()
})
