import { describe, expect, it } from 'vitest'

import { completenessFlags, flagKey } from './completeness'
import { createDemoCase } from './demoCase'
import type {
  AnesthesiaCase,
  BolusEntry,
  Entry,
  InfusionEntry,
  PhaseEventEntry,
  PhaseEventKind,
} from './types'

/**
 * The rules, with numbers.
 *
 * Half of these assert that nothing is flagged, and on their own they would pass against a check
 * that never flags anything — so each is paired with the case one field away that must flag. The
 * pairs are what carry the argument: not „a running infusion is fine" but „a running infusion is
 * fine until the record says the patient went home", which is a claim a stub cannot satisfy in
 * both directions.
 */

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

function event(kind: PhaseEventKind, at: number, deletedAt: number | null = null): PhaseEventEntry {
  return {
    type: 'event',
    id: `event-${kind}`,
    event: kind,
    at,
    recordedAt: at,
    deletedAt,
    revisions: [],
  }
}

function bolus(id: string, at: number, unit: string): BolusEntry {
  // The unit is widened on the way in on purpose: the point of the check is data that did not come
  // from the entry sheet, and the entry sheet cannot produce a bolus without one.
  return {
    type: 'bolus',
    id,
    drug: 'Propofol',
    at,
    dose: 150,
    unit: unit as BolusEntry['unit'],
    recordedAt: at,
    deletedAt: null,
    revisions: [],
  }
}

function infusion(id: string, startedAt: number, endedAt: number | null): InfusionEntry {
  return {
    type: 'infusion',
    id,
    drug: 'Ringer-Acetat',
    startedAt,
    endedAt,
    rate: 500,
    unit: 'ml/h',
    recordedAt: startedAt,
    deletedAt: null,
    revisions: [],
  }
}

const keys = (record: AnesthesiaCase) => completenessFlags(record).map(flagKey)

describe('the demo case', () => {
  it('is complete, so the record it ships with raises nothing', () => {
    expect(completenessFlags(createDemoCase())).toEqual([])
  })
})

describe('milestones', () => {
  it('says nothing about a case that has only been induced', () => {
    // Four of the five milestones are unrecorded, and this is a normal record thirty seconds in.
    expect(completenessFlags(caseWith(event('anesthesiaStart', minutes(0))))).toEqual([])
  })

  it('says nothing about an empty record', () => {
    expect(completenessFlags(caseWith())).toEqual([])
  })

  it('flags a milestone that a later one stepped over', () => {
    const record = caseWith(event('anesthesiaStart', minutes(0)), event('suture', minutes(41)))

    expect(completenessFlags(record)).toEqual([
      { kind: 'skippedEvent', event: 'incision', after: 'suture', afterAt: minutes(41) },
    ])
  })

  it('names the earliest recorded milestone after the gap, not the last one', () => {
    // Naht and Entlassung both prove Narkosebeginn and Schnitt are missing; Naht is the one that
    // proves it closely, and it is the one each flag has to carry. Ausleitungsende sits between
    // the two recorded milestones and has only Entlassung behind it, so it names that instead —
    // which is the same rule giving a different answer, not an exception to it.
    const record = caseWith(event('suture', minutes(41)), event('discharge', minutes(75)))
    const flags = completenessFlags(record)

    expect(flags.map(flagKey)).toEqual([
      'skippedEvent:anesthesiaStart',
      'skippedEvent:incision',
      'skippedEvent:emergenceEnd',
    ])
    expect(flags[0]).toMatchObject({ after: 'suture', afterAt: minutes(41) })
    expect(flags[1]).toMatchObject({ after: 'suture', afterAt: minutes(41) })
    expect(flags[2]).toMatchObject({ after: 'discharge', afterAt: minutes(75) })
  })

  it('does not flag the milestones after the last one recorded', () => {
    // Ausleitungsende and Entlassung have not happened. Nothing in the record contradicts that.
    const record = caseWith(
      event('anesthesiaStart', minutes(0)),
      event('incision', minutes(12)),
      event('suture', minutes(41)),
    )

    expect(completenessFlags(record)).toEqual([])
  })

  it('counts a removed milestone as never recorded', () => {
    const record = caseWith(
      event('anesthesiaStart', minutes(0)),
      event('incision', minutes(12), minutes(20)),
      event('suture', minutes(41)),
    )

    expect(keys(record)).toEqual(['skippedEvent:incision'])
  })
})

