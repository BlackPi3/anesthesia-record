import { expect, test, type Page } from '@playwright/test'

/**
 * Undo: one step back, including the audit trail.
 *
 * Every mutation returns a whole new case, so undo restores the case that was replaced rather than
 * inverting what was done to it. That is why these assertions check the revisions as well as the
 * value: a correction that has been undone leaves no trace, because it is a correction that was
 * not made. The record on disk has to say the same, which is why they read storage.
 */

const STORAGE_KEY = 'anesthesia-record:case'

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

async function storedCount(page: Page, type: string) {
  return page.evaluate(
    ([key, wanted]) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) throw new Error('nothing stored')
      const envelope = JSON.parse(raw)
      return envelope.case.entries.filter((entry: { type: string }) => entry.type === wanted).length
    },
    [STORAGE_KEY, type] as const,
  )
}

const undoButton = (page: Page) => page.getByRole('button', { name: /rückgängig/i })

/** Drags the demo heart rate upward, which is the change most of these tests then take back. */
async function raiseHeartRate(page: Page) {
  const box = await page.locator('[data-entry-id="demo-heartRate-30"]').boundingBox()
  if (!box) throw new Error('no marker')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 20, { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('there is nothing to undo until something is changed', async ({ page }) => {
  await expect(undoButton(page)).toBeDisabled()

  await raiseHeartRate(page)

  await expect(undoButton(page)).toBeEnabled()
})

test('undo takes back a correction, trail and all', async ({ page }) => {
  await raiseHeartRate(page)

  const corrected = await storedEntry(page, 'demo-heartRate-30')
  expect(corrected.value).toBeGreaterThan(81)
  expect(corrected.revisions).toHaveLength(1)

  await undoButton(page).click()

  const restored = await storedEntry(page, 'demo-heartRate-30')
  expect(restored.value).toBe(81)
  // The correction was not made, so the record does not say it was.
  expect(restored.revisions).toEqual([])
})

test('undo brings back a removed value', async ({ page }) => {
  const box = await page.locator('[data-entry-id="demo-heartRate-30"]').boundingBox()
  if (!box) throw new Error('no marker')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-entry-id="demo-heartRate-30"]')).toHaveCount(0)

  await undoButton(page).click()

  await expect(page.locator('[data-entry-id="demo-heartRate-30"]')).toHaveCount(1)
  const restored = await storedEntry(page, 'demo-heartRate-30')
  expect(restored.deletedAt).toBeNull()
})

test('undo takes back a newly recorded entry', async ({ page }) => {
  const before = await storedCount(page, 'event')

  await page.getByRole('button', { name: 'Ereignis erfassen' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Schnitt' }).click()
  await sheet.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await storedCount(page, 'event')).toBe(before + 1)

  await undoButton(page).click()

  expect(await storedCount(page, 'event')).toBe(before)
})

test('an undone change is saved, not just shown', async ({ page }) => {
  await raiseHeartRate(page)
  await undoButton(page).click()

  await page.reload()

  const afterReload = await storedEntry(page, 'demo-heartRate-30')
  expect(afterReload.value).toBe(81)
  expect(afterReload.revisions).toEqual([])
  // And the reload is where undo stops: what survives is the record as documented.
  await expect(undoButton(page)).toBeDisabled()
})

test('undo walks back several changes one at a time', async ({ page }) => {
  const box = await page.locator('[data-entry-id="demo-heartRate-30"]').boundingBox()
  if (!box) throw new Error('no marker')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  expect((await storedEntry(page, 'demo-heartRate-30')).value).toBe(84)

  await undoButton(page).click()
  expect((await storedEntry(page, 'demo-heartRate-30')).value).toBe(83)

  await undoButton(page).click()
  await undoButton(page).click()

  const back = await storedEntry(page, 'demo-heartRate-30')
  expect(back.value).toBe(81)
  expect(back.revisions).toEqual([])
  await expect(undoButton(page)).toBeDisabled()
})

test('Ctrl+Z undoes wherever the focus happens to be', async ({ page }) => {
  await raiseHeartRate(page)

  // Focus is on the lane after a drag, which is the point: the shortcut is on the window.
  await page.keyboard.press('ControlOrMeta+z')

  const restored = await storedEntry(page, 'demo-heartRate-30')
  expect(restored.value).toBe(81)
  expect(restored.revisions).toEqual([])
})
