import { describe, expect, it } from 'vitest'

import { overlapArea, placeValueLabels, type Box, type LabelRequest } from './labels'

/** The lane the labels are placed in, roughly a real one: full width, one lane tall. */
const BOUNDS: Box = { x: 168, y: 0, width: 800, height: 92 }

function label(id: string, x: number, y: number, width = 28, height = 18): LabelRequest {
  return { id, x, y, width, height }
}

/** Every pair of placed boxes, for the "nothing collides" assertions. */
function pairs<T>(items: T[]): Array<[T, T]> {
  return items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]))
}

describe('overlapArea', () => {
  const square: Box = { x: 0, y: 0, width: 10, height: 10 }

  it('is zero for boxes that only touch', () => {
    expect(overlapArea(square, { ...square, x: 10 })).toBe(0)
  })

  it('is the shared rectangle when they cross', () => {
    expect(overlapArea(square, { ...square, x: 5, y: 5 })).toBe(25)
  })
})

describe('placeValueLabels', () => {
  it('puts a lone label above its point', () => {
    const [placed] = placeValueLabels([label('a', 400, 50)], [], BOUNDS)

    expect(placed.id).toBe('a')
    // Centred on the point, and clear of it.
    expect(placed.x + placed.width / 2).toBe(400)
    expect(placed.y + placed.height).toBeLessThan(50)
  })

  it('keeps a well-spaced series on one line above the trace', () => {
    const points = [0, 1, 2, 3, 4].map((i) => label(`p${i}`, 200 + i * 80, 50))
    const placed = placeValueLabels(points, [], BOUNDS)

    const tops = new Set(placed.map((box) => box.y))
    expect(tops.size).toBe(1)
  })

  /**
   * The same label on a real coordinate. Positions come out of the scales as fractions, and the
   * box's own area then differs from the area it shares with the lane by a few femto-pixels rather
   * than by nothing — in both directions, depending on the fraction. The search keeps the strictly
   * cheapest candidate, so that noise was enough to hand a label with eight free positions the
   * eighth of them: this one landed below and to the left of its point instead of above it, for no
   * reason that exists in the geometry. On a lane where every point is fractional, every label
   * went somewhere arbitrary and the series lost the shared row that makes it readable.
   */
  it('puts a lone label above its point on fractional coordinates too', () => {
    const [placed] = placeValueLabels([label('a', 242.15, 50.4)], [], BOUNDS)

    expect(placed.x + placed.width / 2).toBeCloseTo(242.15)
    expect(placed.y + placed.height).toBeLessThan(50.4)
  })

  it('never overlaps two labels of one blood pressure measurement', () => {
    // Three pressures on one timestamp, as close together as the demo case puts them.
    const measurement = [label('sys', 500, 30), label('mean', 500, 51), label('dia', 500, 62)]
    const placed = placeValueLabels(measurement, [], BOUNDS)

    expect(placed).toHaveLength(3)
    for (const [a, b] of pairs(placed)) {
      expect(overlapArea(a, b)).toBe(0)
    }
  })

  it('gives the preferred position to the topmost value of a measurement', () => {
    const measurement = [label('sys', 500, 30), label('mean', 500, 51), label('dia', 500, 62)]
    const placed = placeValueLabels(measurement, [], BOUNDS)
    const systolic = placed.find((box) => box.id === 'sys')!

    expect(systolic.x + systolic.width / 2).toBe(500)
    expect(systolic.y + systolic.height).toBeLessThan(30)
  })

  it('avoids the obstacles it is given', () => {
    // The readout box, pinned across the top of the lane where a label would otherwise go.
    const readout = { x: 380, y: 12, width: 160, height: 22 }
    const [placed] = placeValueLabels([label('a', 440, 50)], [readout], BOUNDS)

    expect(overlapArea(placed, readout)).toBe(0)
  })

  it('stays inside the lane at the top of the axis', () => {
    const [placed] = placeValueLabels([label('a', 400, 4)], [], BOUNDS)

    expect(placed.y).toBeGreaterThanOrEqual(BOUNDS.y)
    expect(placed.y + placed.height).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height)
  })

  it('stays inside the lane at both ends of the time axis', () => {
    const placed = placeValueLabels([label('first', 168, 50), label('last', 968, 50)], [], BOUNDS)

    for (const box of placed) {
      expect(box.x).toBeGreaterThanOrEqual(BOUNDS.x)
      expect(box.x + box.width).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width)
    }
  })

  it('places every label even where the lane is too crowded to place them cleanly', () => {
    // Ten points inside 40 pixels: no arrangement can separate them. Dropping one would be a
    // missing value in a clinical record, so all ten are still placed.
    const crowded = Array.from({ length: 10 }, (_, i) => label(`p${i}`, 400 + i * 4, 50))
    const placed = placeValueLabels(crowded, [], BOUNDS)

    expect(placed).toHaveLength(10)
    expect(new Set(placed.map((box) => box.id)).size).toBe(10)
  })

  it('is stable: the same input places the same way', () => {
    const points = [label('a', 300, 40), label('b', 320, 44), label('c', 340, 60)]

    expect(placeValueLabels(points, [], BOUNDS)).toEqual(placeValueLabels(points, [], BOUNDS))
  })

  it('orders the result left to right regardless of the input order', () => {
    const points = [label('c', 500, 40), label('a', 200, 40), label('b', 350, 40)]

    expect(placeValueLabels(points, [], BOUNDS).map((box) => box.id)).toEqual(['a', 'b', 'c'])
  })
})
