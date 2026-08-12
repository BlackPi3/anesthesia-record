import { describe, expect, it } from 'vitest'

import { correctVital, removeEntry, restoreEntry } from './mutations'
import type { AnesthesiaCase, VitalEntry } from './types'

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
