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
  // Exact, because „Demodaten zurücksetzen“ on the reset button also contains the word and a
  // substring match resolves to both.
  await expect(page.getByText('Demodaten', { exact: true })).toBeVisible()
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
  // Two rulers, not one: the record repeats the time axis above the medication band, because the
  // copy at the top of the page scrolls away on an iPad and a dose with no readable time under it
  // is the thing the shared timeline exists to prevent.
  await expect(page.getByRole('img', { name: /Zeitachse von/ })).toHaveCount(2)
  await expect(page.getByRole('img', { name: /Zeitachse von/ }).first()).toBeVisible()
})

/**
 * The canvas is one time scale, and since the grid is drawn by the lanes *and* by both bands, it
 * is now drawn from that scale in three places. Each computes its own plot edges, so a change to
 * the gutter or to the value rail that reaches one and not the others would put a dose at one x
 * and the vitals of that minute at another — the whole reason the bands share the lanes' right
 * edge. Asserted on the rules rather than on the entries, because a rule is on the grid by
 * construction and an entry only happens to be.
 */
test('rules the lanes and the bands on the same time scale', async ({ page }) => {
  // The quarter-hour rules of one band: vertical, in the major grey, and not the dashed rule a
  // phase milestone draws. Read as coordinates rather than as bounding boxes, because x1 in the
  // lane's own user units is the number the shared scale actually produced.
  const rules = (name: string | RegExp) =>
    page
      .getByRole('group', { name })
      .locator('line[stroke="#c9c6be"]:not([stroke-dasharray])')
      .evaluateAll((lines) =>
        lines
          .filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
          .map((line) => Number(line.getAttribute('x1'))),
      )

  const lane = await rules(/Herzfrequenz, Achse/)
  expect(lane.length).toBeGreaterThan(2)
  // The medication band and not the event band: a milestone's stem is a vertical line in the same
  // grey, so the event band cannot be told apart from its own grid by colour alone. What this test
  // is for is that a band computes the same plot edges as a lane, and one band proves that.
  expect(await rules('Medikamente und Infusionen')).toEqual(lane)
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

/**
 * The error screen has to be a way out, not just a description.
 *
 * Reloading cannot fix unreadable data — it reads the same bytes and fails the same way — so
 * without the discard the app is finished on this device. The test proves the route rather than
 * the button: it comes back through the corrupt state, presses the one control offered, and then
 * asks the record and the storage whether the app is actually working again. Deleting the button
 * fails it at the click; leaving a button that only clears without re-seeding fails it at the
 * heading.
 */
test('offers a way out of unreadable data, and the way out works', async ({ page }) => {
  // Corrupted once, not from an `addInitScript`. An init script runs again on every navigation,
  // so it would put the bad value back at the final reload and report a working recovery as
  // broken — which is what it did on the first run of this test.
  await page.evaluate(() => {
    window.localStorage.setItem('anesthesia-record:case', '{ this is not json')
  })
  await page.reload()

  // Said plainly before it is done, because this is the one action in the app that undo cannot
  // take back: the case it would undo inside never loaded.
  await expect(page.getByText(/endgültig gelöscht/)).toBeVisible()

  await page.getByRole('button', { name: 'Gespeicherte Daten verwerfen und neu beginnen' }).click()

  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Blutdruck, Achse/ })).toBeVisible()

  // Recovered in storage too, not only on screen: a repaired screen over a still-corrupt key
  // would fail again on the next reload, which is the failure this whole screen exists to end.
  const entries = await page.evaluate(() => {
    const raw = window.localStorage.getItem('anesthesia-record:case')
    if (raw === null) throw new Error('nothing was written back')
    return JSON.parse(raw).case.entries.length
  })
  expect(entries).toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mustermann, Erika' })).toBeVisible()
})

/**
 * The other half of the distinction. A denied storage API is not recoverable by discarding
 * anything, so the app must not offer a button that would do nothing — it keeps the advice that
 * is actually true in that case. Without the `cause` field both failures would read identically
 * and one of the two screens would be lying.
 */
test('when storage itself is denied, it advises rather than offering a useless button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({ getItem: denied, setItem: denied, removeItem: denied }),
    })
  })
  await page.reload()

  await expect(page.getByText(/Auf den lokalen Speicher kann nicht zugegriffen werden/)).toBeVisible()
  await expect(page.getByText(/Prüfen Sie, ob der Browser lokalen Speicher zulässt/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Gespeicherte Daten verwerfen und neu beginnen' }),
  ).toHaveCount(0)
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
  await expect(page.getByText(/„\+“ links an der jeweiligen Zeile/)).toBeVisible()

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
