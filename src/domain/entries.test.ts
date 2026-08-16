import { describe, expect, it } from 'vitest'

import { caseNow } from './entries'
import type { AnesthesiaCase, Entry } from './types'

const START = new Date('2026-08-12T08:30:00').getTime()
const minutes = (n: number) => START + n * 60_000

function caseWith(...entries: Entry[]): AnesthesiaCase {
  return {
    id: 'c1',
    patient: {
      lastName: 'Mustermann',
      firstName: 'Erika',
      dateOfBirth: '1968-04-22',
      sex: 'w',
      weightKg: 72,
      heightCm: 168,
      asa: 2,
      allergies: [],
    },
    procedure: 'Testfall',
    date: '2026-08-12',
    baseline: { bloodPressureSystolic: 140, bloodPressureDiastolic: 85, heartRate: 80 },
    startedAt: START,
    entries,
  }
}

function vital(at: number, id = 'v1'): Entry {
  return {
    id,
    type: 'vital',
    vital: 'spo2',
    at,
    value: 97,
    recordedAt: at,
    deletedAt: null,
    revisions: [],
  }
}

describe('caseNow', () => {
  it('uses the wall clock while it falls inside the case', () => {
    expect(caseNow(caseWith(vital(minutes(10))), minutes(25))).toBe(minutes(25))
  })

  it('falls back to the last documented time once the case is in the past', () => {
    // The wall clock four days later is not a time in this case. Defaulting to it would place the
    // new entry days past the record and stretch the axis to reach it.
    const later = START + 4 * 24 * 60 * 60_000
    const record = caseWith(vital(minutes(10), 'a'), vital(minutes(40), 'b'))

    expect(caseNow(record, later)).toBe(minutes(40))
  })

  it('falls back to the case start when nothing has been documented yet', () => {
    const later = START + 4 * 24 * 60 * 60_000
    expect(caseNow(caseWith(), later)).toBe(START)
  })

  it('ignores removed entries when finding the last documented time', () => {
    const removed: Entry = { ...vital(minutes(90), 'gone'), deletedAt: minutes(91) }
    const record = caseWith(vital(minutes(40), 'a'), removed)

    expect(caseNow(record, START + 4 * 24 * 60 * 60_000)).toBe(minutes(40))
  })

  it('does not run backwards before the case has started', () => {
    // A clock set before the case start is outside it just as much as one set after.
    expect(caseNow(caseWith(vital(minutes(10))), START - 60_000)).toBe(minutes(10))
  })
})
