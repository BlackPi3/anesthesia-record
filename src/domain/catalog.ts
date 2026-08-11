/**
 * Static domain knowledge: what each vital and event is called in the UI, and the numeric ranges
 * the timeline and the value picker work in.
 *
 * Kept out of types.ts because these are values, not types, and out of the components because
 * both the chart and the entry controls need the same numbers. A single source for the ranges is
 * what keeps the y-axis and the value picker from disagreeing.
 *
 * `plotRange` is what the axis spans. `inputRange` is what the value control can produce, and is
 * deliberately wider: a real desaturation must be recordable even though it falls off the normal
 * chart window. Neither is a clinical judgement, and nothing here interprets a value.
 */

import type { PhaseEventKind, VitalKind } from './types'

export interface VitalMeta {
  /** Full German name, for labels and screen readers. */
  label: string
  /** Abbreviation used on the chart and in dense layouts. */
  short: string
  unit: string
  /** [min, max] of the drawn y-axis. */
  plotRange: [number, number]
  /** [min, max] the value control allows. */
  inputRange: [number, number]
  /** Step of the value control. */
  step: number
  /** Decimal places when displaying the value. */
  decimals: number
}

export const VITALS: Record<VitalKind, VitalMeta> = {
  spo2: {
    label: 'Sauerstoffsättigung',
    short: 'SpO₂',
    unit: '%',
    plotRange: [70, 100],
    inputRange: [50, 100],
    step: 1,
    decimals: 0,
  },
  heartRate: {
    label: 'Herzfrequenz',
    short: 'HF',
    unit: '/min',
    plotRange: [30, 180],
    inputRange: [20, 250],
    step: 1,
    decimals: 0,
  },
  bloodPressureSystolic: {
    label: 'Blutdruck systolisch',
    short: 'RR sys',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [40, 300],
    step: 1,
    decimals: 0,
  },
  bloodPressureMean: {
    label: 'Blutdruck Mitteldruck',
    short: 'RR mittel',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [30, 250],
    step: 1,
    decimals: 0,
  },
  bloodPressureDiastolic: {
    label: 'Blutdruck diastolisch',
    short: 'RR dia',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [20, 200],
    step: 1,
    decimals: 0,
  },
  temperature: {
    label: 'Temperatur',
    short: 'Temp',
    unit: '°C',
    plotRange: [34, 40],
    inputRange: [30, 43],
    step: 0.1,
    decimals: 1,
  },
}

/** Order the vitals appear in pickers and legends. */
export const VITAL_ORDER: VitalKind[] = [
  'spo2',
  'heartRate',
  'bloodPressureSystolic',
  'bloodPressureMean',
  'bloodPressureDiastolic',
  'temperature',
]

/** The three kinds that make up one non-invasive blood pressure measurement. */
export const BLOOD_PRESSURE_KINDS = [
  'bloodPressureSystolic',
  'bloodPressureMean',
  'bloodPressureDiastolic',
] as const satisfies readonly VitalKind[]

export interface PhaseEventMeta {
  label: string
  /** Chronological order in a normal case; used to sort the event picker, not to validate. */
  order: number
}

export const PHASE_EVENTS: Record<PhaseEventKind, PhaseEventMeta> = {
  anesthesiaStart: { label: 'Narkosebeginn', order: 1 },
  incision: { label: 'Schnitt', order: 2 },
  suture: { label: 'Naht', order: 3 },
  emergenceEnd: { label: 'Ausleitungsende', order: 4 },
  discharge: { label: 'Entlassung', order: 5 },
}

export const PHASE_EVENT_ORDER: PhaseEventKind[] = (
  Object.keys(PHASE_EVENTS) as PhaseEventKind[]
).sort((a, b) => PHASE_EVENTS[a].order - PHASE_EVENTS[b].order)

/**
 * Starting list for the medication picker. Free text stays possible, so this is a shortcut for
 * the common cases rather than a closed set, and it holds no dosing guidance of any kind.
 */
export const DRUGS = [
  'Propofol',
  'Remifentanil',
  'Fentanyl',
  'Rocuronium',
  'Midazolam',
  'Ondansetron',
  'Dexamethason',
  'Paracetamol',
] as const

/** Fluids are documented like continuous medications and share the infusion entry type. */
export const FLUIDS = ['Ringer-Acetat', 'NaCl 0,9 %', 'Glucose 5 %'] as const

/** Gridline spacing on the time axis, in milliseconds. Reference only, entries are not snapped. */
export const GRID_INTERVAL_MS = 5 * 60 * 1000
