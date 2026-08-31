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
 *
 * The plot ranges are narrow on purpose. An axis wide enough to hold every value a patient could
 * ever produce draws every ordinary case as a flat line across an empty box, which is the opposite
 * of what a chart is for. So each one spans the window a case is ordinarily read in, and a value
 * outside it is drawn at the edge of the lane as an off-scale mark rather than being either hidden
 * or allowed to stretch the axis. They are **fixed**: two cases have to be comparable at a glance,
 * which they are not if the axis rescales itself to whatever it was given.
 *
 * Each range is chosen so that its midpoint is a round number, because the lane labels its floor,
 * its midpoint and its ceiling.
 */

import type { BolusUnit, InfusionRateUnit, PhaseEventKind, VitalKind } from './types'

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
  /**
   * Spacing of the lane's unlabelled horizontal rules.
   *
   * Must divide the half-span exactly. The lane labels its floor, its midpoint and its ceiling,
   * and those three are drawn as the heavier rules; a spacing that steps past the midpoint would
   * put the labelled rule between two hairlines, which draws the axis in a rhythm its own numbers
   * do not follow. Asserted in scales.test.ts.
   */
  gridStep: number
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
    plotRange: [94, 100],
    inputRange: [50, 100],
    gridStep: 1,
    step: 1,
    decimals: 0,
  },
  heartRate: {
    label: 'Herzfrequenz',
    short: 'HF',
    unit: '/min',
    plotRange: [40, 140],
    inputRange: [20, 250],
    // 10 would be the rounder rhythm for a pulse and is the other divisor of the half-span, but
    // at this lane's drawn height it puts a rule every seven pixels, which is texture rather than
    // a grid. 25 is the coarser of the two the midpoint allows.
    gridStep: 25,
    step: 1,
    decimals: 0,
  },
  bloodPressureSystolic: {
    label: 'Blutdruck systolisch',
    short: 'RR sys',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [40, 300],
    gridStep: 30,
    step: 1,
    decimals: 0,
  },
  bloodPressureMean: {
    label: 'Mittlerer arterieller Druck',
    short: 'MAD',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [30, 250],
    gridStep: 30,
    step: 1,
    decimals: 0,
  },
  bloodPressureDiastolic: {
    label: 'Blutdruck diastolisch',
    short: 'RR dia',
    unit: 'mmHg',
    plotRange: [40, 220],
    inputRange: [20, 200],
    gridStep: 30,
    step: 1,
    decimals: 0,
  },
  temperature: {
    label: 'Temperatur',
    short: 'Temp',
    unit: '°C',
    plotRange: [35, 38],
    inputRange: [30, 43],
    gridStep: 0.5,
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

/**
 * Spacing of the heavier time rules, and of every axis label.
 *
 * The five-minute grid is the clinical reference the brief asks for, but read alone it is fifteen
 * identical hairlines with no place to hold on to. The quarter hour is what a protocol is actually
 * spoken in, so it is drawn heavier and is the only spacing that ever carries a time.
 *
 * A multiple of `GRID_INTERVAL_MS`, so every major rule is also one of the five-minute lines
 * rather than a second grid laid over the first.
 */
export const MAJOR_INTERVAL_MS = 15 * 60 * 1000

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * Everything the value control needs to display and step one quantity.
 *
 * A saturation, a dose and an infusion rate are the same problem for the control — a number in a
 * range, moved coarsely and then exactly — so they describe themselves the same way and share one
 * component rather than growing three near-identical ones.
 */
export interface AmountMeta {
  /** What the quantity is called, used for the controls' screen-reader labels. */
  label: string
  unit: string
  min: number
  max: number
  step: number
  decimals: number
}

export function vitalAmount(kind: VitalKind): AmountMeta {
  const meta = VITALS[kind]
  const [min, max] = meta.inputRange
  return { label: meta.label, unit: meta.unit, min, max, step: meta.step, decimals: meta.decimals }
}

/** The part of an `AmountMeta` that depends on the unit rather than on what is being measured. */
type UnitRange = Pick<AmountMeta, 'max' | 'step' | 'decimals'>

/**
 * How far the dose control reaches, per unit.
 *
 * These bound the control and nothing else. They are deliberately far wider than anything
 * ordinarily given, for the same reason a vital's `inputRange` is wider than its `plotRange`: the
 * record has to be able to document what actually happened, including the unusual. No number here
 * is a recommended dose and nothing in the app reads it as one.
 */
const BOLUS_RANGES: Record<BolusUnit, UnitRange> = {
  mg: { max: 2000, step: 1, decimals: 0 },
  µg: { max: 2000, step: 5, decimals: 0 },
  ml: { max: 1000, step: 5, decimals: 0 },
  IE: { max: 20000, step: 100, decimals: 0 },
}

const INFUSION_RANGES: Record<InfusionRateUnit, UnitRange> = {
  'mg/h': { max: 1000, step: 1, decimals: 0 },
  'µg/kg/min': { max: 50, step: 0.05, decimals: 2 },
  'ml/h': { max: 1000, step: 10, decimals: 0 },
}

export const BOLUS_UNITS = Object.keys(BOLUS_RANGES) as BolusUnit[]
export const INFUSION_UNITS = Object.keys(INFUSION_RANGES) as InfusionRateUnit[]

/**
 * The control's bounds when the record holds a unit this build has no range for.
 *
 * The types say this cannot happen and the entry sheet cannot produce it — and storage can. The
 * guard in `storage.ts` checks an entry's id, type and timestamps and deliberately stops there, so
 * a hand-edited or older envelope loads a dose whose unit is absent or is a string that used to
 * mean something. Without a fallback the lookup gave `undefined`, the spread produced an
 * `AmountMeta` with no `max`, and the sheet threw on `max.toFixed` the moment it was opened: the
 * one entry that needs correcting was the one entry that could not be opened.
 *
 * Wide and fine on purpose. This bounds a control and nothing else, and the number under it is
 * already documented — a step or a precision chosen to look tidy would round a recorded dose on
 * the way to the screen, which is a worse failure than the crash it replaces. Two decimals because
 * `µg/kg/min` is the one rate ordinarily written as a fraction. It lasts exactly as long as it
 * takes to pick a real unit, which is what the completeness check sends the user here to do.
 */
const UNKNOWN_UNIT: UnitRange = { max: 20000, step: 1, decimals: 2 }

export function bolusAmount(unit: BolusUnit): AmountMeta {
  return { label: 'Dosis', unit, min: 0, ...(BOLUS_RANGES[unit] ?? UNKNOWN_UNIT) }
}

export function infusionAmount(unit: InfusionRateUnit): AmountMeta {
  return { label: 'Rate', unit, min: 0, ...(INFUSION_RANGES[unit] ?? UNKNOWN_UNIT) }
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

export type LaneId = 'spo2' | 'heartRate' | 'bloodPressure' | 'temperature'

/**
 * One horizontal band of the timeline. A lane owns a single value scale, which is what makes the
 * pixel-to-value mapping unambiguous; the vital kinds listed in it share that scale and therefore
 * must share a unit (asserted in the tests).
 *
 * This list is the layout. Regrouping the timeline — one lane per kind, or heart rate and blood
 * pressure combined on their shared grid — is an edit here, not a change to the component.
 */
export interface LaneDef {
  id: LaneId
  /** Full German name. The accessible name of the lane and the title of its entry sheet. */
  label: string
  /**
   * What the lane is called in its own gutter.
   *
   * The abbreviations a paper Narkoseprotokoll already uses, not invented German — which is what
   * makes them a name rather than a truncation. They are what let the gutter be 88px wide:
   * „Sauerstoffsättigung“ is 119.1px in the shipped face and cannot share a gutter with an axis
   * number at any width worth having, where „Temp“, the longest of these, is 33.3px. The full name
   * is still the lane's accessible name, so nothing is lost to a screen reader.
   *
   * A lane's short name is not always its first vital's: the pressure lane holds `RR sys`,
   * `RR mit` and `RR dia`, and the lane they share is „RR“.
   */
  short: string
  vitals: readonly VitalKind[]
  /** Relative height. Lanes are sized in proportion to these, not in pixels. */
  weight: number
}

export const LANES: readonly LaneDef[] = [
  { id: 'spo2', label: 'Sauerstoffsättigung', short: 'SpO₂', vitals: ['spo2'], weight: 1 },
  { id: 'heartRate', label: 'Herzfrequenz', short: 'HF', vitals: ['heartRate'], weight: 1 },
  {
    id: 'bloodPressure',
    label: 'Blutdruck',
    short: 'RR',
    vitals: BLOOD_PRESSURE_KINDS,
    weight: 1.4,
  },
  { id: 'temperature', label: 'Temperatur', short: 'Temp', vitals: ['temperature'], weight: 0.8 },
]

/**
 * The lane's y-axis domain: the widest plot range across the kinds it holds, so no member series
 * can fall outside the drawn axis. Derived rather than declared, so VITALS stays the one place a
 * range is written down.
 */
export function laneRange(lane: LaneDef): [number, number] {
  const ranges = lane.vitals.map((kind) => VITALS[kind].plotRange)
  return [
    Math.min(...ranges.map(([min]) => min)),
    Math.max(...ranges.map(([, max]) => max)),
  ]
}

/**
 * The spacing of the lane's horizontal rules. Taken from the lane's first kind, like its unit and
 * its precision: the kinds in a lane share one scale, so they share the grid drawn on it.
 */
export function laneGridStep(lane: LaneDef): number {
  return VITALS[lane.vitals[0]].gridStep
}

/** The unit shared by every kind in the lane. */
export function laneUnit(lane: LaneDef): string {
  return VITALS[lane.vitals[0]].unit
}

/** Which lane a vital kind is drawn in. */
export function laneForVital(kind: VitalKind): LaneDef {
  const lane = LANES.find((candidate) => candidate.vitals.includes(kind))
  if (!lane) throw new Error(`No lane is configured for vital "${kind}".`)
  return lane
}
