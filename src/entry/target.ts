/**
 * What an „Erfassen“ button opens.
 *
 * There is no longer a step asking what kind of thing is being written down, because the button
 * that was pressed already answered it: the record is the menu. A lane holding one metric goes
 * straight to that metric's value, with no picker in between. The blood pressure lane opens one
 * reading holding three numbers. The two bands still have to ask which drug or which milestone,
 * since those are lists rather than rows on the chart.
 */

import type { LaneDef } from '../domain/catalog'
import type { VitalKind } from '../domain/types'

export type AddTarget =
  | { kind: 'vital'; vital: VitalKind }
  | { kind: 'bloodPressure' }
  | { kind: 'medication' }
  | { kind: 'event' }

/**
 * What a lane's own button opens.
 *
 * Keyed on the lane id rather than on how many kinds it holds, so regrouping the lanes — the thing
 * `LANES` exists to make cheap — cannot silently turn the combined reading into three trips or the
 * other way round.
 */
export function targetForLane(lane: LaneDef): AddTarget {
  return lane.id === 'bloodPressure'
    ? { kind: 'bloodPressure' }
    : { kind: 'vital', vital: lane.vitals[0] }
}

/** Stable identity for a target, so the sheet mounts fresh when a different button opens it. */
export function targetKey(target: AddTarget): string {
  return target.kind === 'vital' ? `vital:${target.vital}` : target.kind
}
