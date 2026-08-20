import { expect, test, type Page, type Locator } from '@playwright/test'

/**
 * The entry sheet stays inside the window.
 *
 * This suite exists because the rule that was supposed to guarantee it never applied. It was
 * written against AntD 5's element names, AntD 6 renamed one of them and puts the sheet's own
 * class on the other, and a CSS selector that matches nothing reports nothing: the medication
 * sheet rendered 921px tall in an 810px window with its title bar 111px above the top edge and no
 * scroll that could reach it. Nothing in the toolchain noticed, and the two suites that drive that
 * sheet went on passing — Playwright will happily click a button that a person cannot see.
 *
 * So the assertions here are geometric rather than functional. Each is the question someone asks
 * when the sheet opens: can I see what this is, and can I reach the buttons that end it — measured
 * against the viewport rather than against the DOM.
 *
 * The infusion sheet is the case that matters. A readout, a range, a keypad, a unit row and two
 * time controls is the tallest form in the app, and it is the one that broke.
 *
 * Which of these would fail if the cap were taken out again: with the CSS removed, the two
 * measured in a 420px window fail and the two measured at the project's own viewport pass, because
 * the two-column body now fits an iPad without needing the cap at all. That is worth knowing
 * rather than assuming — the short window is the test that reproduces the defect, and the other
 * two are only a check that the ordinary case has not drifted.
 */

const sheet = (page: Page) => page.getByRole('dialog')

/** A rendered box. Being in the DOM is not being on screen, which is the whole point here. */
async function box(target: Locator) {
  const found = await target.boundingBox()
  if (found === null) throw new Error('not rendered')
  return found
}

function viewport(page: Page) {
  const size = page.viewportSize()
  if (size === null) throw new Error('no viewport')
  return size
}

/** Opens the tallest sheet in the app: a continuous infusion asks for a rate, a unit, a start and
    an end. */
async function openInfusion(page: Page) {
  await page.getByRole('button', { name: 'Medikament erfassen' }).click()
  await sheet(page).getByText('Dauerinfusion', { exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Remifentanil' }).click()
  await expect(sheet(page).getByText('Beginn')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('the sheet names itself where the name can be read', async ({ page }) => {
  await openInfusion(page)

  // The title is the only thing on screen saying which drug is being documented, and it sits at
  // the top of the card — exactly the part that used to be pushed off the window.
  const title = await box(sheet(page).getByText('Remifentanil · Dauerinfusion'))
  expect(title.y).toBeGreaterThanOrEqual(0)
})

test('the sheet is never taller than the window it opens in', async ({ page }) => {
  await openInfusion(page)

  // The card itself, not its contents. A body that scrolls is fine; a card hanging off the top of
  // the screen is what this is here to catch.
  const card = await box(page.locator('.entry-sheet__card'))
  expect(card.y).toBeGreaterThanOrEqual(0)
  expect(card.height).toBeLessThanOrEqual(viewport(page).height)
})

test('in a window too short for the form, the body scrolls and the ends stay put', async ({
  page,
}) => {
  // Short enough that the form cannot fit whatever the layout does, so the cap is doing the work
  // rather than the two columns.
  await page.setViewportSize({ width: 900, height: 420 })
  await openInfusion(page)

  const title = sheet(page).getByText('Remifentanil · Dauerinfusion')
  const before = await box(title)
  expect(before.y).toBeGreaterThanOrEqual(0)

  const body = page.locator('.entry-sheet__body')
  const overflows = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(overflows).toBe(true)

  // Scrolling the body must not carry the title or the buttons with it: they are outside it.
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  expect((await box(title)).y).toBeCloseTo(before.y, 0)

  for (const name of ['Zurück', 'Übernehmen']) {
    const button = await box(sheet(page).getByRole('button', { name }))
    expect(button.y + button.height).toBeLessThanOrEqual(420)
  }
})

test('the record stays visible around the sheet', async ({ page }) => {
  // Bounded and centred rather than full width. On a narrow screen the card takes the whole width
  // and there is nothing to assert, so this only runs where there is room for it to be a card.
  const { width } = viewport(page)
  test.skip(width < 940, 'no room beside the card at this width')

  await openInfusion(page)
  const card = await box(page.locator('.entry-sheet__card'))

  expect(card.width).toBeLessThan(width)
  // Centred: the two margins agree, give or take a pixel of rounding.
  expect(Math.abs(card.x - (width - card.x - card.width))).toBeLessThanOrEqual(1)
})
