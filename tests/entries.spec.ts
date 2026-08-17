import { expect, test, type Page } from '@playwright/test'

/**
 * Medications, fluids and phase events: writing them down, correcting them, removing them.
 *
 * Like the other suites, the assertions run through to what local storage holds. A bar appearing
 * in the medication band is not evidence that anything was recorded, and the audit trail is the
 * part the brief grades — so the revisions are asserted, not just the current value.
 */

const STORAGE_KEY = 'anesthesia-record:case'

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

/** The sheet, which every selector is scoped to: the bands expose buttons with the same names. */
const sheet = (page: Page) => page.getByRole('dialog')

async function openSheet(page: Page, band: 'Medikament' | 'Ereignis') {
  await page.getByRole('button', { name: `${band} erfassen` }).click()
}

async function commit(page: Page) {
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('records a bolus with its dose, unit and time', async ({ page }) => {
  const before = await storedEntries(page, 'bolus')

  await openSheet(page, 'Medikament')
  await sheet(page).getByRole('button', { name: 'Midazolam' }).click()

  // Nothing may be saved until an amount is set: a dose of zero is not a dose, and the control
  // opens there rather than inventing a plausible number.
  await expect(sheet(page).getByRole('button', { name: 'Übernehmen' })).toBeDisabled()

  await sheet(page).getByRole('button', { name: 'Dosis erhöhen' }).click()
  await sheet(page).getByRole('button', { name: 'Dosis erhöhen' }).click()
  await expect(sheet(page).locator('.value-field__number')).toHaveText('2')

  await commit(page)
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()

  const after = await storedEntries(page, 'bolus')
  expect(after).toHaveLength(before.length + 1)

  const created = after[after.length - 1]
  expect(created).toMatchObject({ drug: 'Midazolam', dose: 2, unit: 'mg', deletedAt: null })
  expect(created.revisions).toEqual([])
})

test('records a fluid as an infusion that is still running', async ({ page }) => {
  await openSheet(page, 'Medikament')
  await sheet(page).getByText('Dauerinfusion', { exact: true }).click()
  await sheet(page).getByRole('button', { name: 'NaCl 0,9 %' }).click()

  await sheet(page).getByRole('button', { name: 'Rate erhöhen' }).click()
  // An infusion being documented while it runs is the normal case, not missing data.
  await expect(sheet(page).locator('.time-field__clock--running')).toHaveText('läuft')

  await commit(page)

  const created = (await storedEntries(page, 'infusion')).at(-1)
  expect(created).toMatchObject({ drug: 'NaCl 0,9 %', unit: 'ml/h', endedAt: null })
  expect(created.rate).toBeGreaterThan(0)
})

test('tapping a medication in the band opens it prefilled and corrects it', async ({ page }) => {
  const row = page.getByRole('button', { name: /^Propofol, Bolus/ })
  await expect(row).toBeVisible()
  await row.click()

  // Prefilled from the entry, which is what makes this a correction rather than a re-entry.
  await expect(sheet(page)).toContainText('Propofol · Bolus')
  await expect(sheet(page).locator('.value-field__number')).toHaveText('150')

  await sheet(page).getByRole('button', { name: 'Dosis verringern' }).click()
  await commit(page)

  const corrected = (await storedEntries(page, 'bolus')).find(
    (entry: { drug: string }) => entry.drug === 'Propofol',
  )
  expect(corrected.dose).toBe(149)
  expect(corrected.revisions).toHaveLength(1)
  expect(corrected.revisions[0].previous).toMatchObject({ dose: 150, unit: 'mg' })
})

test('a running infusion can be stopped from the band', async ({ page }) => {
  // Create one that is running, since both demo infusions are already finished.
  await openSheet(page, 'Medikament')
  await sheet(page).getByText('Dauerinfusion', { exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Glucose 5 %' }).click()
  await sheet(page).getByRole('button', { name: 'Rate erhöhen' }).click()
  await commit(page)

  expect((await storedEntries(page, 'infusion')).at(-1).endedAt).toBeNull()

  await page.getByRole('button', { name: /^Glucose 5 %, Dauerinfusion/ }).click()
  await sheet(page).getByRole('button', { name: 'Jetzt beenden' }).click()
  await commit(page)

  const stopped = (await storedEntries(page, 'infusion')).at(-1)
  expect(stopped.endedAt).not.toBeNull()
  // Stopping is a correction, so the open end stays in the trail.
  expect(stopped.revisions).toHaveLength(1)
  expect(stopped.revisions[0].previous.endedAt).toBeNull()
})

test('records a phase event and shows it in the band', async ({ page }) => {
  const before = await storedEntries(page, 'event')
  // The demo case already documents all five milestones, so this adds a second Naht. That is
  // allowed on purpose: a case can be cut and sutured more than once, and nothing rejects a
  // repeat.
  await expect(page.getByRole('button', { name: /^Naht, / })).toHaveCount(1)

  await openSheet(page, 'Ereignis')
  await sheet(page).getByRole('button', { name: 'Naht' }).click()
  await commit(page)

  const after = await storedEntries(page, 'event')
  expect(after).toHaveLength(before.length + 1)
  expect(after.at(-1)).toMatchObject({ event: 'suture', deletedAt: null })

  await expect(page.getByRole('button', { name: /^Naht, / })).toHaveCount(2)
})

test('an event can be removed from the chart but stays in the record', async ({ page }) => {
  await page.getByRole('button', { name: /^Schnitt, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await expect(page.getByRole('button', { name: /^Schnitt, / })).toHaveCount(0)

  const events = await storedEntries(page, 'event')
  const removed = events.find((entry: { event: string }) => entry.event === 'incision')
  expect(removed.deletedAt).not.toBeNull()
})

test('the audit trail is shown to whoever is about to correct the entry again', async ({
  page,
}) => {
  await page.getByRole('button', { name: /^Ondansetron, Bolus/ }).click()
  // Nothing has been changed yet, so there is no history to show.
  await expect(sheet(page).getByText('Änderungen')).toHaveCount(0)

  await sheet(page).getByRole('button', { name: '5 Minuten früher' }).click()
  await commit(page)

  await page.getByRole('button', { name: /^Ondansetron, Bolus/ }).click()
  await expect(sheet(page).getByText('Änderungen')).toBeVisible()
  await expect(sheet(page).locator('.history__item')).toHaveCount(1)
  await expect(sheet(page).locator('.history__previous')).toContainText('Dosis 4')
})

test('a correction to a medication survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: /^Rocuronium, Bolus/ }).click()
  await sheet(page).getByRole('button', { name: 'Dosis erhöhen' }).click()
  await commit(page)

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  await page.reload()
  const restored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)

  expect(restored).toBe(stored)
})
