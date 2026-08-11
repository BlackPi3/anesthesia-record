import { expect, test } from '@playwright/test'

/**
 * Smoke coverage for the record as it renders today: the case header, the four lanes, and the
 * medication and event bands. Entry and correction get their own tests as the interaction lands.
 */

test.beforeEach(async ({ page }) => {
  // Each test starts from a first visit, so the app seeds the demo case itself.
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
})

test('shows the case header with the demo patient', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await expect(page.getByText('Arthroskopie rechtes Knie')).toBeVisible()
  await expect(page.getByText('Demodaten')).toBeVisible()
  await expect(page.getByText('12.08.2026')).toBeVisible()
})

test('draws one lane per vital parameter plus the bands', async ({ page }) => {
  for (const label of [
    /Sauerstoffsättigung, Achse/,
    /Herzfrequenz, Achse/,
    /Blutdruck, Achse/,
    /Temperatur, Achse/,
  ]) {
    await expect(page.getByRole('img', { name: label })).toBeVisible()
  }

  await expect(page.getByRole('img', { name: 'Medikamente und Infusionen' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Ereignisse' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Zeitachse von/ })).toBeVisible()
})

test('keeps the case after a reload', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Blutdruck, Achse/ })).toBeVisible()
})

test('reports a clear error when the stored case is corrupt', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anesthesia-record:case', '{ this is not json')
  })
  await page.reload()

  await expect(page.getByText('Das Protokoll konnte nicht geladen werden')).toBeVisible()
  await expect(page.getByText(/beschädigt/)).toBeVisible()
})

test('does not scroll sideways at either form factor', async ({ page }) => {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
