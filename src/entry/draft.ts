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

import { PHASE_EVENTS, VITALS } from '../domain/catalog'
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
export function draftTime(draft: Draft): Timestamp {
  return draft.type === 'infusion' ? draft.startedAt : draft.at
}

export function withTime(draft: Draft, at: Timestamp): Draft {
  return draft.type === 'infusion' ? { ...draft, startedAt: at } : { ...draft, at }
}

/** What the sheet's title bar says is being written down. */
export function draftTitle(draft: Draft): string {
  switch (draft.type) {
    case 'vital':
      return VITALS[draft.vital].label
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
 * The only thing that can be missing is an amount left at zero, which is the value the dose and
 * rate controls open on when the case holds nothing to copy. A dose of zero is not a dose, and
 * the alternative — opening on some plausible number — would be inventing a dose the user did
 * not choose.
 */
export function isComplete(draft: Draft): boolean {
  if (draft.type === 'bolus') return draft.dose > 0
  if (draft.type === 'infusion') return draft.rate > 0
  return true
}

// ---------------------------------------------------------------------------
// Writing a draft back into the record
// ---------------------------------------------------------------------------

/** Writes the draft as a new entry. */
export function addDraft(record: AnesthesiaCase, draft: Draft): AnesthesiaCase {
  switch (draft.type) {
    case 'vital':
      return addVital(record, draft)
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
