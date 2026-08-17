import { expect, test, type Page } from '@playwright/test'

/**
 * Typing a value on the keypad.
 *
 * The entry sheet takes numbers as digits, so these are the tests of the fastest path through the
 * app: read a number off a monitor, type it, save. They assert through to local storage for the
 * reason the other suites do — a readout showing 133 is not evidence that 133 was recorded.
 *
 * Both ways in are covered: the on-screen keys, which is what an iPad has, and a physical
 * keyboard, which is what a desktop has and which the sheet hands its focus to on open.
 */

const STORAGE_KEY = 'anesthesia-record:case'

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

const sheet = (page: Page) => page.getByRole('dialog')

async function openEntry(page: Page, lane: string) {
  await page.getByRole('button', { name: `${lane} erfassen` }).click()
}

/** Presses the on-screen keys, the way a finger does. */
async function tap(page: Page, keys: string) {
  for (const key of keys) {
    await sheet(page).getByRole('button', { name: key === ',' ? 'Komma' : key, exact: true }).click()
  }
}

async function commit(page: Page) {
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('the first digit replaces the value the sheet opened on', async ({ page }) => {
  await openEntry(page, 'Herzfrequenz')
  // The sheet opens on the last heart rate in the case, and 8 has to mean 8 rather than 758.
  await expect(sheet(page).locator('.value-field__number')).toHaveText('75')

  await tap(page, '8')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('8')

  await tap(page, '5')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('85')

  await commit(page)
  expect((await storedVitals(page, 'heartRate')).at(-1).value).toBe(85)
})

test('a decimal value is typed with the comma key', async ({ page }) => {
  await openEntry(page, 'Temperatur')

  await tap(page, '36,8')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('36,8')

  await commit(page)
  expect((await storedVitals(page, 'temperature')).at(-1).value).toBeCloseTo(36.8, 5)
})

test('a mistyped digit is taken back one at a time', async ({ page }) => {
  await openEntry(page, 'Herzfrequenz')

  await tap(page, '148')
  await sheet(page).getByRole('button', { name: 'Ziffer löschen' }).click()
  await expect(sheet(page).locator('.value-field__number')).toHaveText('14')

  await tap(page, '5')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('145')
})

/** The one typo a keypad makes easy is a digit too many, and it is the one the field refuses. */
test('a digit that would pass the metric maximum does not land', async ({ page }) => {
  await openEntry(page, 'Sauerstoffsättigung')

  await tap(page, '100')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('100')

  await tap(page, '5')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('100')
})

/**
 * The lower bound cannot be enforced while typing — 45 starts as 4 — so it is enforced where the
 * number can be judged whole: the sheet refuses to save it and the range says why.
 */
test('a value below the metric minimum cannot be saved', async ({ page }) => {
  await openEntry(page, 'Sauerstoffsättigung')

  await tap(page, '4')
  await expect(sheet(page).locator('.value-field__range')).toHaveClass(/--out/)
  await expect(sheet(page).getByRole('button', { name: 'Übernehmen' })).toBeDisabled()

  await tap(page, '5')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('45')
  await expect(sheet(page).getByRole('button', { name: 'Übernehmen' })).toBeDisabled()

  const backspace = sheet(page).getByRole('button', { name: 'Ziffer löschen' })
  await backspace.click()
  await backspace.click()
  await tap(page, '95')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('95')
  await expect(sheet(page).getByRole('button', { name: 'Übernehmen' })).toBeEnabled()
})

test('deleting every digit leaves a zero the sheet will not save', async ({ page }) => {
  await openEntry(page, 'Herzfrequenz')

  const backspace = sheet(page).getByRole('button', { name: 'Ziffer löschen' })
  await backspace.click()
  await backspace.click()

  await expect(sheet(page).locator('.value-field__number')).toHaveText('0')
  await expect(sheet(page).getByRole('button', { name: 'Übernehmen' })).toBeDisabled()
})

/**
 * On a desktop the sheet opens with the field focused, so the number is typed without clicking
 * into anything first. This is the whole reason the drawer hands its focus over.
 */
test('a desktop keyboard types straight into the sheet it opened', async ({ page }) => {
  await openEntry(page, 'Herzfrequenz')

  await page.keyboard.type('118')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('118')

  // The arrows step by the metric's step, as they do on a selected point on the chart.
  await page.keyboard.press('ArrowUp')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('119')

  await page.keyboard.press('Backspace')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('11')

  await page.keyboard.type('2')
  await commit(page)
  expect((await storedVitals(page, 'heartRate')).at(-1).value).toBe(112)
})

/** Ctrl+Z stays the app's, not the field's, wherever the focus happens to be. */
test('typing does not swallow the undo shortcut', async ({ page }) => {
  await openEntry(page, 'Herzfrequenz')
  await page.keyboard.type('90')
  await commit(page)

  const before = await storedVitals(page, 'heartRate')
  await page.keyboard.press('Control+z')
  expect(await storedVitals(page, 'heartRate')).toHaveLength(before.length - 1)
})

/**
 * The blood pressure sheet has one keypad and three numbers, so which row it writes into is part
 * of the entry. Tapping a number is what points the keypad at it.
 */
test('one keypad types all three pressures, in the order they are read out', async ({ page }) => {
  await openEntry(page, 'Blutdruck')

  // Systolic is selected on arrival: it is the number a reading starts with.
  await expect(sheet(page).getByRole('button', { name: /^Blutdruck systolisch:/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await tap(page, '128')
  await expect(sheet(page).locator('.pressure__notation')).toHaveText('128/80 (98)')

  await sheet(page).getByRole('button', { name: /^Blutdruck diastolisch:/ }).click()
  await tap(page, '74')
  await expect(sheet(page).locator('.pressure__notation')).toHaveText('128/74 (98)')

  await sheet(page).getByRole('button', { name: /^Mittlerer arterieller Druck:/ }).click()
  await tap(page, '92')
  await expect(sheet(page).locator('.pressure__notation')).toHaveText('128/74 (92)')

  await commit(page)

  const at = (await storedVitals(page, 'bloodPressureSystolic')).at(-1)
  expect(at.value).toBe(128)
  expect((await storedVitals(page, 'bloodPressureDiastolic')).at(-1).value).toBe(74)
  expect((await storedVitals(page, 'bloodPressureMean')).at(-1).value).toBe(92)
})

/** A number typed into a row is as clear a statement as there is that it was measured. */
test('typing into a switched-off pressure switches it back on', async ({ page }) => {
  await openEntry(page, 'Blutdruck')

  await page.getByRole('checkbox', { name: 'Mittlerer arterieller Druck gemessen' }).click()
  await expect(sheet(page).locator('.pressure__notation')).toHaveText('133/80 (–)')

  await sheet(page).getByRole('button', { name: /^Mittlerer arterieller Druck:/ }).click()
  await tap(page, '95')

  await expect(
    page.getByRole('checkbox', { name: 'Mittlerer arterieller Druck gemessen' }),
  ).toBeChecked()
  await expect(sheet(page).locator('.pressure__notation')).toHaveText('133/80 (95)')
})

/**
 * Correcting is the same field opened on the number already stored, and it is focused there too:
 * a value read back wrong is retyped, not stepped from 81 to 66.
 */
test('a stored value is retyped in the correcting sheet', async ({ page }) => {
  const box = await page.locator('[data-entry-id="demo-heartRate-30"]').boundingBox()
  if (!box) throw new Error('no marker for demo-heartRate-30')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.locator('[data-readout="demo-heartRate-30"]').click()
  await expect(sheet(page)).toBeVisible()

  await expect(sheet(page).locator('.value-field__number')).toHaveText('81')

  await page.keyboard.type('66')
  await commit(page)

  const after = (await storedVitals(page, 'heartRate')).find(
    (entry: { id: string }) => entry.id === 'demo-heartRate-30',
  )
  expect(after.value).toBe(66)
  expect(after.revisions.at(-1).previous.value).toBe(81)
})
