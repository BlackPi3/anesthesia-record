/**
 * The shape the entry sheet edits, and the conversions between it and a stored entry.
 *
 * A draft is one entry's correctable fields and nothing else: no id, no `recordedAt`, no
 * `deletedAt`, no revisions. Those belong to the record rather than to the person filling the
 * form, and leaving them out means a draft cannot accidentally carry a stale audit trail back
 * into a mutation.
 *
 * Creating and correcting therefore feed the same form. The only difference is what the caller
 * does with the result — `addBolus` or `correctBolus` — which is what lets one sheet serve both
 * without a mode flag threaded through every control.
 *
 * The two dispatchers at the bottom are where that difference is spent. Switching on `draft.type`
 * belongs with the type, so the components never name a mutation and the compiler checks that
 * every kind of draft has somewhere to go.
 */

import { BLOOD_PRESSURE_KINDS, PHASE_EVENTS, VITALS } from '../domain/catalog'
import {
  addBolus,
  addEvent,
  addInfusion,
  addVital,
  correctBolus,
  correctEvent,
  correctInfusion,
  correctVital,
} from '../domain/mutations'
import type {
  AnesthesiaCase,
  BolusUnit,
  Entry,
  InfusionRateUnit,
  PhaseEventKind,
  Timestamp,
  VitalKind,
} from '../domain/types'

export type Draft =
  | { type: 'vital'; vital: VitalKind; at: Timestamp; value: number }
  | { type: 'bolus'; drug: string; at: Timestamp; dose: number; unit: BolusUnit }
  | {
      type: 'infusion'
      drug: string
      startedAt: Timestamp
      endedAt: Timestamp | null
      rate: number
      unit: InfusionRateUnit
    }
  | { type: 'event'; event: PhaseEventKind; at: Timestamp }

/** The three kinds one cuff inflation reports. */
export type BloodPressureKind = (typeof BLOOD_PRESSURE_KINDS)[number]

/**
 * One of the three numbers of a blood pressure reading.
 *
 * `measured` is not "is this field filled in". A manual cuff gives a systolic and a diastolic and
 * no mean at all, so the mean is genuinely absent rather than zero — and the value is kept while
 * it is switched off, so changing your mind costs nothing.
 */
export interface PressureReading {
  value: number
  measured: boolean
}

/**
 * One non-invasive blood pressure measurement, as the sheet edits it.
 *
 * A cuff inflation is one event that reports three numbers, which is why this is one draft and not
 * three. It is stored as three vital entries all the same: the lane draws them as three series, a
 * correction afterwards touches exactly one of them, and nothing downstream has to learn about a
 * compound entry type. What is shared is the timestamp the user set, which is what makes them one
 * reading rather than three that happen to be near each other.
 */
export interface BloodPressureDraft {
  type: 'bloodPressure'
  at: Timestamp
  readings: Record<BloodPressureKind, PressureReading>
}

/**
 * What the creation sheet edits.
 *
 * Correcting is deliberately not part of it: an entry that already exists is always exactly one
 * vital, dose or milestone, so `correctDraft` below never has to answer what it would mean to
 * apply three numbers to one entry.
 */
export type NewDraft = Draft | BloodPressureDraft

/** A stored entry reduced to what the sheet may change. */
export function draftFrom(entry: Entry): Draft {
  switch (entry.type) {
    case 'vital':
      return { type: 'vital', vital: entry.vital, at: entry.at, value: entry.value }
    case 'bolus':
      return { type: 'bolus', drug: entry.drug, at: entry.at, dose: entry.dose, unit: entry.unit }
    case 'infusion':
      return {
        type: 'infusion',
        drug: entry.drug,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        rate: entry.rate,
        unit: entry.unit,
      }
    case 'event':
      return { type: 'event', event: entry.event, at: entry.at }
  }
}

/** The instant the draft is anchored to. An infusion is anchored to its start. */
export function draftTime(draft: NewDraft): Timestamp {
  return draft.type === 'infusion' ? draft.startedAt : draft.at
}

/**
 * Generic in the draft so it gives back the kind it was handed. Both sheets re-time their own
 * draft, and a signature returning the whole union would hand the correcting sheet a draft it has
 * no branch for.
 */
export function withTime<D extends NewDraft>(draft: D, at: Timestamp): D {
  return draft.type === 'infusion' ? { ...draft, startedAt: at } : { ...draft, at }
}

