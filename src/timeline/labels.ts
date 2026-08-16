/**
 * Where the value labels go when the chart is asked to spell its numbers out.
 *
 * A point label is only useful if it can be read and if it is unambiguously next to its own point.
 * Written naively — always above the marker — the two things that make this chart what it is break
 * it immediately: a blood pressure measurement is three values a few pixels apart on one shared
 * timestamp, and a dense series puts neighbouring points closer together than their labels are
 * wide. So placement is a search, not an offset.
 *
 * Each label takes the first of its candidate positions that hides nothing and stays inside the
 * lane; if none is free it takes the least bad one, because a value that is drawn slightly over a
 * gridline is still legible, and one that is silently dropped is a hole in a clinical record.
 *
 * Pure geometry, no React and no SVG, for the same reason `scales.ts` is: this is the part most
 * likely to be subtly wrong, and numbers are the honest way to check it.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A label asking to be placed near the point at (`x`, `y`). */
export interface LabelRequest {
  id: string
  /** The point the label belongs to, in the lane's coordinate space. */
  x: number
  y: number
  width: number
  height: number
}

/** The placed label: `x`/`y` are now the box's top-left corner, not the point's. */
export type PlacedLabel = Box & { id: string }

/** Clearance between a label and the point it belongs to. */
const GAP = 7

/**
 * How much worse it is for a label to leave the lane than to sit over something inside it.
 * Overlapping ink stays readable; a clipped label loses digits, which is the one failure that
 * turns a number into a different number.
 */
const OUT_OF_BOUNDS_WEIGHT = 3

/**
 * Candidate positions, in the order they are preferred.
 *
 * Above first: it is where a value is written on a paper protocol, and with a series read left to
 * right it keeps every label on one line above the trace. Below is the mirror for points near the
 * top of the axis. The four side positions exist for the blood pressure lane, where three values
 * share an x and the vertical room between them is measured in single pixels.
 */
function candidates(request: LabelRequest): Box[] {
  const { x, y, width, height } = request
  const centre = x - width / 2
  const above = y - GAP - height
  const below = y + GAP
  const middle = y - height / 2

  return [
    { x: centre, y: above, width, height },
    { x: centre, y: below, width, height },
    { x: x + GAP, y: middle, width, height },
    { x: x - GAP - width, y: middle, width, height },
    { x: x + GAP, y: above, width, height },
    { x: x - GAP - width, y: above, width, height },
    { x: x + GAP, y: below, width, height },
    { x: x - GAP - width, y: below, width, height },
  ]
}

/** Area the two boxes share, zero if they do not touch. */
export function overlapArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

function cost(box: Box, blocked: readonly Box[], bounds: Box): number {
  const outside = box.width * box.height - overlapArea(box, bounds)
  const hidden = blocked.reduce((total, other) => total + overlapArea(box, other), 0)
  return hidden + outside * OUT_OF_BOUNDS_WEIGHT
}

/**
 * Places every label, avoiding the labels already placed and the `obstacles` given — the markers
 * themselves, and the readout box when a point is selected.
 *
 * Placement runs left to right, and top to bottom within one timestamp, so a lane redrawn after a
 * correction reads the same way it did before: earlier points keep the position they had, and the
 * highest of three pressures is the one that gets the preferred spot above the marker.
 *
 * Returns the labels in that same order rather than the input's.
 */
export function placeValueLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Box[],
  bounds: Box,
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const taken: Box[] = []
  const ordered = [...requests].sort((a, b) => a.x - b.x || a.y - b.y)

  for (const request of ordered) {
    let best: Box | null = null
    let bestCost = Infinity

    for (const candidate of candidates(request)) {
      const candidateCost = cost(candidate, [...taken, ...obstacles], bounds)
      // Strictly less, so an equally good later candidate never displaces a more preferred one.
      if (candidateCost < bestCost) {
        best = candidate
        bestCost = candidateCost
      }
      if (bestCost === 0) break
    }

    // `candidates` is never empty, so this is only here to satisfy the type.
    if (!best) continue

    placed.push({ id: request.id, ...best })
    taken.push(best)
  }

  return placed
}
