import { describe, expect, it } from 'vitest'

import {
  BLOOD_PRESSURE_KINDS,
  GRID_INTERVAL_MS,
  LANES,
  VITALS,
  laneForVital,
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

describe('pointerToMeasurement', () => {
  const area = { left: 0, right: 600, top: 0, bottom: 300 }
  const window = { from: CASE_START, to: CASE_START + minutes(60) }
  const scales = createLaneScales(area, window, VITALS.spo2.plotRange) // [70, 100]

  it('maps the top of the lane to the highest value and the bottom to the lowest', () => {
    expect(pointerToMeasurement({ x: 0, y: 0 }, scales, 1).value).toBe(100)
    expect(pointerToMeasurement({ x: 0, y: 300 }, scales, 1).value).toBe(70)
  })

  it('maps a position in the plot to the timestamp and value it sits on', () => {
    // Half way across a 60 minute window, half way up a 70–100 axis.
    const measurement = pointerToMeasurement({ x: 300, y: 150 }, scales, 1)
    expect(measurement.at).toBe(CASE_START + minutes(30))
    expect(measurement.value).toBe(85)
  })

  it('clamps a pointer that leaves the plot area instead of inventing a value', () => {
    const belowLeft = pointerToMeasurement({ x: -80, y: 420 }, scales, 1)
    expect(belowLeft.at).toBe(window.from)
    expect(belowLeft.value).toBe(70)

    const aboveRight = pointerToMeasurement({ x: 900, y: -50 }, scales, 1)
    expect(aboveRight.at).toBe(window.to)
    expect(aboveRight.value).toBe(100)
  })

  it('snaps the value to the metric step', () => {
    const temperature = createLaneScales(area, window, VITALS.temperature.plotRange) // [34, 40]
    const measurement = pointerToMeasurement({ x: 0, y: 150 }, temperature, 0.1)
    expect(measurement.value).toBe(37)
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

  it('resolves the lane a vital is drawn in', () => {
    expect(laneForVital('bloodPressureMean').id).toBe('bloodPressure')
    expect(laneForVital('spo2').id).toBe('spo2')
  })
})
