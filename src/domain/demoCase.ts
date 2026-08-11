/**
 * Fictional demo case. Nothing here describes a real person or a real procedure: the patient uses
 * the German placeholder name Mustermann, and the values are invented to give the timeline a
 * plausible shape to render.
 *
 * Times are fixed rather than relative to `Date.now()` so that the chart, the screenshots and the
 * Playwright assertions all see the same case every run. `CASE_START` is parsed without a zone
 * suffix, which means local time, so tests pin the timezone rather than expecting UTC.
 *
 * Two entries exist to exercise the correction paths rather than to document anything: one heart
 * rate carries a revision, and one saturation reading is marked removed.
 */

import type {
  AnesthesiaCase,
  BolusEntry,
  Entry,
  InfusionEntry,
  PhaseEventEntry,
  PhaseEventKind,
  Timestamp,
  VitalEntry,
  VitalKind,
} from './types'

const CASE_DATE = '2026-08-12'
const CASE_START = new Date(`${CASE_DATE}T08:30:00`).getTime()

/** Timestamp `minutes` after the start of the case. */
const at = (minutes: number): Timestamp => CASE_START + minutes * 60_000

function vital(kind: VitalKind, minutes: number, value: number): VitalEntry {
  return {
    type: 'vital',
    id: `demo-${kind}-${minutes}`,
    vital: kind,
    at: at(minutes),
    value,
    recordedAt: at(minutes),
    deletedAt: null,
    revisions: [],
  }
}

const MEASUREMENT_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]

const spo2 = [98, 99, 99, 100, 100, 99, 98, 99, 99, 100]
const heartRate = [78, 74, 71, 69, 79, 83, 81, 77, 74, 72]

const spo2Entries = MEASUREMENT_MINUTES.map((minutes, i) => vital('spo2', minutes, spo2[i]))

const heartRateEntries = MEASUREMENT_MINUTES.map((minutes, i) =>
  vital('heartRate', minutes, heartRate[i]),
)

// The reading at minute 20 was first written down as 92 and corrected two minutes later.
heartRateEntries[4] = {
  ...heartRateEntries[4],
  revisions: [{ revisedAt: at(22), previous: { at: at(20), value: 92 } }],
}

// A saturation reading entered on the wrong patient monitor and removed again.
spo2Entries[5] = { ...spo2Entries[5], deletedAt: at(26) }

// Non-invasive blood pressure is measured every ten minutes; each measurement is three entries
// sharing one timestamp.
const bloodPressure: Array<[minutes: number, sys: number, mean: number, dia: number]> = [
  [0, 138, 101, 82],
  [10, 118, 86, 69],
  [20, 105, 76, 61],
  [30, 112, 82, 66],
  [40, 124, 91, 74],
]

const bloodPressureEntries = bloodPressure.flatMap(([minutes, sys, mean, dia]) => [
  vital('bloodPressureSystolic', minutes, sys),
  vital('bloodPressureMean', minutes, mean),
  vital('bloodPressureDiastolic', minutes, dia),
])

const temperatureEntries = [
  vital('temperature', 0, 36.6),
  vital('temperature', 15, 36.4),
  vital('temperature', 30, 36.2),
  vital('temperature', 45, 36.3),
]

function phaseEvent(event: PhaseEventKind, minutes: number): PhaseEventEntry {
  return {
    type: 'event',
    id: `demo-event-${event}`,
    event,
    at: at(minutes),
    recordedAt: at(minutes),
    deletedAt: null,
    revisions: [],
  }
}

const eventEntries: PhaseEventEntry[] = [
  phaseEvent('anesthesiaStart', 0),
  phaseEvent('incision', 12),
  phaseEvent('suture', 41),
  phaseEvent('emergenceEnd', 48),
  phaseEvent('discharge', 95),
]

const bolusEntries: BolusEntry[] = [
  {
    type: 'bolus',
    id: 'demo-bolus-propofol',
    drug: 'Propofol',
    at: at(1),
    dose: 150,
    unit: 'mg',
    recordedAt: at(1),
    deletedAt: null,
    revisions: [],
  },
  {
    type: 'bolus',
    id: 'demo-bolus-rocuronium',
    drug: 'Rocuronium',
    at: at(3),
    dose: 30,
    unit: 'mg',
    recordedAt: at(3),
    deletedAt: null,
    revisions: [],
  },
  {
    type: 'bolus',
    id: 'demo-bolus-ondansetron',
    drug: 'Ondansetron',
    at: at(40),
    dose: 4,
    unit: 'mg',
    recordedAt: at(40),
    deletedAt: null,
    revisions: [],
  },
]

const infusionEntries: InfusionEntry[] = [
  {
    type: 'infusion',
    id: 'demo-infusion-remifentanil',
    drug: 'Remifentanil',
    startedAt: at(2),
    endedAt: at(44),
    rate: 0.2,
    unit: 'µg/kg/min',
    recordedAt: at(2),
    deletedAt: null,
    revisions: [],
  },
  {
    type: 'infusion',
    id: 'demo-infusion-ringer',
    drug: 'Ringer-Acetat',
    startedAt: at(0),
    endedAt: at(50),
    rate: 500,
    unit: 'ml/h',
    recordedAt: at(0),
    deletedAt: null,
    revisions: [],
  },
]

const entries: Entry[] = [
  ...spo2Entries,
  ...heartRateEntries,
  ...bloodPressureEntries,
  ...temperatureEntries,
  ...eventEntries,
  ...bolusEntries,
  ...infusionEntries,
]

/** A fresh copy each call, so a caller mutating the case cannot corrupt the demo data. */
export function createDemoCase(): AnesthesiaCase {
  return structuredClone({
    id: 'demo-case-1',
    patient: {
      lastName: 'Mustermann',
      firstName: 'Erika',
      dateOfBirth: '1968-04-22',
      sex: 'w',
      weightKg: 72,
      heightCm: 168,
      asa: 2,
      allergies: ['Penicillin'],
    },
    procedure: 'Arthroskopie rechtes Knie',
    date: CASE_DATE,
    startedAt: CASE_START,
    entries,
  } satisfies AnesthesiaCase)
}

/** An empty case on the same demo patient, for the first-run state. */
export function createEmptyCase(): AnesthesiaCase {
  return { ...createDemoCase(), entries: [] }
}
