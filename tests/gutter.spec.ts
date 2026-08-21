import { expect, test, type Page } from '@playwright/test'

/**
 * The lane's „Erfassen“ button is painted 32px tall and answers to 44px.
 *
 * `theme.ts` argues that 44px is the size a fingertip reliably hits; `index.css` then paints these
 * six controls at 32px, because a 44px box does not fit the shortest lane — measured, it hangs
 * 10.5px past the temperature lane's floor. The resolution is that the box stays and the target
 * grows into the gutter above and below it, which is dead space: a press on a lane's name, on its
 * unit, or on empty gutter does nothing at all.
 *
 * That is exactly the kind of claim that cannot be checked by reading the handler, and `CLAUDE.md`
 * requires anything new on this surface to say what the other gestures must not do. So these are
 * scripted presses. What would still pass with the expansion taken out, checked rather than
 * assumed: the last two, which are the guards. The first two fail, and they are the feature.
 *
 * The fourth gesture, hold-and-drag to correct a point, is not repeated here. It needs real touch
 * input through the Chrome DevTools Protocol and `touch.spec.ts` already drives it; nothing in
 * this change is near it, and a second copy of that machinery would be the thing most likely to
 * rot.
 */

/** The button is 32px in a 44px target, so 6px above its painted top is inside one and not the
    other. 4px of margin either side of that edge, which is more than any rounding. */
const ABOVE_THE_BOX = 6

const laneOf = (page: Page, name: RegExp) => page.getByRole('group', { name })
const addButton = (page: Page, name: string) => page.getByRole('button', { name })

async function boxOf(page: Page, target: ReturnType<typeof laneOf>) {
  const box = await target.boundingBox()
  if (!box) throw new Error('not rendered')
  return box
}

/** A press, by whichever device this project has. The claim is about the size of the target, not
    about the pointer type, and both form factors are graded on it. */
async function press(page: Page, hasTouch: boolean, x: number, y: number) {
  if (hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('a press just above the painted button still opens that lane\'s entry sheet', async ({
  page,
  hasTouch,
}) => {
  const button = await boxOf(page, addButton(page, 'Temperatur erfassen'))

  // Above the painted box, inside the target. Before the hit area was expanded this press landed
  // on the lane's unit, which does nothing.
  await press(page, hasTouch, button.x + button.width / 2, button.y - ABOVE_THE_BOX)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Temperatur', { exact: false }).first()).toBeVisible()
})

test('the target is 44px and ends inside its own lane', async ({ page }) => {
  const lane = await boxOf(page, laneOf(page, /Temperatur, Achse/))
  const button = await boxOf(page, addButton(page, 'Temperatur erfassen'))

  // Temperatur is the shortest lane — 74px, against a button 32px tall at y=40 — so it is the one
  // the asymmetric inset is cut to, and the only one where the two claims can both be tight.
  const edges = await page.evaluate(
    ([x, from, to]) => {
      const answers = (y: number) =>
        document.elementFromPoint(x, y)?.closest('.timeline__add') !== null
      // The painted box answers, so each search starts inside it and walks out to where it stops.
      // It returns the last point that still answered, not the midpoint of the final interval:
      // the furthest point that is provably inside the target, so a comparison against the lane's
      // own edge cannot fail by a rounding artifact of the search.
      const edge = (inside: number, outside: number) => {
        for (let step = 0; step < 30; step += 1) {
          const mid = (inside + outside) / 2
          if (answers(mid)) inside = mid
          else outside = mid
        }
        return inside
      }
      return { top: edge(from, from - 20), bottom: edge(to, to + 20) }
    },
    [button.x + button.width / 2, button.y, button.y + button.height] as const,
  )

  // The point of the change: what a fingertip has to hit is 44px, not the 32px that is painted.
  // Subpixel layout puts it at 43.98, so this is 44 to within a pixel rather than to the decimal.
  expect(edges.bottom - edges.top).toBeGreaterThan(43.5)
  expect(edges.bottom - edges.top).toBeLessThan(44.5)

  // And it is bought entirely from this lane's own gutter. A target that ran past the lane's floor
  // would be taking presses that belong to the Medikamente band below it.
  expect(edges.bottom).toBeLessThanOrEqual(lane.y + lane.height)
  expect(edges.top).toBeGreaterThanOrEqual(lane.y)
})

test('a press on the plot still switches how the lane reads, and opens nothing', async ({
  page,
  hasTouch,
}) => {
  const lane = await boxOf(page, laneOf(page, /Sauerstoffsättigung, Achse/))

  // Six tenths across and clear of every point: the right of a lane is the value rail, and the
  // saturation floor is 94 %, which this case never approaches.
  await press(page, hasTouch, lane.x + lane.width * 0.6, lane.y + lane.height - 8)

  await expect(page.locator('[data-value-label]').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a press on a point still selects it, and opens nothing', async ({ page, hasTouch }) => {
  const marker = await boxOf(page, page.locator('[data-entry-id="demo-heartRate-30"]'))

  await press(page, hasTouch, marker.x + marker.width / 2, marker.y + marker.height / 2)

  await expect(page.getByText(/HF 81 \/min/)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
