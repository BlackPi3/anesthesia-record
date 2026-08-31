import { expect, test, type Page } from '@playwright/test'

/**
 * The completeness check: when the chip appears, what it says, and that pressing a flag is a route
 * into the entry sheet rather than the app writing anything itself.
 *
 * Half of the rules here are about staying quiet, and a test that only asserts silence would pass
 * against a check that does nothing at all. So every silent case is paired with the record one
 * field away that must raise a flag: an infusion left running is fine until the record also says
 * the patient went home, and it is that pair, not either half, that pins the rule down.
 *
 * The assertions run through to storage where an entry was written, because a chip disappearing is
 * evidence about the chip and the record is what the brief grades.
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

/** The chip, addressed by what it is for rather than by the count it happens to be showing. */
const chip = (page: Page) => page.getByRole('button', { name: /im Protokoll, Liste öffnen$/ })

const sheet = (page: Page) => page.getByRole('dialog')

async function commit(page: Page) {
  await sheet(page).getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

/** Opens the list and returns the row for one flag. */
function flag(page: Page, lead: string | RegExp) {
  return sheet(page).getByRole('button').filter({ hasText: lead })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('the demo case is complete, so the header carries no chip at all', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  // Not a chip reading „Vollständig“: nothing at all. The header pays no pixels for a sound record.
  await expect(chip(page)).toHaveCount(0)
})

test('a milestone stepped over is flagged, with the entry that proves it', async ({ page }) => {
  // Remove Schnitt through the band, which is how it would actually go missing.
  await page.getByRole('button', { name: /^Schnitt, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await expect(chip(page)).toHaveText('Offen (1)')
  await chip(page).click()

  const row = flag(page, 'Schnitt nicht erfasst')
  await expect(row).toBeVisible()
  // Naht at minute 41 of a case starting 08:30. The flag shows its working rather than asking to
  // be believed, and it names the *nearest* milestone after the gap, not the last one.
  await expect(row).toContainText('Naht ist um 09:11 erfasst')
})

test('the flag opens the sheet on that milestone, and the entry is still the user’s', async ({
  page,
}) => {
  await page.getByRole('button', { name: /^Schnitt, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await chip(page).click()
  await flag(page, 'Schnitt nicht erfasst').click()

  // Straight onto Schnitt, with no picker step: the flag already named the milestone. And it is a
  // draft waiting for „Übernehmen“ — nothing has been written yet, which is the whole rule.
  await expect(sheet(page)).toContainText('Schnitt')
  await expect(sheet(page).getByRole('button', { name: 'Ereignis auswählen' })).toHaveCount(0)
  expect(
    (await storedEntries(page, 'event')).filter(
      (entry: { event: string; deletedAt: number | null }) =>
        entry.event === 'incision' && entry.deletedAt === null,
    ),
  ).toHaveLength(0)

  await commit(page)

  const recorded = (await storedEntries(page, 'event')).filter(
    (entry: { event: string; deletedAt: number | null }) =>
      entry.event === 'incision' && entry.deletedAt === null,
  )
  expect(recorded).toHaveLength(1)
  await expect(chip(page)).toHaveCount(0)
})

test('removing the last milestone raises nothing — a case can simply not be there yet', async ({
  page,
}) => {
  // Entlassung is the end of the record, so nothing in the record contradicts its absence. This is
  // the pair to the test above: the same act on a milestone with something after it flags, and on
  // the last one it does not.
  await page.getByRole('button', { name: /^Entlassung, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await expect(chip(page)).toHaveCount(0)
})

test('an infusion is only open once the record says the patient went home', async ({ page }) => {
  // Set the Ringer infusion running again, with Entlassung removed first: a running infusion in a
  // case that has not been discharged is the normal state and must stay silent.
  await page.getByRole('button', { name: /^Entlassung, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: /^Ringer-Acetat, Dauerinfusion/ }).click()
  await sheet(page).getByRole('button', { name: 'Läuft weiter' }).click()
  await commit(page)

  expect(
    (await storedEntries(page, 'infusion')).find(
      (entry: { drug: string }) => entry.drug === 'Ringer-Acetat',
    ).endedAt,
  ).toBeNull()
  await expect(chip(page)).toHaveCount(0)

  // Now document the discharge. The same infusion, unchanged, becomes a gap.
  await page.getByRole('button', { name: 'Ereignis erfassen' }).click()
  await sheet(page).getByRole('button', { name: 'Entlassung' }).click()
  await commit(page)

  await expect(chip(page)).toHaveText('Offen (1)')
  await chip(page).click()
  await expect(flag(page, 'Ringer-Acetat: Dauerinfusion ohne Ende')).toBeVisible()
})

test('the flag opens the infusion so its end can be entered', async ({ page }) => {
  await page.getByRole('button', { name: /^Ringer-Acetat, Dauerinfusion/ }).click()
  await sheet(page).getByRole('button', { name: 'Läuft weiter' }).click()
  await commit(page)

  await expect(chip(page)).toHaveText('Offen (1)')
  await chip(page).click()
  await flag(page, 'Ringer-Acetat: Dauerinfusion ohne Ende').click()

  await expect(sheet(page)).toContainText('Ringer-Acetat · Dauerinfusion')
  await sheet(page).getByRole('button', { name: 'Jetzt beenden' }).click()
  await commit(page)

  const stopped = (await storedEntries(page, 'infusion')).find(
    (entry: { drug: string }) => entry.drug === 'Ringer-Acetat',
  )
  expect(stopped.endedAt).not.toBeNull()
  await expect(chip(page)).toHaveCount(0)
})

/**
 * The unit check is the one rule nothing in the interface can trigger, because `unit` is a
 * required field of the entry union and the sheet cannot produce a dose without one. What it
 * guards is the other way in: `isEntry` in storage.ts confirms an entry's id, type and timestamps
 * and stops there, so a hand-edited or older envelope loads a dose with nothing after the number.
 *
 * So this test edits the app's own stored envelope rather than writing one of its own, and then
 * reloads — which is also the only honest way to prove the rule fires at all.
 */
test('a dose with no unit is flagged, and the flag opens it to be completed', async ({ page }) => {
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) throw new Error('nothing stored')
    const envelope = JSON.parse(raw)
    const bolus = envelope.case.entries.find(
      (entry: { id: string }) => entry.id === 'demo-bolus-propofol',
    )
    delete bolus.unit
    window.localStorage.setItem(key, JSON.stringify(envelope))
  }, STORAGE_KEY)
  await page.reload()

  await expect(chip(page)).toHaveText('Offen (1)')
  await chip(page).click()

  const row = flag(page, 'Propofol: Einheit fehlt')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Bolus um 08:31')
  await row.click()

  await expect(sheet(page)).toContainText('Propofol · Bolus')
  await sheet(page).locator('.unit-picker').getByText('mg', { exact: true }).click()
  await commit(page)

  const corrected = (await storedEntries(page, 'bolus')).find(
    (entry: { id: string }) => entry.id === 'demo-bolus-propofol',
  )
  expect(corrected.unit).toBe('mg')
  await expect(chip(page)).toHaveCount(0)
})

test('the count adds up across the three checks', async ({ page }) => {
  await page.getByRole('button', { name: /^Schnitt, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: /^Ringer-Acetat, Dauerinfusion/ }).click()
  await sheet(page).getByRole('button', { name: 'Läuft weiter' }).click()
  await commit(page)

  await expect(chip(page)).toHaveText('Offen (2)')
  await chip(page).click()
  // In the order the three checks are named, milestones in the order of the case.
  await expect(sheet(page).locator('.flags__lead')).toHaveText([
    'Schnitt nicht erfasst',
    'Ringer-Acetat: Dauerinfusion ohne Ende',
  ])
})

test('undo takes the chip back with the change that raised it', async ({ page }) => {
  await page.getByRole('button', { name: /^Schnitt, / }).click()
  await sheet(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(chip(page)).toHaveText('Offen (1)')

  await page.getByRole('button', { name: 'Letzte Änderung rückgängig machen' }).click()

  // The check reads the record and holds no state of its own, so putting the record back puts the
  // header back. Worth asserting rather than assuming: a cached count would survive an undo.
  await expect(chip(page)).toHaveCount(0)
})