/** What the sheet's title bar says is being written down. */
export function draftTitle(draft: NewDraft): string {
  switch (draft.type) {
    case 'vital':
      return VITALS[draft.vital].label
    case 'bloodPressure':
      return 'Blutdruck'
    case 'bolus':
      return `${draft.drug} · Bolus`
    case 'infusion':
      return `${draft.drug} · Dauerinfusion`
    case 'event':
      return PHASE_EVENTS[draft.event].label
  }
}

/**
 * Whether the draft is complete enough to write.
 *
 * Three things can be wrong. An amount left at zero, which is the value the dose and rate fields
 * open on when the case holds nothing to copy — a dose of zero is not a dose, and the alternative,
 * opening on some plausible number, would be inventing a dose the user did not choose. A blood
 * pressure with all three numbers switched off, which is not a measurement at all. And a vital
 * outside the range its metric accepts.
 *
 * That last one is where the keypad is caught. Typing can only be stopped at the top — every
 * multi-digit number passes through smaller ones on the way, so a minimum cannot be applied to a
 * half-typed number — which leaves a value below the minimum, including the zero left behind by
 * deleting every digit, reaching the draft. Judging it here rather than in the field is what keeps
 * the range in one place and out of the components, and it is what lets the sheet refuse a number
 * instead of quietly correcting one the user typed.
 */
export function isComplete(draft: NewDraft): boolean {
  if (draft.type === 'bolus') return draft.dose > 0
  if (draft.type === 'infusion') return draft.rate > 0
  if (draft.type === 'vital') return inRange(draft.vital, draft.value)
  if (draft.type === 'bloodPressure') {
    const measured = measuredPressures(draft)
    return measured.length > 0 && measured.every((kind) => inRange(kind, draft.readings[kind].value))
  }
  return true
}

/** Whether a measured value is one the metric's field is allowed to produce. */
function inRange(kind: VitalKind, value: number): boolean {
  const [min, max] = VITALS[kind].inputRange
  return value >= min && value <= max
}

/** The kinds of one reading that were actually measured, in the order they are drawn. */
export function measuredPressures(draft: BloodPressureDraft): BloodPressureKind[] {
  return BLOOD_PRESSURE_KINDS.filter((kind) => draft.readings[kind].measured)
}

// ---------------------------------------------------------------------------
// Writing a draft back into the record
// ---------------------------------------------------------------------------

/**
 * Writes the draft as a new entry.
 *
 * A blood pressure reading is the one draft that is more than one entry. They are added by folding
 * over the same `addVital` the other vitals use, which is what keeps them ordinary points on the
 * chart: three separate corrections afterwards, three separate revision histories, and one shared
 * timestamp that says they came from one cuff. Folding also means the whole reading is a single
 * case-to-case step, so one undo takes all three back rather than peeling them off one at a time.
 */
export function addDraft(record: AnesthesiaCase, draft: NewDraft): AnesthesiaCase {
  switch (draft.type) {
    case 'vital':
      return addVital(record, draft)
    case 'bloodPressure':
      return measuredPressures(draft).reduce(
        (next, vital) => addVital(next, { vital, at: draft.at, value: draft.readings[vital].value }),
        record,
      )
    case 'bolus':
      return addBolus(record, draft)
    case 'infusion':
      return addInfusion(record, draft)
    case 'event':
      return addEvent(record, draft)
  }
}

/**
 * Applies the draft to an existing entry.
 *
 * The fields are listed out per branch rather than spread, so a draft can never carry a field into
 * a correction that the entry type does not own.
 */
export function correctDraft(record: AnesthesiaCase, id: string, draft: Draft): AnesthesiaCase {
  switch (draft.type) {
    case 'vital':
      return correctVital(record, id, { at: draft.at, value: draft.value })
    case 'bolus':
      return correctBolus(record, id, {
        at: draft.at,
        drug: draft.drug,
        dose: draft.dose,
        unit: draft.unit,
      })
    case 'infusion':
      return correctInfusion(record, id, {
        startedAt: draft.startedAt,
        endedAt: draft.endedAt,
        drug: draft.drug,
        rate: draft.rate,
        unit: draft.unit,
      })
    case 'event':
      return correctEvent(record, id, { at: draft.at })
  }
}
