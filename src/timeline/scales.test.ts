import { describe, expect, it } from 'vitest'

import {
  BLOOD_PRESSURE_KINDS,
  GRID_INTERVAL_MS,
  LANES,
  MAJOR_INTERVAL_MS,
  VITALS,
  laneForVital,
  laneGridStep,
  laneRange,
  laneUnit,
} from '../domain/catalog'
import {
  clamp,
  createLaneScales,
  gridTimes,
  linearScale,
  pointerToMeasurement,
  snapToStep,
  valueTicks,
} from './scales'

const CASE_START = new Date('2026-08-12T08:30:00').getTime()
const minutes = (n: number) => n * 60_000

describe('linearScale', () => {
  it('maps the domain endpoints onto the range endpoints', () => {
    const scale = linearScale([0, 100], [20, 220])
    expect(scale.map(0)).toBe(20)
    expect(scale.map(100)).toBe(220)
    expect(scale.map(50)).toBe(120)
  })

  it('inverts back to the original value', () => {
    const scale = linearScale([70, 100], [400, 0])
    for (const value of [70, 82.5, 99, 100]) {
      expect(scale.invert(scale.map(value))).toBeCloseTo(value, 10)
    }
  })

  it('maps the domain maximum to the smallest pixel when the range descends', () => {
    // This is the SVG y-axis inversion, and the single easiest thing to get backwards.
    const scale = linearScale([70, 100], [100, 0])
    expect(scale.map(100)).toBe(0)
    expect(scale.map(70)).toBe(100)
    expect(scale.map(85)).toBe(50)
  })

  it('collapses instead of producing NaN when the domain has no width', () => {
    const scale = linearScale([5, 5], [0, 200])
    expect(scale.map(5)).toBe(0)
    expect(Number.isNaN(scale.map(9))).toBe(false)
  })

  it('collapses instead of producing NaN when the range has no width', () => {
    const scale = linearScale([0, 100], [40, 40])
    expect(scale.invert(40)).toBe(0)
    expect(Number.isNaN(scale.invert(40))).toBe(false)
  })
})

describe('clamp', () => {
  it('restricts a value to the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(42, 0, 10)).toBe(10)
  })
})

describe('snapToStep', () => {
  it('rounds to whole numbers for a step of 1', () => {
    expect(snapToStep(98.4, 1)).toBe(98)
    expect(snapToStep(98.5, 1)).toBe(99)
  })

  it('rounds to one decimal for a step of 0.1 without floating-point dust', () => {
    expect(snapToStep(36.35, 0.1)).toBe(36.4)
    expect(snapToStep(36.62, 0.1)).toBe(36.6)
    // The naive form of this returns 36.400000000000006.
    expect(String(snapToStep(36.35, 0.1))).toBe('36.4')
  })

  it('leaves the value untouched for a non-positive step', () => {
    expect(snapToStep(36.35, 0)).toBe(36.35)
  })
})

describe('gridTimes', () => {
  it('draws every major rule on one of the five-minute lines', () => {
    // The two weights are one grid, not two laid over each other: the quarter-hour rule is always
    // also a five-minute line, which is what lets a single pass draw both.
    expect(MAJOR_INTERVAL_MS % GRID_INTERVAL_MS).toBe(0)
  })

  it('aligns ticks to wall-clock five-minute marks, not to the case start', () => {
    const from = CASE_START + minutes(2) // 08:32
    const ticks = gridTimes(from, from + minutes(11))
    expect(ticks.map((t) => new Date(t).getMinutes())).toEqual([35, 40])
  })

  it('includes a tick that falls exactly on the end of the window', () => {
    const ticks = gridTimes(CASE_START, CASE_START + GRID_INTERVAL_MS)
    expect(ticks).toEqual([CASE_START, CASE_START + GRID_INTERVAL_MS])
  })

  it('returns nothing for an inverted or zero-interval window', () => {
    expect(gridTimes(CASE_START + minutes(5), CASE_START)).toEqual([])
    expect(gridTimes(CASE_START, CASE_START + minutes(30), 0)).toEqual([])
  })
})

