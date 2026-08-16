import { describe, expect, it } from 'vitest'

import {
  addBolus,
  addEvent,
  addInfusion,
  addVital,
  correctBolus,
  correctEvent,
  correctInfusion,
  correctVital,
  removeEntry,
  restoreEntry,
} from './mutations'
import { vitalSeries } from './entries'
import type {
  AnesthesiaCase,
  BolusEntry,
  InfusionEntry,
  PhaseEventEntry,
  VitalEntry,
} from './types'

const AT = new Date('2026-08-12T08:40:00').getTime()
const NOW = new Date('2026-08-12T09:05:00').getTime()

function vital(overrides: Partial<VitalEntry> = {}): VitalEntry {
  return {
    id: 'v1',
    type: 'vital',
    vital: 'spo2',
    at: AT,
    value: 97,
    recordedAt: AT,
    deletedAt: null,
    revisions: [],
    ...overrides,
  }
}

function caseWith(...entries: AnesthesiaCase['entries']): AnesthesiaCase {
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
    startedAt: AT,
    entries,
  }
}

describe('addVital', () => {
  it('writes the measurement with an empty audit trail', () => {
    const next = addVital(caseWith(), { vital: 'spo2', at: AT, value: 98 }, NOW, 'new-1')
    const entry = next.entries[0] as VitalEntry

    expect(entry).toMatchObject({
      id: 'new-1',
      type: 'vital',
      vital: 'spo2',
      at: AT,
      value: 98,
      deletedAt: null,
      revisions: [],
    })
  })

  it('separates the clinical time from the time it was written down', () => {
    // Documenting at 09:05 a measurement taken at 08:40 is normal in an OR; the two times are
    // different facts and both are kept.
    const next = addVital(caseWith(), { vital: 'heartRate', at: AT, value: 72 }, NOW, 'new-1')
    const entry = next.entries[0] as VitalEntry

    expect(entry.at).toBe(AT)
    expect(entry.recordedAt).toBe(NOW)
  })

  it('leaves the existing entries alone', () => {
    const record = caseWith(vital())
    const next = addVital(record, { vital: 'spo2', at: AT, value: 91 }, NOW, 'new-1')

    expect(next.entries).toHaveLength(2)
    expect(next.entries[0]).toBe(record.entries[0])
    expect(record.entries).toHaveLength(1)
  })

  it('sorts a back-dated entry into the series despite being appended last', () => {
    // `entries` carries no order, so an entry timestamped before an existing one must still come
    // out in the right place. This is the guarantee that lets creation just append.
    const record = addVital(caseWith(vital()), { vital: 'spo2', at: AT - 60_000, value: 99 }, NOW, 'new-1')

    expect(vitalSeries(record, 'spo2').map((entry) => entry.id)).toEqual(['new-1', 'v1'])
  })
})

describe('correctVital', () => {
  it('applies the new value and records what it was before', () => {
    const next = correctVital(caseWith(vital()), 'v1', { at: AT + 60_000, value: 94 }, NOW)
    const entry = next.entries[0] as VitalEntry

    expect(entry.value).toBe(94)
    expect(entry.at).toBe(AT + 60_000)
    expect(entry.revisions).toEqual([{ revisedAt: NOW, previous: { at: AT, value: 97 } }])
  })

  it('accumulates revisions oldest first', () => {
    const once = correctVital(caseWith(vital()), 'v1', { at: AT, value: 95 }, NOW)
    const twice = correctVital(once, 'v1', { at: AT, value: 93 }, NOW + 1000)
    const entry = twice.entries[0] as VitalEntry

    expect(entry.value).toBe(93)
    expect(entry.revisions.map((revision) => revision.previous.value)).toEqual([97, 95])
  })

  it('treats a correction to the same time and value as no correction at all', () => {
    const record = caseWith(vital())
    const next = correctVital(record, 'v1', { at: AT, value: 97 }, NOW)

    // Same object: no revision written, and nothing for React or storage to do. Dragging a point
    // back to where it started must leave no trace.
    expect(next).toBe(record)
  })

  it('leaves the case untouched for an unknown id', () => {
    const record = caseWith(vital())
    expect(correctVital(record, 'nope', { at: AT, value: 90 }, NOW)).toBe(record)
  })

  it('refuses to correct an entry that is not a vital', () => {
    const record = caseWith({
      id: 'e1',
      type: 'event',
      event: 'incision',
      at: AT,
      recordedAt: AT,
      deletedAt: null,
      revisions: [],
    })
    expect(correctVital(record, 'e1', { at: AT + 1000, value: 5 }, NOW)).toBe(record)
  })
})