describe('units', () => {
  it('flags a dose whose unit is absent, at any point in the case', () => {
    // No milestone at all, so nothing here is waiting on the shape of the record.
    const record = caseWith(bolus('b1', minutes(1), ''))

    expect(completenessFlags(record)).toEqual([
      { kind: 'missingUnit', entryId: 'b1', drug: 'Propofol', at: minutes(1), given: 'bolus' },
    ])
  })

  it('flags a unit the catalog does not know', () => {
    expect(keys(caseWith(bolus('b1', minutes(1), 'Ampulle')))).toEqual(['missingUnit:b1'])
  })

  it('accepts every unit the entry sheet can produce', () => {
    expect(completenessFlags(caseWith(bolus('b1', minutes(1), 'mg')))).toEqual([])
    expect(completenessFlags(caseWith(bolus('b2', minutes(1), 'µg')))).toEqual([])
    expect(completenessFlags(caseWith(infusion('i1', minutes(0), minutes(50))))).toEqual([])
  })

  it('ignores a removed dose', () => {
    const removed = { ...bolus('b1', minutes(1), ''), deletedAt: minutes(2) }
    expect(completenessFlags(caseWith(removed))).toEqual([])
  })

  it('does not check a rate unit against the bolus units, or the reverse', () => {
    // `ml/h` is a rate and is not a bolus unit; `mg` is a dose and is not a rate unit. Sharing one
    // set would let each pass in the other's place, which is the whole reason the type splits them.
    expect(keys(caseWith(bolus('b1', minutes(1), 'ml/h')))).toEqual(['missingUnit:b1'])

    const wrongRate = { ...infusion('i1', minutes(0), null), unit: 'mg' as InfusionEntry['unit'] }
    expect(keys(caseWith(wrongRate))).toEqual(['missingUnit:i1'])
  })
})

describe('continuous dosing', () => {
  it('says nothing about an infusion that is running mid-case', () => {
    const record = caseWith(event('anesthesiaStart', minutes(0)), infusion('i1', minutes(0), null))

    expect(completenessFlags(record)).toEqual([])
  })

  it('flags one still running once the record says the patient was discharged', () => {
    const record = caseWith(
      event('anesthesiaStart', minutes(0)),
      event('incision', minutes(12)),
      event('suture', minutes(41)),
      event('emergenceEnd', minutes(48)),
      event('discharge', minutes(75)),
      infusion('i1', minutes(0), null),
    )

    expect(completenessFlags(record)).toEqual([
      {
        kind: 'openInfusion',
        entryId: 'i1',
        drug: 'Ringer-Acetat',
        startedAt: minutes(0),
        dischargedAt: minutes(75),
      },
    ])
  })

  it('says nothing once that infusion has been given an end', () => {
    const record = caseWith(
      event('anesthesiaStart', minutes(0)),
      event('incision', minutes(12)),
      event('suture', minutes(41)),
      event('emergenceEnd', minutes(48)),
      event('discharge', minutes(75)),
      infusion('i1', minutes(0), minutes(50)),
    )

    expect(completenessFlags(record)).toEqual([])
  })

  it('does not treat a removed Entlassung as a discharge', () => {
    const record = caseWith(
      event('discharge', minutes(75), minutes(80)),
      infusion('i1', minutes(0), null),
    )

    expect(completenessFlags(record)).toEqual([])
  })
})

describe('several at once', () => {
  it('lists them in the order the three checks are named, milestones in case order', () => {
    const record = caseWith(
      event('suture', minutes(41)),
      event('emergenceEnd', minutes(48)),
      event('discharge', minutes(75)),
      bolus('b1', minutes(1), ''),
      infusion('i1', minutes(0), null),
    )

    expect(keys(record)).toEqual([
      'skippedEvent:anesthesiaStart',
      'skippedEvent:incision',
      'missingUnit:b1',
      'openInfusion:i1',
    ])
  })
})