describe('valueTicks', () => {
  it('rules the band from its floor to its ceiling', () => {
    expect(valueTicks([94, 100], 1).map((tick) => tick.value)).toEqual([94, 95, 96, 97, 98, 99, 100])
  })

  /**
   * The regression this function was born with. The rules run on the lattice through the band's
   * floor, not the one through zero, and rounding them with `snapToStep` moved a heart rate lane's
   * 90 to 100 — which then failed to match the midpoint, so the lane drew its rules in the wrong
   * places and printed no axis numbers at all. Visible immediately in a screenshot, invisible in
   * the source.
   */
  it('rules from the floor rather than from the nearest multiple of the step', () => {
    expect(valueTicks([40, 140], 25).map((tick) => tick.value)).toEqual([40, 65, 90, 115, 140])
    expect(valueTicks([40, 220], 30).map((tick) => tick.value)).toEqual([
      40, 70, 100, 130, 160, 190, 220,
    ])
  })

  it('labels the floor, the midpoint and the ceiling, and nothing else', () => {
    const labelled = valueTicks([40, 140], 25)
      .filter((tick) => tick.labelled)
      .map((tick) => tick.value)
    expect(labelled).toEqual([40, 90, 140])
  })

  it('leaves no floating-point dust on a band that steps in tenths', () => {
    const values = valueTicks([35, 38], 0.1).map((tick) => tick.value)
    expect(values).toContain(35.7)
    expect(values.at(-1)).toBe(38)
  })

  it('collapses instead of looping forever on a degenerate band', () => {
    expect(valueTicks([50, 50], 1)).toEqual([{ value: 50, labelled: true }])
    expect(valueTicks([40, 140], 0)).toEqual([{ value: 40, labelled: true }])
  })
})

describe('pointerToMeasurement', () => {
  const area = { left: 0, right: 600, top: 0, bottom: 300 }
  const window = { from: CASE_START, to: CASE_START + minutes(60) }
  const scales = createLaneScales(area, window, VITALS.spo2.plotRange) // [94, 100]

  it('maps the top of the lane to the highest value and the bottom to the lowest', () => {
    expect(pointerToMeasurement({ x: 0, y: 0 }, scales, 1).value).toBe(100)
    expect(pointerToMeasurement({ x: 0, y: 300 }, scales, 1).value).toBe(94)
  })

  it('maps a position in the plot to the timestamp and value it sits on', () => {
    // Half way across a 60 minute window, half way up a 94–100 axis.
    const measurement = pointerToMeasurement({ x: 300, y: 150 }, scales, 1)
    expect(measurement.at).toBe(CASE_START + minutes(30))
    expect(measurement.value).toBe(97)
  })

  it('clamps a pointer that leaves the plot area instead of inventing a value', () => {
    const belowLeft = pointerToMeasurement({ x: -80, y: 420 }, scales, 1)
    expect(belowLeft.at).toBe(window.from)
    expect(belowLeft.value).toBe(94)

    const aboveRight = pointerToMeasurement({ x: 900, y: -50 }, scales, 1)
    expect(aboveRight.at).toBe(window.to)
    expect(aboveRight.value).toBe(100)
  })

  it('snaps the value to the metric step', () => {
    const temperature = createLaneScales(area, window, VITALS.temperature.plotRange) // [35, 38]
    const measurement = pointerToMeasurement({ x: 0, y: 150 }, temperature, 0.1)
    expect(measurement.value).toBe(36.5)
    expect(Number.isInteger(measurement.value * 10)).toBe(true)
  })

  it('round-trips a measurement back to the pixel it came from', () => {
    const at = CASE_START + minutes(17)
    const value = 96
    const x = scales.time.map(at)
    const y = scales.value.map(value)
    expect(pointerToMeasurement({ x, y }, scales, 1)).toEqual({ at, value })
  })
})

