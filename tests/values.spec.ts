import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Reading the chart as numbers.
 *
 * The chart's normal state shows trends: points joined by a line, positions on an axis. This is
 * the other way of reading it — every value spelled out beside its point — and what these tests
 * hold to is the promise that makes it worth having: the numbers have to be readable, which means
 * none of them may sit on top of another. The blood pressure lane is where that is hard, so it is
 * where the assertion goes.
 */

const SPO2_LANE = /Sauerstoffsättigung, Achse/
const BLOOD_PRESSURE_LANE = /Blutdruck, Achse/

const toggle = (page: Page) => page.getByRole('button', { name: /^Zahlen / })
const labels = (page: Page) => page.locator('[data-value-label]')

/** A press on the lane clear of every point: the gesture that asks for the numbers. */
async function tapEmptyChart(page: Page) {
  const lane = page.getByRole('group', { name: SPO2_LANE })
  const box = (await lane.boundingBox())!
  // Bottom right of the saturation lane: the axis runs to 70 % and the case never goes near it.
  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 8)
}

async function boxesOf(locator: Locator) {
  const boxes = []
  for (const label of await locator.all()) {
    const box = await label.boundingBox()
    if (box) boxes.push(box)
  }
  return boxes
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('a tap on the chart writes every value out and takes the trend lines away', async ({
  page,
}) => {
  const trend = page.locator('.timeline polyline')
  const linesBefore = await trend.count()
  expect(linesBefore).toBeGreaterThan(0)
  await expect(labels(page)).toHaveCount(0)

  await tapEmptyChart(page)

  // One label per drawn point, and the value itself is what it says.
  await expect(labels(page)).toHaveCount(51)
  await expect(page.locator('[data-value-label="demo-heartRate-20"]')).toHaveText('79')
  await expect(trend).toHaveCount(0)

  // And back: this is a way of looking at the record, not a state to get stuck in.
  await tapEmptyChart(page)
  await expect(labels(page)).toHaveCount(0)
  await expect(trend).toHaveCount(linesBefore)
})

test('no two values are written over each other', async ({ page }) => {
  await tapEmptyChart(page)

  for (const lane of [SPO2_LANE, BLOOD_PRESSURE_LANE]) {
    const inLane = page.getByRole('group', { name: lane }).locator('[data-value-label]')
    const boxes = await boxesOf(inLane)
    expect(boxes.length).toBeGreaterThan(0)

    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(overlaps(a, b), `labels at ${a.x},${a.y} and ${b.x},${b.y} overlap`).toBe(false)
      }
    }
  }
})

test('the button says which way the chart is being read, and switches it', async ({ page }) => {
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')

  await toggle(page).click()

  await expect(toggle(page)).toHaveText('Zahlen ausblenden')
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(labels(page)).toHaveCount(51)

  // The gesture and the button are one state, not two: what the tap did, the button undoes.
  await tapEmptyChart(page)
  await expect(toggle(page)).toHaveText('Zahlen anzeigen')
  await expect(labels(page)).toHaveCount(0)
})

test('a point still opens for editing while the numbers are up', async ({ page }) => {
  await tapEmptyChart(page)

  await page.locator('[data-entry-id="demo-heartRate-30"]').click()

  // The selected point's own label gives way to the readout, which says more than it did.
  await expect(page.locator('[data-value-label="demo-heartRate-30"]')).toHaveCount(0)
  const readout = page.locator('[data-readout="demo-heartRate-30"]')
  await expect(readout).toBeVisible()
  await expect(readout).toHaveAttribute('aria-label', /HF 81 \/min · 09:00/)

  await readout.click()
  await expect(page.getByRole('dialog')).toContainText('Herzfrequenz')
})

test('correcting a point rewrites its number and does not put the numbers away', async ({
  page,
}) => {
  await tapEmptyChart(page)
  await expect(page.locator('[data-value-label="demo-heartRate-30"]')).toHaveText('81')

  // Dragged well past the top of the axis, so the pointer ends far from where the point lands.
  // The release is over empty chart, and must not read as a tap asking to hide the numbers.
  const marker = page.locator('[data-entry-id="demo-heartRate-30"]')
  const from = (await marker.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 200, { steps: 10 })
  await page.mouse.up()

  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  await expect(labels(page).first()).toBeVisible()
  // The corrected point is the selected one, so its value is now in the readout.
  await expect(page.locator('[data-readout="demo-heartRate-30"]')).toHaveAttribute(
    'aria-label',
    /HF 180 \/min/,
  )
})
