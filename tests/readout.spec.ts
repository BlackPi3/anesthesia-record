import { expect, test, type Page } from '@playwright/test'

/**
 * The lane readouts: the current value of each vital, set large in the rail to the right of the
 * chart.
 *
 * What these hold to is that the largest number on the page is always the newest thing written
 * down on that lane, and never anything else. A big number that is sometimes the selection,
 * sometimes a snapshot from before a correction, or sometimes a value clamped to fit the axis is
 * worse than no big number at all — it is read at a glance, which is exactly when nobody checks.
 */

const STORAGE_KEY = 'anesthesia-record:case'

/** The number itself, per lane. The notes under it are asserted through the spoken description. */
const value = (page: Page, lane: string) => page.locator(`[data-lane-value="${lane}"]`)

/**
 * Rewrites the stored case and reloads onto it, for the two states the demo case cannot reach on
 * its own: a lane with nothing in it, and a value past the end of its axis.
 */
type Patch = { clear: true } | { id: string; set: Record<string, unknown> }

async function reloadWith(page: Page, patch: Patch) {
  await page.evaluate(
    ([key, change]) => {
      const envelope = JSON.parse(window.localStorage.getItem(key)!)
      if ('clear' in change) {
        envelope.case.entries = []
      } else {
        const entry = envelope.case.entries.find(
          (candidate: { id: string }) => candidate.id === change.id,
        )
        if (!entry) throw new Error(`no entry ${change.id}`)
        Object.assign(entry, change.set)
      }
      window.localStorage.setItem(key, JSON.stringify(envelope))
    },
    [STORAGE_KEY, patch] as const,
  )
  await page.reload()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('every lane carries its newest value, with the unit and the time it was taken', async ({
  page,
}) => {
  await expect(value(page, 'spo2')).toHaveText('98')
  await expect(value(page, 'heartRate')).toHaveText('75')
  await expect(value(page, 'temperature')).toHaveText('36,5')

  // The whole reading, as it is spoken. The unit and the time are on the readout as small type,
  // and asserting them here is what keeps the number from becoming a bare figure with no scale.
  await expect(page.getByRole('img', { name: /^Sauerstoffsättigung/ })).toHaveAttribute(
    'aria-label',
    'Sauerstoffsättigung, zuletzt 98 %, um 09:30 Uhr.',
  )
})

/** A blood pressure is one reading, so its readout is the pair, with the mean beneath it. */
test('the pressure lane reads as one reading, and the mean is not invented', async ({ page }) => {
  await expect(value(page, 'bloodPressure')).toHaveText('133/80')
  await expect(page.getByRole('img', { name: /^Blutdruck/ })).toHaveAttribute(
    'aria-label',
    'Blutdruck, zuletzt 133 zu 80 mmHg, Mittlerer arterieller Druck 98, um 09:30 Uhr.',
  )

  // Remove the mean of the last reading only. The readout loses the MAD line and keeps the pair:
  // nothing is derived from the two pressures that are left, which the brief forbids outright.
  await reloadWith(page, { id: 'demo-bloodPressureMean-60', set: { deletedAt: 1 } })

  await expect(value(page, 'bloodPressure')).toHaveText('133/80')
  await expect(page.getByRole('img', { name: /^Blutdruck/ })).toHaveAttribute(
    'aria-label',
    'Blutdruck, zuletzt 133 zu 80 mmHg, um 09:30 Uhr.',
  )
})

test('correcting the newest value rewrites the readout as the point moves', async ({ page }) => {
  await expect(value(page, 'heartRate')).toHaveText('75')

  const marker = await page.locator('[data-entry-id="demo-heartRate-60"]').boundingBox()
  if (!marker) throw new Error('no marker for the newest heart rate')
  const from = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 }

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y - 20, { steps: 8 })
  // Still held: the readout is the value being written, not the value that was saved.
  await expect(value(page, 'heartRate')).not.toHaveText('75')
  await page.mouse.up()

  const raised = await value(page, 'heartRate').textContent()
  expect(Number(raised)).toBeGreaterThan(75)

  await page.reload()
  await expect(value(page, 'heartRate')).toHaveText(raised!)
})

/**
 * The readout is the lane's current value, not the lane's selection. Selecting an older point
 * opens that point's own readout on the chart, which is where a value from earlier in the case is
 * read; if the large number followed it too, the one number that is always the same thing would
 * stop being that.
 */
test('selecting an older point leaves the current value alone', async ({ page }) => {
  const marker = await page.locator('[data-entry-id="demo-heartRate-30"]').boundingBox()
  if (!marker) throw new Error('no marker for the 09:00 heart rate')
  await page.mouse.click(marker.x + marker.width / 2, marker.y + marker.height / 2)

  await expect(page.locator('[data-readout="demo-heartRate-30"]')).toHaveAttribute(
    'aria-label',
    /HF 81 \/min · 09:00/,
  )
  await expect(value(page, 'heartRate')).toHaveText('75')
})

/**
 * The rail is the lane's furniture, not its chart surface. A press on the chart drops every trend
 * line and writes the numbers out; a press on the current value must not, or the largest target on
 * the lane would be one that changes how the whole record reads by accident.
 */
test('pressing the readout does not switch how the chart reads', async ({ page }) => {
  const lane = page.getByRole('group', { name: /Herzfrequenz, Achse/ })
  const box = (await lane.boundingBox())!

  await page.mouse.click(box.x + box.width - 60, box.y + box.height / 2)

  await expect(page.locator('[data-value-label]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Zahlen / })).toHaveText('Zahlen anzeigen')
})

/**
 * A value past the end of its axis is drawn hollow against the edge it went past, so its position
 * is a lie about its size — deliberately, because the alternative is clipping it away. The readout
 * is where its real number is, and it is never clamped to the axis.
 */
test('a value off the end of its axis is read here at its real number', async ({ page }) => {
  await reloadWith(page, { id: 'demo-heartRate-60', set: { value: 180 } })

  await expect(value(page, 'heartRate')).toHaveText('180')
  await expect(page.getByRole('img', { name: /^Herzfrequenz/ })).toHaveAttribute(
    'aria-label',
    'Herzfrequenz, zuletzt 180 /min, um 09:30 Uhr.',
  )
})

/** An empty lane says so, rather than showing a number that is not in the record. */
test('a lane with nothing in it says so where its value would be', async ({ page }) => {
  await reloadWith(page, { clear: true })

  await expect(value(page, 'spo2')).toHaveText('—')
  await expect(page.getByRole('img', { name: /^Sauerstoffsättigung/ })).toHaveAttribute(
    'aria-label',
    'Sauerstoffsättigung, noch keine Werte erfasst.',
  )
})