describe('lane configuration', () => {
  it('places every vital kind in exactly one lane', () => {
    const kinds = LANES.flatMap((lane) => lane.vitals)
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(new Set(kinds)).toEqual(new Set(Object.keys(VITALS)))
  })

  it('gives the kinds sharing a lane the same unit, since they share one scale', () => {
    for (const lane of LANES) {
      const units = new Set(lane.vitals.map((kind) => VITALS[kind].unit))
      expect(units.size, `lane "${lane.id}" mixes units`).toBe(1)
      expect(laneUnit(lane)).toBe([...units][0])
    }
  })

  it('spans the widest plot range of the kinds it holds', () => {
    const bloodPressure = LANES.find((lane) => lane.id === 'bloodPressure')!
    const [min, max] = laneRange(bloodPressure)
    for (const kind of BLOOD_PRESSURE_KINDS) {
      expect(VITALS[kind].plotRange[0]).toBeGreaterThanOrEqual(min)
      expect(VITALS[kind].plotRange[1]).toBeLessThanOrEqual(max)
    }
  })

  /**
   * The bands are narrow enough that their edges matter, so the two properties that keep a narrow
   * band honest are asserted rather than left to the eye.
   */
  it('labels its midpoint with a number that is actually on the axis', () => {
    for (const lane of LANES) {
      const [min, max] = laneRange(lane)
      const { decimals, step } = VITALS[lane.vitals[0]]
      const middle = (min + max) / 2
      // The lane prints floor, midpoint and ceiling rounded to the metric's precision. A midpoint
      // that does not survive that rounding is a gridline drawn somewhere other than where its
      // own label says it is.
      expect(Number(middle.toFixed(decimals)), `lane "${lane.id}" has a ragged midpoint`).toBe(
        middle,
      )
      expect(snapToStep(middle, step)).toBe(middle)
    }
  })

  it('rules its band in a rhythm that reaches its midpoint', () => {
    for (const lane of LANES) {
      const [min, max] = laneRange(lane)
      const step = laneGridStep(lane)
      // The lane's three labelled rules are floor, midpoint and ceiling. A spacing that does not
      // divide the half-span would step past the midpoint, putting the one rule that carries a
      // number between two hairlines instead of on the grid it belongs to.
      expect((max - min) / 2 / step, `lane "${lane.id}" rules past its midpoint`).toBe(
        Math.round((max - min) / 2 / step),
      )

      const labelled = valueTicks([min, max], step).filter((tick) => tick.labelled)
      expect(labelled.map((tick) => tick.value), `lane "${lane.id}"`).toEqual([
        min,
        (min + max) / 2,
        max,
      ])
    }
  })

  it('never draws an axis reaching further than the value control can go', () => {
    for (const lane of LANES) {
      const [min, max] = laneRange(lane)
      expect(min, `lane "${lane.id}" has an empty axis`).toBeLessThan(max)

      // Stated per lane rather than per kind, because the axis belongs to the lane: the three
      // pressures share one, and the diastolic in particular is drawn on a scale reaching higher
      // than a diastolic is ever entered. What must hold is that the lane's own floor and ceiling
      // are numbers *something* in it can be, or the axis promises a reading it cannot hold.
      const reach = lane.vitals.map((kind) => VITALS[kind].inputRange)
      expect(Math.min(...reach.map(([low]) => low)), `lane "${lane.id}" floor`).toBeLessThanOrEqual(
        min,
      )
      expect(
        Math.max(...reach.map(([, high]) => high)),
        `lane "${lane.id}" ceiling`,
      ).toBeGreaterThanOrEqual(max)
    }
  })

  it('resolves the lane a vital is drawn in', () => {
    expect(laneForVital('bloodPressureMean').id).toBe('bloodPressure')
    expect(laneForVital('spo2').id).toBe('spo2')
  })
})
