import { expect, test, type Page } from '@playwright/test'

/**
 * Touch behaviour on the timeline, which is where the iPad and the desktop genuinely differ.
 *
 * On a mouse a press means the point under the cursor. On an iPad the same gesture is how the
 * record is scrolled, and the timeline fills most of the screen, so a swipe that happens to start
 * near a point must scroll and must not rewrite a measurement. These tests script the gesture
 * rather than reasoning about the handler: the defect they cover was invisible in the source and
 * was only found by performing the swipe.
 *
 * Playwright's `touchscreen` can tap but not swipe, so the multi-step gestures go through the
 * Chrome DevTools Protocol, which is what produces real touch input the compositor can scroll on.
 */

const STORAGE_KEY = 'anesthesia-record:case'

/** Comfortably longer than the lane's hold, so the wait is not a race. */
const HELD = 400

test.skip(({ hasTouch }) => !hasTouch, 'Touch gestures exist only on the iPad project')

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

interface Point {
  x: number
  y: number
}

/**
 * One finger, pressed at `from`, held for `holdMs`, dragged to `to`, lifted. `holdMs` of zero is
 * the ordinary scroll swipe; anything past the lane's hold is a deliberate grab.
 */
async function swipe(page: Page, from: Point, to: Point, holdMs = 0) {
  const cdp = await page.context().newCDPSession(page)
  const finger = (x: number, y: number) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }]

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: finger(from.x, from.y),
  })
  if (holdMs > 0) await page.waitForTimeout(holdMs)

  const steps = 10
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: finger(
        from.x + (to.x - from.x) * progress,
        from.y + (to.y - from.y) * progress,
      ),
    })
  }

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('swiping over a point scrolls the record and leaves the value alone', async ({ page }) => {
  // The gesture only means anything if there is somewhere to scroll to.
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(scrollable, 'the record must overflow the viewport for this to test anything').toBe(true)

  const before = await storedEntry(page, 'demo-heartRate-30')
  expect(before.value).toBe(81)

  const from = await centreOf(page, 'demo-heartRate-30')
  await swipe(page, from, { x: from.x, y: from.y - 200 })

  await expect.poll(() => scrollY(page), { message: 'the page should have scrolled' }).toBeGreaterThan(0)

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(81)
  expect(after.revisions).toEqual([])
})

test('holding a point first grabs it, and the page stays put while it is moved', async ({
  page,
}) => {
  const before = await storedEntry(page, 'demo-heartRate-30')

  const from = await centreOf(page, 'demo-heartRate-30')
  await swipe(page, from, { x: from.x, y: from.y - 60 }, HELD)

  await expect(page.getByText(/^Gespeichert /)).toBeVisible()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBeGreaterThan(before.value)
  expect(after.revisions).toHaveLength(1)
  expect(after.revisions[0].previous.value).toBe(81)

  // The grab has to take the gesture away from the browser, or the record would slide under the
  // finger while the point is being placed.
  expect(await scrollY(page)).toBe(0)
})

test('swiping over empty chart scrolls, and does not switch how the chart reads', async ({
  page,
}) => {
  const lane = page.getByRole('group', { name: /Sauerstoffsättigung, Achse/ })
  const box = (await lane.boundingBox())!
  // Six tenths across, not near the right edge: the right of a lane is the value rail now, and a
  // press there is a press on the lane's furniture rather than on its chart. Vertically it stays
  // clear of every point — the saturation axis floor is 94 % and this case never goes near it.
  const from = { x: box.x + box.width * 0.6, y: box.y + box.height - 8 }

  await swipe(page, from, { x: from.x, y: from.y - 200 })

  await expect.poll(() => scrollY(page), { message: 'the page should have scrolled' }).toBeGreaterThan(0)
  // The numbers are asked for by a tap. A swipe is how the record is read on an iPad, and it must
  // pass over the chart without changing it — the same rule the grab follows.
  await expect(page.locator('[data-value-label]')).toHaveCount(0)
})

test('a tap on empty chart writes the values out', async ({ page }) => {
  const lane = page.getByRole('group', { name: /Sauerstoffsättigung, Achse/ })
  const box = (await lane.boundingBox())!

  // Six tenths across, not near the right edge: the right of a lane is the value rail now, and a
  // press there is a press on the lane's furniture rather than on its chart. Vertically it stays
  // clear of every point — the saturation axis floor is 94 % and this case never goes near it.
  await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height - 8)

  await expect(page.locator('[data-value-label]').first()).toBeVisible()
  await expect(page.locator('[data-value-label="demo-heartRate-20"]')).toHaveText('79')
})

test('a tap reads a value without moving it', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.touchscreen.tap(at.x, at.y)

  await expect(page.locator('text=/HF 81 \\/min/')).toBeVisible()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(81)
  expect(after.revisions).toEqual([])
})

/**
 * The gutter block is now the size of the whole gutter, which is a risk the painted button never
 * had: 88 by 44 of the left edge, on the form factor where the left edge is also where a thumb
 * rests while the record is scrolled. A swipe that starts on it has to scroll and open nothing.
 *
 * Nothing in `Timeline.tsx` implements this. It works because the block is a real `<button>` with
 * an `onClick`, and a browser withholds the click when a touch turns into a scroll — the same
 * property the bands' hit areas lean on, and the reason the lanes' grab is the only gesture on
 * this canvas that had to resolve the ambiguity by hand. Leaning on it is fine; leaning on it
 * untested is how it turns into a sheet that opens every time the record is scrolled.
 */
test('swiping from a lane\'s gutter block scrolls the record and opens nothing', async ({
  page,
}) => {
  const block = (await page.getByRole('button', { name: 'Herzfrequenz erfassen' }).boundingBox())!
  const from = { x: block.x + block.width / 2, y: block.y + block.height / 2 }

  await swipe(page, from, { x: from.x, y: from.y - 200 })

  await expect.poll(() => scrollY(page), { message: 'the page should have scrolled' }).toBeGreaterThan(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
