import { expect, test, type Page } from '@playwright/test'

/**
 * The two faces, and the one number the chart's geometry reads off one of them.
 *
 * Most of this change is paint, and paint does not need a test. One part of it is not. The chart
 * sizes two boxes around text it never measures — the value labels of the reading mode and the
 * readout on a selected point — by multiplying a character count by `MONO_ADVANCE`, which is the
 * advance width of IBM Plex Mono read out of the shipped `.woff2`. That turns a font file into an
 * input to the collision search: if the face fails to load, or a later edit points those elements
 * at a proportional family, every width the search compares is wrong and nothing else complains.
 * Labels would simply overlap slightly, on some values and not others, which is exactly the class
 * of defect `docs/learning.md` records as invisible in the source.
 *
 * So these ask the browser rather than the source, and they were checked by breaking the app three
 * ways. Pointing `--font-numeric` at a proportional family fails three of the four. Deleting the
 * `@font-face` declarations fails two.
 *
 * What the fourth does **not** catch is worth writing down, because it is the sort of thing this
 * file would otherwise be read as promising. `getComputedStyle().fontFamily` returns the declared
 * stack, not the face that drew the glyphs, so the width test passes with the webfont deleted: it
 * then measures the platform's own monospace, which on macOS is also 0.6 em. That is not a hole,
 * it is the division of labour — the width test proves the arithmetic matches whatever face is
 * actually drawing, which is the property layout depends on, and the loading test above is the one
 * that proves the face is Plex and is served from here.
 *
 * They matter most on WebKit. `labels.ts` is the code that most depends on text metrics, Safari on
 * iPad is a target browser, and a webfont that loads in Chromium is not evidence about either.
 */

const SPO2_LANE = /Sauerstoffsättigung, Achse/
const MONO_ADVANCE = 0.6

/** The same press `values.spec.ts` uses to ask a lane for its numbers. */
async function showNumbers(page: Page) {
  const lane = page.getByRole('group', { name: SPO2_LANE })
  const box = (await lane.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height - 8)
}

/**
 * The first family in the element's resolved stack.
 *
 * This is the declaration, not the glyphs: a computed style names the family that was asked for
 * whether or not the file arrived. It is the right question for "did this rule reach this
 * element", which is what it is used for, and the wrong one for "is this Plex".
 */
function familyOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) => {
    const rendered = getComputedStyle(node).fontFamily.split(',')[0]
    return rendered.replace(/["']/g, '').trim()
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Both faces have to be in before anything is measured. `font-display: swap` means the first
  // paint is deliberately in the platform face, so without this the assertions race the download.
  await page.evaluate(() => document.fonts.ready)
})

test('both faces are served by the app itself, not borrowed from the platform', async ({ page }) => {
  // `load` rather than `check`: it returns the faces that matched the request, having fetched
  // them, so an empty array means the app never declared that weight and a rejection means it
  // declared a file it cannot serve. `check` answers a narrower question — is this already
  // downloaded — and half of these are not on the first screen. Mono 600 is the sheet's large
  // numerals and the chart's labels; neither is drawn until something is opened or selected, so
  // the browser is right not to have fetched it and `check` was reading that as absence.
  //
  // The sample strings are German and decimal on purpose. The subset shipped is `latin` alone, so
  // an umlaut or a comma falling through to the platform face would be a real defect here.
  const loaded = await page.evaluate(async () => {
    const faces = async (spec: string, text: string) =>
      (await document.fonts.load(spec, text)).map((face) => face.status)

    return {
      sans: await Promise.all(
        [400, 600, 700].map((weight) => faces(`${weight} 15px "IBM Plex Sans"`, 'Größe')),
      ),
      // 400 for axis and dose text, 500 for the lane readouts, 600 for the chart's labels and the
      // sheet's large numerals. Every declared weight is drawn somewhere; none is dead freight.
      mono: await Promise.all(
        [400, 500, 600].map((weight) => faces(`${weight} 13px "IBM Plex Mono"`, '36,8')),
      ),
    }
  })

  // One file answers all three sans weights — it is the variable release, 100 through 700.
  expect(loaded.sans).toEqual([['loaded'], ['loaded'], ['loaded']])
  // Three separate files for mono, which has no variable release.
  expect(loaded.mono).toEqual([['loaded'], ['loaded'], ['loaded']])
})

test('the interface is Plex Sans and the record is Plex Mono', async ({ page }) => {
  // A sentence with numbers in it: the header's baseline row stays in the interface face, because
  // two faces inside one 14px line is harder to read, not easier.
  expect(await familyOf(page, '.case-facts dd')).toBe('IBM Plex Sans')
  // A number, on its own: the lane's current value.
  expect(await familyOf(page, '.timeline__value')).toBe('IBM Plex Mono')
})

test('a value label is as wide as the geometry says it is', async ({ page }) => {
  await showNumbers(page)

  const label = page.locator('[data-value-label]').first()
  await expect(label).toBeVisible()

  const measured = await label.evaluate((node) => {
    const text = node as unknown as SVGTextElement
    return {
      family: getComputedStyle(node).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      size: parseFloat(getComputedStyle(node).fontSize),
      characters: (text.textContent ?? '').length,
      width: text.getComputedTextLength(),
    }
  })

  expect(measured.family).toBe('IBM Plex Mono')
  expect(measured.characters).toBeGreaterThan(0)

  // The claim `MONO_ADVANCE` makes, stated as the browser can check it. A whole pixel of slack
  // across a two-to-five character label: enough to absorb subpixel rounding between two engines,
  // far too little to survive a proportional face, where "111" and "988" are not the same width.
  const predicted = measured.characters * MONO_ADVANCE * measured.size
  expect(Math.abs(measured.width - predicted)).toBeLessThan(1)
})

test('one advance per digit, so a number does not move as it changes', async ({ page }) => {
  // The reason mono is on values at all, and the one property a screenshot cannot show. Measured
  // through the real face rather than argued from its metrics.
  const widths = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    context.font = '500 32px "IBM Plex Mono"'
    return ['111', '988', '36,8', '142'].map((text) => context.measureText(text).width)
  })

  // Same character count, different digits: identical width. This is the property, and it is what
  // a proportional face does not have — in Plex Sans "111" is visibly narrower than "988".
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(0.5)
  // One character more is exactly one advance more, and not a hair else.
  expect(Math.abs(widths[2] - widths[3] - MONO_ADVANCE * 32)).toBeLessThan(0.5)
})