describe('removeEntry', () => {
  it('marks the entry removed but keeps it in the record', () => {
    const next = removeEntry(caseWith(vital()), 'v1', NOW)

    expect(next.entries).toHaveLength(1)
    expect(next.entries[0].deletedAt).toBe(NOW)
  })

  it('keeps the correction history of a removed entry', () => {
    const corrected = correctVital(caseWith(vital()), 'v1', { at: AT, value: 91 }, NOW)
    const removed = removeEntry(corrected, 'v1', NOW + 5000)

    expect(removed.entries[0].revisions).toHaveLength(1)
  })

  it('is a no-op on an already removed entry', () => {
    const removed = removeEntry(caseWith(vital()), 'v1', NOW)
    expect(removeEntry(removed, 'v1', NOW + 5000)).toBe(removed)
  })
})

describe('restoreEntry', () => {
  it('brings a removed entry back without erasing its history', () => {
    const removed = removeEntry(
      correctVital(caseWith(vital()), 'v1', { at: AT, value: 91 }, NOW),
      'v1',
      NOW + 1000,
    )
    const restored = restoreEntry(removed, 'v1')

    expect(restored.entries[0].deletedAt).toBeNull()
    expect(restored.entries[0].revisions).toHaveLength(1)
  })

  it('is a no-op on an entry that was never removed', () => {
    const record = caseWith(vital())
    expect(restoreEntry(record, 'v1')).toBe(record)
  })
})

// ---------------------------------------------------------------------------
// Medications and events
// ---------------------------------------------------------------------------

function bolus(overrides: Partial<BolusEntry> = {}): BolusEntry {
  return {
    id: 'b1',
    type: 'bolus',
    drug: 'Propofol',
    at: AT,
    dose: 200,
    unit: 'mg',
    recordedAt: AT,
    deletedAt: null,
    revisions: [],
    ...overrides,
  }
}

function infusion(overrides: Partial<InfusionEntry> = {}): InfusionEntry {
  return {
    id: 'i1',
    type: 'infusion',
    drug: 'Remifentanil',
    startedAt: AT,
    endedAt: null,
    rate: 0.2,
    unit: 'µg/kg/min',
    recordedAt: AT,
    deletedAt: null,
    revisions: [],
    ...overrides,
  }
}

describe('addBolus', () => {
  it('writes the dose with an empty audit trail', () => {
    const next = addBolus(
      caseWith(),
      { drug: 'Fentanyl', at: AT, dose: 100, unit: 'µg' },
      NOW,
      'new-b',
    )

    expect(next.entries[0]).toMatchObject({
      id: 'new-b',
      type: 'bolus',
      drug: 'Fentanyl',
      at: AT,
      dose: 100,
      unit: 'µg',
      recordedAt: NOW,
      deletedAt: null,
      revisions: [],
    })
  })

  it('accepts a drug that is not in the catalog', () => {
    const next = addBolus(caseWith(), { drug: 'Sugammadex', at: AT, dose: 200, unit: 'mg' }, NOW)
    expect((next.entries[0] as BolusEntry).drug).toBe('Sugammadex')
  })
})

describe('addInfusion', () => {
  it('starts an infusion with no end', () => {
    const next = addInfusion(
      caseWith(),
      { drug: 'Ringer-Acetat', startedAt: AT, endedAt: null, rate: 500, unit: 'ml/h' },
      NOW,
      'new-i',
    )

    expect(next.entries[0]).toMatchObject({
      id: 'new-i',
      type: 'infusion',
      startedAt: AT,
      endedAt: null,
      rate: 500,
      revisions: [],
    })
  })
})

