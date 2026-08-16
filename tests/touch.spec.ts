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

test('a tap reads a value without moving it', async ({ page }) => {
  const at = await centreOf(page, 'demo-heartRate-30')
  await page.touchscreen.tap(at.x, at.y)

  await expect(page.locator('text=/HF 81 \\/min/')).toBeVisible()

  const after = await storedEntry(page, 'demo-heartRate-30')
  expect(after.value).toBe(81)
  expect(after.revisions).toEqual([])
})
