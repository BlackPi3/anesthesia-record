import { expect, test, type Page } from '@playwright/test'

/**
 * The gutter block: a row's name, its unit, and the „+“ that starts an entry on it — one control,
 * 88px wide and 44px tall, where there used to be a name with a painted 128x32 button under it.
 *
 * The claim is not that a button works. It is that the gutter answers and the chart beside it
 * still does what it did: `CLAUDE.md` requires anything new on the lane surface to say what the
 * other gestures must not do, and to prove it by a scripted gesture rather than by reading the
 * handler. So the first two presses land where nothing used to happen, and the last three are the
 * guards — asked, rather than assumed, what would still pass with the change taken out. The
 * guards would; the first two would not.
 *
 * Two things are covered elsewhere on purpose. A hold-and-drag on a point is `touch.spec.ts`,
 * which drives real touch through the Chrome DevTools Protocol; so is the drag that starts on
 * this block, which is the new risk here — the target is now the size of the whole gutter, and a
 * finger that swipes from it has to scroll the record and open nothing. A second copy of that
 * machinery in this file would be the thing most likely to rot.
 */

const laneOf = (page: Page, name: RegExp) => page.getByRole('group', { name })
const blockOf = (page: Page, name: string) => page.getByRole('button', { name })

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

test("a press on the lane's axis number opens that lane's entry sheet", async ({
  page,
  hasTouch,
}) => {
  const block = await boxOf(page, blockOf(page, 'Temperatur erfassen'))

  // The far right of the block, on the line the ceiling number „38,0“ is written on: the gutter is
  // the lane's furniture, and all of it is the control now. Before this change the same press
  // landed on an SVG number, which does nothing.
  await press(page, hasTouch, block.x + block.width - 6, block.y + 8)

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Temperatur', { exact: false }).first()).toBeVisible()
})

test('the target is 44px, the full width of the gutter, and inside its own lane', async ({
  page,
}) => {
  const lane = await boxOf(page, laneOf(page, /Temperatur, Achse/))
  const block = await boxOf(page, blockOf(page, 'Temperatur erfassen'))

  // Temperatur is the shortest lane at 74px, so it is the one where a 44px target and „inside the
  // lane“ can both be tight. The old painted button could not be 44px for exactly this reason: a
  // 44px box hung 10.5px past this lane's floor, so it stayed 32px and grew an invisible hit area.
  const edges = await page.evaluate(
    ([x, from, to]) => {
      // Identity, not `closest('.timeline__gutter-block')`: the row below carries the medication
      // band's own block, and a search that accepts any of them walks out of the lane and reports
      // a target half as tall again as it is. Matched on the end of the accessible name, which
      // begins with the abbreviation — „Temp, Temperatur erfassen“.
      const target = document.querySelector('[aria-label$="Temperatur erfassen"]')
      const answers = (y: number) => document.elementFromPoint(x, y)?.closest('button') === target
      // Each search starts inside the block and walks out to where it stops answering. It returns
      // the last point that still answered, so a comparison against the lane's own edge cannot
      // fail by a rounding artifact of the search.
      const edge = (inside: number, outside: number) => {
        for (let step = 0; step < 30; step += 1) {
          const mid = (inside + outside) / 2
          if (answers(mid)) inside = mid
          else outside = mid
        }
        return inside
      }
      // 30px of search either side of the centre, which is more than the 22 a 44px target needs:
      // an interval that starts inside the block at both ends reports the block's own height as
      // whatever it was given, and 20 of it read a 44px target as 40.
      return { top: edge(from, from - 30), bottom: edge(to, to + 30) }
    },
    [block.x + block.width / 2, block.y + block.height / 2, block.y + block.height / 2] as const,
  )

  // 44 is the claim; the pixel of slack above it is the browser hit-testing a box whose top is at
  // 649.9 as though it began at 649. Bounded on both sides all the same, because a target that
  // measured 60 would mean the block had swallowed something that is not its own.
  expect(edges.bottom - edges.top).toBeGreaterThanOrEqual(44)
  expect(edges.bottom - edges.top).toBeLessThan(46)
  // The whole gutter, which is `GUTTER` in `Timeline.tsx` and the plot's left edge.
  expect(block.width).toBe(88)

  // And it is bought entirely from this lane's own gutter. The block starts at the top of its own
  // lane and ends 30px above its floor; a target that ran past that floor would be taking presses
  // that belong to the Medikamente band below it. The pixel of tolerance at the top is the same
  // hit-test rounding as above — the block's box begins at 645.9 and answers from 645.
  expect(edges.bottom).toBeLessThanOrEqual(lane.y + lane.height)
  expect(edges.top).toBeGreaterThanOrEqual(lane.y - 1)
})