describe('addEvent', () => {
  it('records the milestone', () => {
    const next = addEvent(caseWith(), { event: 'incision', at: AT }, NOW, 'new-e')
    expect(next.entries[0]).toMatchObject({ id: 'new-e', type: 'event', event: 'incision', at: AT })
  })

  it('allows the same milestone twice, since a case can be cut and sutured more than once', () => {
    const once = addEvent(caseWith(), { event: 'incision', at: AT }, NOW, 'e1')
    const twice = addEvent(once, { event: 'incision', at: AT + 600_000 }, NOW, 'e2')

    expect(twice.entries).toHaveLength(2)
  })
})

describe('correctBolus', () => {
  it('records every changed field as it was before', () => {
    const next = correctBolus(
      caseWith(bolus()),
      'b1',
      { at: AT + 60_000, drug: 'Propofol', dose: 150, unit: 'mg' },
      NOW,
    )
    const entry = next.entries[0] as BolusEntry

    expect(entry.dose).toBe(150)
    expect(entry.at).toBe(AT + 60_000)
    expect(entry.revisions).toEqual([
      { revisedAt: NOW, previous: { at: AT, drug: 'Propofol', dose: 200, unit: 'mg' } },
    ])
  })

  it('writes no revision when nothing actually changed', () => {
    const record = caseWith(bolus())
    expect(correctBolus(record, 'b1', { at: AT, drug: 'Propofol', dose: 200, unit: 'mg' }, NOW))
      .toBe(record)
  })

  it('refuses to correct an entry that is not a bolus', () => {
    const record = caseWith(infusion())
    expect(correctBolus(record, 'i1', { at: AT, drug: 'X', dose: 1, unit: 'mg' }, NOW)).toBe(record)
  })
})

describe('correctInfusion', () => {
  it('stops a running infusion and keeps the open end in the trail', () => {
    const stoppedAt = AT + 30 * 60_000
    const next = correctInfusion(
      caseWith(infusion()),
      'i1',
      { startedAt: AT, endedAt: stoppedAt, drug: 'Remifentanil', rate: 0.2, unit: 'µg/kg/min' },
      NOW,
    )
    const entry = next.entries[0] as InfusionEntry

    expect(entry.endedAt).toBe(stoppedAt)
    expect(entry.revisions[0].previous.endedAt).toBeNull()
  })

  it('treats a rate change as a correction', () => {
    const next = correctInfusion(
      caseWith(infusion()),
      'i1',
      { startedAt: AT, endedAt: null, drug: 'Remifentanil', rate: 0.3, unit: 'µg/kg/min' },
      NOW,
    )

    expect((next.entries[0] as InfusionEntry).rate).toBe(0.3)
    expect(next.entries[0].revisions[0].previous).toMatchObject({ rate: 0.2 })
  })

  it('writes no revision when nothing actually changed', () => {
    const record = caseWith(infusion())
    const same = { startedAt: AT, endedAt: null, drug: 'Remifentanil', rate: 0.2, unit: 'µg/kg/min' } as const
    expect(correctInfusion(record, 'i1', same, NOW)).toBe(record)
  })
})

describe('correctEvent', () => {
  it('moves the milestone and records when it was', () => {
    const record = caseWith({
      id: 'e1',
      type: 'event',
      event: 'incision',
      at: AT,
      recordedAt: AT,
      deletedAt: null,
      revisions: [],
    })
    const next = correctEvent(record, 'e1', { at: AT + 120_000 }, NOW)

    expect((next.entries[0] as PhaseEventEntry).at).toBe(AT + 120_000)
    expect(next.entries[0].revisions).toEqual([{ revisedAt: NOW, previous: { at: AT } }])
  })
})

describe('removing medications and events', () => {
  it('keeps a removed dose in the record', () => {
    const next = removeEntry(caseWith(bolus()), 'b1', NOW)

    expect(next.entries).toHaveLength(1)
    expect(next.entries[0].deletedAt).toBe(NOW)
  })
})
