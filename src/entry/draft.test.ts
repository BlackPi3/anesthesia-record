import { describe, expect, it } from 'vitest'

import { isComplete, type BloodPressureDraft, type Draft } from './draft'
import type { BolusUnit, InfusionRateUnit, VitalKind } from '../domain/types'

/**
 * `isComplete` is the gate on every write in the app: the sheet's „Übernehmen“ is disabled while it
 * is false, so a rule that is wrong here either refuses an entry somebody made or admits one that
 * is not an entry at all. It had no test of its own until this file — it was reachable only through
 * the browser suite, where a disabled button is evidence about a button.
 *
 * Each rule is written as a pair: the draft that must be accepted, and the same draft one field
 * away that must be refused. A test that only asserted the refusals would pass against a function
 * that refuses everything, which is the failure mode this function actually has — it is the thing
 * standing between the user and their record.
 */

const AT = new Date('2026-08-12T08:31:00').getTime()

const vital = (value: number, kind: VitalKind = 'spo2'): Draft => ({
  type: 'vital',
  vital: kind,
  at: AT,
  value,
})

const bolus = (dose: number, unit: BolusUnit): Draft => ({
  type: 'bolus',
  drug: 'Propofol',
  at: AT,
  dose,
  unit,
})

const infusion = (rate: number, unit: InfusionRateUnit): Draft => ({
  type: 'infusion',
  drug: 'Ringer-Acetat',
  startedAt: AT,
  endedAt: null,
  rate,
  unit,
})

/** A reading where each kind is given as `[value, measured]`. */
function pressure(
  sys: [number, boolean],
  mean: [number, boolean],
  dia: [number, boolean],
): BloodPressureDraft {
  return {
    type: 'bloodPressure',
    at: AT,
    readings: {
      bloodPressureSystolic: { value: sys[0], measured: sys[1] },
      bloodPressureMean: { value: mean[0], measured: mean[1] },
      bloodPressureDiastolic: { value: dia[0], measured: dia[1] },
    },
  }
}

describe('a measured vital', () => {
  it('is complete inside the metric’s input range', () => {
    expect(isComplete(vital(97))).toBe(true)
  })

  it('is complete at both ends of it, which are values a patient can have', () => {
    // SpO₂ accepts 50 to 100. Both bounds are real readings, so the comparison is inclusive.
    expect(isComplete(vital(50))).toBe(true)
    expect(isComplete(vital(100))).toBe(true)
  })

  it('is refused below the minimum, which is where the keypad leaves a half-typed number', () => {
    // 4 is how 45 starts, and 0 is what deleting every digit leaves behind. Typing can only be
    // stopped at the top — a minimum cannot be applied to a number still being typed — so both
    // reach the draft and are caught here rather than being silently corrected in the field.
    expect(isComplete(vital(4))).toBe(false)
    expect(isComplete(vital(0))).toBe(false)
  })

  it('is refused above the maximum', () => {
    expect(isComplete(vital(101))).toBe(false)
  })

  it('reads the range of the metric it is for, not one shared range', () => {
    // 36,6 is an ordinary temperature and an impossible saturation. The rule is per metric, and a
    // single range would have to accept one of these wrongly.
    expect(isComplete(vital(36.6, 'temperature'))).toBe(true)
    expect(isComplete(vital(36.6))).toBe(false)
  })
})

describe('a bolus', () => {
  it('is complete with a dose and a unit', () => {
    expect(isComplete(bolus(150, 'mg'))).toBe(true)
  })

  it('is refused at a dose of zero, which is what the field opens on with nothing to copy', () => {
    // A dose of zero is not a dose. The alternative — opening on some plausible number — would be
    // inventing a dose the user did not choose.
    expect(isComplete(bolus(0, 'mg'))).toBe(false)
  })

  it('is refused when the unit is one the catalog does not know', () => {
    // The rule the completeness check depends on. A record loaded from storage can hold a unit that
    // is absent or left over from an older build — `isEntry` in storage.ts does not check units —
    // and the flag „Einheit fehlt“ opens that entry to be repaired. Accepting it again on
    // „Übernehmen“ would make pressing the flag do nothing.
    expect(isComplete(bolus(150, 'Ampulle' as BolusUnit))).toBe(false)
    expect(isComplete(bolus(150, undefined as unknown as BolusUnit))).toBe(false)
  })

  it('does not accept a rate unit in place of a dose unit', () => {
    // `ml/h` is a rate. A single shared set of units would let it through here, which is the whole
    // reason the type splits them.
    expect(isComplete(bolus(150, 'ml/h' as unknown as BolusUnit))).toBe(false)
  })
})

describe('a continuous dosing', () => {
  it('is complete with a rate and a unit, and while it is still running', () => {
    // `endedAt: null` is a state the record is built to hold, not missing data — a newly documented
    // infusion has not stopped yet, and requiring an end would mean writing down something that has
    // not happened.
    expect(isComplete(infusion(500, 'ml/h'))).toBe(true)
  })

  it('is refused at a rate of zero', () => {
    expect(isComplete(infusion(0, 'ml/h'))).toBe(false)
  })

  it('is refused on an unknown unit, and on a bolus unit', () => {
    expect(isComplete(infusion(500, '' as InfusionRateUnit))).toBe(false)
    expect(isComplete(infusion(500, 'mg' as unknown as InfusionRateUnit))).toBe(false)
  })
})

describe('a blood pressure reading', () => {
  it('is complete when all three numbers were measured', () => {
    expect(isComplete(pressure([138, true], [101, true], [82, true]))).toBe(true)
  })

  it('is complete on a manual cuff, which reports no mean', () => {
    expect(isComplete(pressure([138, true], [101, false], [82, true]))).toBe(true)
  })

  it('is refused with nothing switched on, which is not a measurement', () => {
    expect(isComplete(pressure([138, false], [101, false], [82, false]))).toBe(false)
  })

  it('is refused when a measured number is out of range', () => {
    // The systolic field accepts 40 to 300.
    expect(isComplete(pressure([9, true], [101, true], [82, true]))).toBe(false)
  })

  it('ignores a number that is out of range but switched off', () => {
    // The value is kept while `measured` is false, so changing your mind costs nothing. A switched-
    // off number is not part of the reading and must not be able to block one that is — this is the
    // pair to the test above, and the two together are what pin `measuredPressures` down.
    expect(isComplete(pressure([138, true], [9, false], [82, true]))).toBe(true)
  })
})

describe('a milestone', () => {
  it('is always complete, because it is a time and a name and both are already chosen', () => {
    expect(isComplete({ type: 'event', event: 'incision', at: AT })).toBe(true)
  })
})