test('the gutter below the block is still inert', async ({ page, hasTouch }) => {
  const lane = await boxOf(page, laneOf(page, /Sauerstoffsättigung, Achse/))

  // The tallest lane, so there is a good deal of gutter under its block. Nothing may happen here:
  // the sheet must not open, and this is not the chart, so it must not switch how the lane reads
  // either.
  await press(page, hasTouch, lane.x + 20, lane.y + lane.height - 8)

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-value-label]')).toHaveCount(0)
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

/**
 * The paint stops before the axis numbers.
 *
 * The target is the whole 88px gutter; the painted face hugs its own name, because the right half
 * of that 88 is where the numbers are right-aligned and a surface drawn under „38,0“ would read as
 * though the number were part of the control. Which of the two a rule applies to is invisible in
 * the source — both are inside the same button — and the margin is 6.7px at the tightest lane, so
 * a change of face, of padding or of one abbreviation could close it without anything failing.
 */
test('the painted face never reaches the axis numbers', async ({ page }) => {
  await page.evaluate(() => document.fonts.ready)

  const gaps = await page.locator('.timeline__row').evaluateAll((rows) =>
    rows
      .map((row) => {
        const face = row.querySelector('.timeline__gutter-face')
        // The lane's own numbers: SVG text right-aligned inside the gutter. The bands have none,
        // which is why they are allowed a face nearly the full width of it.
        const numbers = [...row.querySelectorAll('svg text')].filter(
          (text) => Number(text.getAttribute('x')) === 80 && text.getAttribute('text-anchor') === 'end',
        )
        if (!face || numbers.length === 0) return null
        const right = face.getBoundingClientRect().right
        const nearest = Math.min(...numbers.map((text) => text.getBoundingClientRect().left))
        return { name: face.textContent, gap: nearest - right }
      })
      .filter((row) => row !== null),
  )

  // All four lanes, or the filter above is quietly measuring nothing.
  expect(gaps).toHaveLength(4)
  for (const { name, gap } of gaps) {
    expect(gap, `„${name}“ is ${gap.toFixed(1)}px from its own axis numbers`).toBeGreaterThan(4)
  }
})

/**
 * The abbreviation is what is written; the full name is what is spoken.
 *
 * „SpO₂“ is what fits an 88px gutter, and it is a name a Narkoseprotokoll already uses — but it is
 * also a spelling, and a screen reader owes its user the parameter. So the accessible name carries
 * both. That the visible text is contained in the spoken one is not decoration: it is what lets
 * someone driving the interface by voice say what they can see, and it is the property that breaks
 * silently the moment either half is edited on its own.
 */
test('every block is spoken with its full name and written with its short one', async ({ page }) => {
  const blocks = await page.locator('.timeline__gutter-block').evaluateAll((nodes) =>
    nodes.map((node) => ({
      written: node.querySelector('.timeline__gutter-name')!.textContent!.replace('+', '').trim(),
      spoken: node.getAttribute('aria-label')!,
    })),
  )

  expect(blocks.map((block) => block.written)).toEqual([
    'Ereignis',
    'SpO₂',
    'HF',
    'RR',
    'Temp',
    'Medikament',
  ])
  for (const { written, spoken } of blocks) {
    expect(spoken, `„${written}“ is not in its own accessible name`).toContain(written)
    expect(spoken).toMatch(/ erfassen$/)
  }
  expect(blocks[1].spoken).toContain('Sauerstoffsättigung')
})

/**
 * The medication band's block does not move when the band fills.
 *
 * It used to. The name was drawn inside the band's own `<svg>` and the button sat in the flow
 * beneath it, so every drug added pushed „+ Medikament“ further from the „Medikamente“ it belongs
 * to. This is the invariant that replaced it, and it is worth a test rather than a screenshot
 * because it is a property of the record with data in it, not of the record as it first renders:
 * the block that adds the sixth drug has to be where the block that added the first one was.
 *
 * Measured in page coordinates, not `boundingBox()`. A viewport-relative y answers a different
 * question — it moves when the page scrolls, and opening and closing the sheet is exactly the kind
 * of thing that scrolls it. Written that way the test failed against the old layout for two
 * reasons at once, only one of which was the defect.
 */
async function pagePosition(page: Page, selector: string) {
  return page.evaluate((css) => {
    const box = document.querySelector(css)!.getBoundingClientRect()
    return { top: box.top + window.scrollY, left: box.left + window.scrollX, height: box.height }
  }, selector)
}

const BAND = '[aria-label="Medikamente und Infusionen"]'
const MED_BLOCK = '[aria-label="Medikament erfassen"]'

test('the block that adds a medication stays put as the band fills', async ({ page }) => {
  // The block's own height settles when the webfont arrives, so a measurement taken before that
  // races the font and reads a position a pixel off the one the record actually has.
  await page.evaluate(() => document.fonts.ready)

  const before = await pagePosition(page, MED_BLOCK)
  const bandBefore = await pagePosition(page, BAND)

  await page.getByRole('button', { name: 'Medikament erfassen' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Fentanyl' }).click()
  await sheet.getByRole('button', { name: '5' }).first().click()
  await sheet.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText(/^Gespeichert /)).toBeVisible()
  // Scoped to the band. Unscoped this matches the sheet as well, which is still in the DOM while
  // it animates closed, and a strict locator with two matches fails on timing rather than on
  // anything this test is about.
  await expect(page.locator(BAND).getByText('Fentanyl')).toBeVisible()

  // The band really is one row taller — without this the rest asserts nothing.
  const bandAfter = await pagePosition(page, BAND)
  expect(bandAfter.height).toBeGreaterThan(bandBefore.height)

  // And the block has not moved. It is positioned against the row rather than laid out inside the
  // band, so what grows is underneath it.
  const after = await pagePosition(page, MED_BLOCK)
  expect(after.top).toBe(before.top)
  expect(after.left).toBe(before.left)
})
