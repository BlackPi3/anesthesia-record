import { expect, test } from '@playwright/test'

/**
 * Smoke coverage for the record as it renders today: the case header, the four lanes, and the
 * medication and event bands. Entry and correction get their own tests as the interaction lands.
 */

test.beforeEach(async ({ page }) => {
  // Each test gets a fresh browser context with empty storage, so the app seeds the demo case on
  // the first visit. Nothing clears storage here: an addInitScript clear would run again on every
  // reload, which would silently defeat the persistence test below.
  await page.goto('/')
})

test('shows the case header with the demo patient', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await expect(page.getByText('Arthroskopie rechtes Knie')).toBeVisible()
  await expect(page.getByText('Demodaten')).toBeVisible()
  await expect(page.getByText('12.08.2026')).toBeVisible()
})

test('draws one lane per vital parameter plus the bands', async ({ page }) => {
  // Lanes are groups rather than images: they take focus and accept keyboard correction.
  for (const label of [
    /Sauerstoffsättigung, Achse/,
    /Herzfrequenz, Achse/,
    /Blutdruck, Achse/,
    /Temperatur, Achse/,
  ]) {
    await expect(page.getByRole('group', { name: label })).toBeVisible()
  }

  // The bands are groups rather than images: each row is a control that opens the entry for
  // editing, so they hold interactive children and are no longer a picture of the data.
  await expect(page.getByRole('group', { name: 'Medikamente und Infusionen' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ereignisse' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Zeitachse von/ })).toBeVisible()
})

test('restores the stored case after a reload rather than seeding a new one', async ({ page }) => {
  // Comparing the saved timestamp is what makes this test mean something: a screen that merely
  // looks right would also appear if the app had thrown the case away and re-seeded it.
  const savedAt = () =>
    page.evaluate(() => JSON.parse(window.localStorage.getItem('anesthesia-record:case')!).savedAt)

  const before = await savedAt()
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Blutdruck, Achse/ })).toBeVisible()
  expect(await savedAt()).toBe(before)
})

test('reports a clear error when the stored case is corrupt', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anesthesia-record:case', '{ this is not json')
  })
  await page.reload()

  await expect(page.getByText('Das Protokoll konnte nicht geladen werden')).toBeVisible()
  await expect(page.getByText(/beschädigt/)).toBeVisible()
})

test('says so when the record holds nothing yet', async ({ page }) => {
  // Emptied through the app's own stored envelope rather than a hand-written one, so the test
  // cannot pass against a storage format the app no longer writes.
  await page.evaluate(() => {
    const key = 'anesthesia-record:case'
    const envelope = JSON.parse(window.localStorage.getItem(key)!)
    envelope.case.entries = []
    window.localStorage.setItem(key, JSON.stringify(envelope))
  })
  await page.reload()

  await expect(page.getByText('Noch keine Einträge')).toBeVisible()
  await expect(page.getByText(/„Erfassen“ an der jeweiligen Zeile/)).toBeVisible()

  // The lanes stay: an empty record is the chart before anything is written on it, not a
  // different screen.
  await expect(page.getByRole('group', { name: /Herzfrequenz, Achse/ })).toBeVisible()
})

test('the message goes as soon as there is something to show', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'anesthesia-record:case'
    const envelope = JSON.parse(window.localStorage.getItem(key)!)
    envelope.case.entries = []
    window.localStorage.setItem(key, JSON.stringify(envelope))
  })
  await page.reload()
  await expect(page.getByText('Noch keine Einträge')).toBeVisible()

  await page.getByRole('button', { name: 'Ereignis erfassen' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Narkosebeginn' }).click()
  await sheet.getByRole('button', { name: 'Übernehmen' }).click()

  await expect(page.getByText('Noch keine Einträge')).toBeHidden()
})

test('does not scroll sideways at either form factor', async ({ page }) => {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

/**
 * A value that falls outside its lane's band.
 *
 * The bands are deliberately narrow, so an unusual reading can land past the end of one — and a
 * desaturation is precisely the reading the saturation lane exists for. It has to stay on the
 * chart: a record that quietly drops the one measurement anybody would go looking for is worse
 * than an axis with nothing in it. It is drawn against the edge it went past, and it keeps its
 * own number wherever that number is written.
 */
test('draws a value past the end of a band at the edge rather than dropping it', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Sauerstoffsättigung erfassen' }).click()
  const sheet = page.getByRole('dialog')
  for (const digit of '88') {
    await sheet.getByRole('button', { name: digit, exact: true }).click()
  }
  await sheet.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(sheet).toBeHidden()

  const stored = await page.evaluate(() => {
    const envelope = JSON.parse(window.localStorage.getItem('anesthesia-record:case')!)
    const saturations = envelope.case.entries.filter(
      (entry: { type: string; vital?: string }) => entry.type === 'vital' && entry.vital === 'spo2',
    )
    return saturations[saturations.length - 1]
  })
  expect(stored.value).toBe(88)

  const marker = page.locator(`[data-entry-id="${stored.id}"]`)
  await expect(marker).toBeVisible()

  const lane = page.getByRole('group', { name: /Sauerstoffsättigung, Achse/ })
  const laneBox = (await lane.boundingBox())!
  const markerBox = (await marker.boundingBox())!
  // Inside its own lane, and down against the floor of it rather than off below the axis.
  expect(markerBox.y).toBeGreaterThan(laneBox.y + laneBox.height / 2)
  expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(laneBox.y + laneBox.height + 1)

  // The number it reads out is the number that was recorded, not the edge it is resting against.
  await page.mouse.click(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2)
  await expect(page.locator(`[data-readout="${stored.id}"]`)).toHaveAttribute('aria-label', /88 %/)
})
