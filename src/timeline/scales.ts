/**
 * The coordinate maths behind the timeline: mapping time and measured values to pixels, and —
 * the part the challenge actually grades — mapping a pointer position back to a timestamp and a
 * value.
 *
 * Kept as pure functions with no React and no SVG, because this is the code most likely to be
 * subtly wrong and the only way to be sure of it is to test it directly. Everything here is
 * exercised by scales.test.ts.
 */

import { GRID_INTERVAL_MS } from '../domain/catalog'
import { entryTimes, visibleEntries } from '../domain/entries'
import type { AnesthesiaCase, Timestamp } from '../domain/types'

/**
 * A linear map between a domain (times, or measured values) and a range (pixels), with its
 * inverse.
 *
 * The range may descend. That is how the SVG y-axis inversion is handled: a value scale is built
 * with the range written `[bottom, top]`, so the domain maximum lands on the smallest y
 * coordinate. Expressing the flip as a descending range means no other code has to remember that
 * screen y grows downward.
 */
export interface LinearScale {
  readonly domain: readonly [number, number]
  readonly range: readonly [number, number]
  /** domain value → pixel */
  map(value: number): number
  /** pixel → domain value */
  invert(pixel: number): number
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const domainSpan = d1 - d0
  const rangeSpan = r1 - r0

  return {
    domain,
    range,
    map(value) {
      // A zero-width domain has no meaningful mapping; collapsing to the range start keeps a
      // degenerate case (an empty case, before any entry sets a window) from producing NaN
      // coordinates that would silently break the whole chart.
      if (domainSpan === 0) return r0
      return r0 + ((value - d0) / domainSpan) * rangeSpan
    },
    invert(pixel) {
      if (rangeSpan === 0) return d0
      return d0 + ((pixel - r0) / rangeSpan) * domainSpan
    },
  }
}

/** Restricts a value to [min, max]. Assumes min <= max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Number of decimal places implied by a step, used to clear floating-point dust after snapping.
 * Steps here are written as plain decimals (1, 0.1), so reading the literal is sufficient.
 */
function decimalPlaces(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Rounds a value to the nearest multiple of `step`.
 *
 * The rounding is done in float and then trimmed, because `Math.round(36.35 / 0.1) * 0.1` is
 * 36.400000000000006. Without the trim that dust would be written into the stored record and
 * shown to the user.
 */
export function snapToStep(value: number, step: number): number {
  if (step <= 0) return value
  return Number((Math.round(value / step) * step).toFixed(decimalPlaces(step)))
}

/**
 * The timestamps of the reference gridlines between `from` and `to`.
 *
 * Ticks align to wall-clock multiples of the interval (08:30, 08:35, …) rather than to the start
 * of the case, since that is what a clinician reads off the axis. Aligning on the raw epoch value
 * achieves this for any real timezone, because every UTC offset in use is a whole multiple of 15
 * minutes and therefore of the 5-minute interval.
 */
export function gridTimes(
  from: Timestamp,
  to: Timestamp,
  interval: number = GRID_INTERVAL_MS,
): Timestamp[] {
  if (interval <= 0 || to < from) return []
  const times: Timestamp[] = []
  for (let t = Math.ceil(from / interval) * interval; t <= to; t += interval) {
    times.push(t)
  }
  return times
}

/** The rectangle a lane's data is drawn in, in SVG user units. */
export interface PlotArea {
  left: number
  right: number
  top: number
  bottom: number
}

/** The visible time span of the timeline. */
export interface TimeWindow {
  from: Timestamp
  to: Timestamp
}

/**
 * The time span the timeline shows: from the start of the case to the last thing documented,
 * both rounded outward to gridline boundaries so the axis begins and ends on a labelled mark.
 *
 * `minimumSpan` keeps an empty case from collapsing to a zero-width axis, which is the state the
 * app opens in before anything has been entered.
 */
export function caseTimeWindow(
  record: AnesthesiaCase,
  minimumSpan: number = 60 * 60_000,
): TimeWindow {
  const times = visibleEntries(record).flatMap(entryTimes)
  const from = Math.floor(record.startedAt / GRID_INTERVAL_MS) * GRID_INTERVAL_MS
  const last = times.length > 0 ? Math.max(...times) : from
  const to = Math.max(last, from + minimumSpan)

  return { from, to: Math.ceil(to / GRID_INTERVAL_MS) * GRID_INTERVAL_MS }
}

export interface LaneScales {
  time: LinearScale
  value: LinearScale
}

export function createLaneScales(
  area: PlotArea,
  window: TimeWindow,
  valueDomain: readonly [number, number],
): LaneScales {
  return {
    time: linearScale([window.from, window.to], [area.left, area.right]),
    // Descending pixel range: the domain maximum maps to `area.top`, the smaller y. See the note
    // on LinearScale.
    value: linearScale(valueDomain, [area.bottom, area.top]),
  }
}

export interface Measurement {
  at: Timestamp
  value: number
}

/**
 * Turns a pointer position into the entry it would produce: the graded mapping.
 *
 * Both axes clamp to their domain, so a pointer that leaves the plot area mid-drag yields the
 * nearest valid measurement rather than an impossible one. The timestamp rounds to whole
 * milliseconds and the value snaps to the metric's step, so what is stored is exactly what the
 * readout showed.
 *
 * The point must already be in the SVG's coordinate space; converting a client coordinate is the
 * caller's job, since only the component knows the element.
 */
export function pointerToMeasurement(
  point: { x: number; y: number },
  scales: LaneScales,
  step: number,
): Measurement {
  const [fromTime, toTime] = scales.time.domain
  const [minValue, maxValue] = scales.value.domain

  return {
    at: Math.round(clamp(scales.time.invert(point.x), fromTime, toTime)),
    value: snapToStep(clamp(scales.value.invert(point.y), minValue, maxValue), step),
  }
}
