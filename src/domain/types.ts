/**
 * The data model for one anesthesia case (Narkoseprotokoll).
 *
 * Decisions encoded here, in case the reasoning is not obvious from the shapes:
 *
 * - Times are epoch milliseconds, not `Date` objects or ISO strings. The timeline maps time to
 *   an x coordinate arithmetically, so a plain number avoids parsing on every render, and it
 *   survives JSON round-trips through localStorage unchanged. Calendar dates that carry no time
 *   of day (birth date, case date) stay ISO `YYYY-MM-DD` strings, since they are displayed, not
 *   plotted.
 *
 * - Entries form a discriminated union on `type`. A vital, a bolus, an infusion and a phase
 *   event are genuinely different shapes; the union lets the compiler enforce which fields exist
 *   in which branch instead of leaving optional fields everywhere.
 *
 * - Medications split into two entry types rather than one type with a `mode` field. A bolus is
 *   a point in time; an infusion is an interval with a start, an end and a rate. They are drawn
 *   differently on the timeline and edited differently, so they are modelled differently.
 *
 * - Corrections are non-destructive. Editing an entry pushes the previous values onto
 *   `revisions`; removing an entry sets `deletedAt` instead of dropping it from the array. The
 *   brief requires corrections and removals to leave a clear audit trail, which is only possible
 *   if the earlier state is still in the record.
 */

/** Milliseconds since the Unix epoch. */
export type Timestamp = number

/** A calendar date with no time of day, ISO `YYYY-MM-DD`. */
export type IsoDate = string

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

/**
 * Blood pressure is three separate kinds rather than one compound entry, so that every vital
 * entry carries exactly one number. See docs/decisions.md.
 */
export type VitalKind =
  | 'spo2'
  | 'heartRate'
  | 'bloodPressureSystolic'
  | 'bloodPressureMean'
  | 'bloodPressureDiastolic'
  | 'temperature'

// ---------------------------------------------------------------------------
// Phases and events
// ---------------------------------------------------------------------------

export type PhaseEventKind =
  | 'anesthesiaStart'
  | 'incision'
  | 'suture'
  | 'emergenceEnd'
  | 'discharge'

// ---------------------------------------------------------------------------
// Medications and fluids
// ---------------------------------------------------------------------------

/** Units for a single dose. Separate from rate units so a bolus cannot be given in ml/h. */
export type BolusUnit = 'mg' | 'µg' | 'ml' | 'IE'

/** Units for a continuous rate. */
export type InfusionRateUnit = 'mg/h' | 'µg/kg/min' | 'ml/h'

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/**
 * One correction to an entry: when it was made, and the values as they stood before it.
 *
 * Generic over the correctable fields so each entry type declares precisely what can change.
 * Reading the trail back is then just walking `revisions` oldest to newest.
 */
export interface Revision<TFields> {
  revisedAt: Timestamp
  previous: TFields
}

/** Fields every entry carries, regardless of what it records. */
interface EntryMeta {
  id: string
  /** When the entry was first written down, as opposed to the clinical time it describes. */
  recordedAt: Timestamp
  /** Set when the entry is removed. Removed entries stay in the record, hidden from the chart. */
  deletedAt: Timestamp | null
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface VitalEntry extends EntryMeta {
  type: 'vital'
  vital: VitalKind
  /** Clinical time of the measurement. */
  at: Timestamp
  value: number
  revisions: Revision<Pick<VitalEntry, 'at' | 'value'>>[]
}

export interface BolusEntry extends EntryMeta {
  type: 'bolus'
  /** Free text so an unlisted drug can still be documented; the picker offers DRUGS. */
  drug: string
  at: Timestamp
  dose: number
  unit: BolusUnit
  revisions: Revision<Pick<BolusEntry, 'at' | 'drug' | 'dose' | 'unit'>>[]
}

export interface InfusionEntry extends EntryMeta {
  type: 'infusion'
  drug: string
  startedAt: Timestamp
  /** null while the infusion is still running. */
  endedAt: Timestamp | null
  rate: number
  unit: InfusionRateUnit
  revisions: Revision<
    Pick<InfusionEntry, 'startedAt' | 'endedAt' | 'drug' | 'rate' | 'unit'>
  >[]
}

export interface PhaseEventEntry extends EntryMeta {
  type: 'event'
  event: PhaseEventKind
  at: Timestamp
  revisions: Revision<Pick<PhaseEventEntry, 'at'>>[]
}

export type Entry = VitalEntry | BolusEntry | InfusionEntry | PhaseEventEntry

/** `'vital' | 'bolus' | 'infusion' | 'event'`, derived so it cannot drift from the union. */
export type EntryType = Entry['type']

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------

export type AsaClass = 1 | 2 | 3 | 4 | 5

/** Demo patients only. This app never holds real or realistic patient data. */
export interface Patient {
  lastName: string
  firstName: string
  dateOfBirth: IsoDate
  sex: 'w' | 'm' | 'd'
  weightKg: number
  heightCm: number
  asa: AsaClass
  allergies: string[]
}

/** Pre-operative reference values, shown in the case header. */
export interface Baseline {
  bloodPressureSystolic: number
  bloodPressureDiastolic: number
  heartRate: number
}

export interface AnesthesiaCase {
  id: string
  patient: Patient
  procedure: string
  date: IsoDate
  /**
   * Origin of the timeline's x-axis. Separate from the `anesthesiaStart` event so the chart has
   * a window to draw before any entry exists, which is the empty state the app opens in.
   */
  startedAt: Timestamp
  /** Unordered. Consumers sort by time at render; storage order carries no meaning. */
  entries: Entry[]
}
