/**
 * Every change to a case goes through here.
 *
 * These are pure functions: they take a case and return a new one, and they never touch React or
 * storage. That keeps the rules about corrections — when a revision is recorded, what a removal
 * does — testable with plain data, and leaves the components holding nothing but the current case.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, so a test can assert the exact
 * timestamp written into the audit trail.
 */

import type {
  AnesthesiaCase,
  BolusEntry,
  BolusUnit,
  Entry,
  InfusionEntry,
  InfusionRateUnit,
  PhaseEventEntry,
  PhaseEventKind,
  Timestamp,
  VitalEntry,
  VitalKind,
} from './types'

/**
 * Identifier for a newly created entry.
 *
 * Ids only have to be unique inside one case held in one browser, so a UUID is more than enough
 * and needs no counter kept in the record. The demo case writes readable ids of its own
 * (`demo-spo2-15`), which is why nothing here parses an id or infers anything from its shape.
 */
export function newEntryId(): string {
  return crypto.randomUUID()
}

/**
 * Replaces one entry, and returns the original case untouched if nothing actually changed.
 *
 * Identity matters here: an unchanged case means React skips a re-render and the caller skips a
 * write to storage. Dragging a point and putting it back where it started should leave no trace.
 */
function replaceEntry(
  record: AnesthesiaCase,
  id: string,
  replace: (entry: Entry) => Entry,
): AnesthesiaCase {
  let changed = false

  const entries = record.entries.map((entry) => {
    if (entry.id !== id) return entry
    const next = replace(entry)
    if (next !== entry) changed = true
    return next
  })

  return changed ? { ...record, entries } : record
}

/**
 * Whether every field a correction would write already holds that value.
 *
 * A correction that changes nothing is not a correction and must write no revision, or every
 * stray tap would add a line to the audit trail and bury the real ones. Each entry type corrects
 * a different set of fields, so the comparison is driven by the keys of the incoming values
 * rather than written out per type.
 */
function unchanged<Fields extends object>(entry: Fields, next: Fields): boolean {
  return (Object.keys(next) as (keyof Fields)[]).every((key) => entry[key] === next[key])
}

/** The fields a correction may change, per entry type. */
type VitalFields = Pick<VitalEntry, 'at' | 'value'>
type BolusFields = Pick<BolusEntry, 'at' | 'drug' | 'dose' | 'unit'>
type InfusionFields = Pick<InfusionEntry, 'startedAt' | 'endedAt' | 'drug' | 'rate' | 'unit'>
type EventFields = Pick<PhaseEventEntry, 'at'>

/**
 * Writes a new vital measurement into the record.
 *
 * `at` is the clinical time of the measurement and `recordedAt` is when it was typed in. They are
 * the same at creation and diverge as soon as the entry is corrected, which is exactly the
 * distinction the audit trail exists to keep.
 *
 * No range checking happens here, for the same reason `correctVital` does none: the value control
 * cannot produce a number outside the metric's `inputRange`, and a domain function that silently
 * clamped would turn a UI bug into a quietly wrong record instead of a visible one.
 *
 * `id` is a parameter so a test can assert the entry it just created rather than hunting for it.
 */
export function addVital(
  record: AnesthesiaCase,
  draft: { vital: VitalKind; at: Timestamp; value: number },
  now: Timestamp = Date.now(),
  id: string = newEntryId(),
): AnesthesiaCase {
  return {
    ...record,
    entries: [
      ...record.entries,
      {
        id,
        type: 'vital',
        vital: draft.vital,
        at: draft.at,
        value: draft.value,
        recordedAt: now,
        deletedAt: null,
        revisions: [],
      },
    ],
  }
}

/**
 * Writes a single dose into the record.
 *
 * `drug` is free text rather than a member of `DRUGS`: the catalog is a shortcut for the common
 * cases, and a record that cannot document an unlisted drug is worse than one that accepts a
 * typo. Nothing here checks the dose against the drug — that would be dosing guidance, which the
 * brief rules out.
 */
export function addBolus(
  record: AnesthesiaCase,
  draft: { drug: string; at: Timestamp; dose: number; unit: BolusUnit },
  now: Timestamp = Date.now(),
  id: string = newEntryId(),
): AnesthesiaCase {
  return {
    ...record,
    entries: [
      ...record.entries,
      { id, type: 'bolus', ...draft, recordedAt: now, deletedAt: null, revisions: [] },
    ],
  }
}

/**
 * Starts a continuous infusion. `endedAt` is null while it runs, and stays null until someone
 * stops it — an infusion with no end is a real state during a case, not missing data.
 */
export function addInfusion(
  record: AnesthesiaCase,
  draft: {
    drug: string
    startedAt: Timestamp
    endedAt: Timestamp | null
    rate: number
    unit: InfusionRateUnit
  },
  now: Timestamp = Date.now(),
  id: string = newEntryId(),
): AnesthesiaCase {
  return {
    ...record,
    entries: [
      ...record.entries,
      { id, type: 'infusion', ...draft, recordedAt: now, deletedAt: null, revisions: [] },
    ],
  }
}

/**
 * Records a phase milestone. The same kind may legitimately appear more than once — a case can be
 * cut and sutured twice — so nothing here rejects a duplicate.
 */
export function addEvent(
  record: AnesthesiaCase,
  draft: { event: PhaseEventKind; at: Timestamp },
  now: Timestamp = Date.now(),
  id: string = newEntryId(),
): AnesthesiaCase {
  return {
    ...record,
    entries: [
      ...record.entries,
      { id, type: 'event', ...draft, recordedAt: now, deletedAt: null, revisions: [] },
    ],
  }
}

/** Moves a vital entry to a new time and value, recording what it was before. */
export function correctVital(
  record: AnesthesiaCase,
  id: string,
  next: VitalFields,
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) => {
    if (entry.type !== 'vital') return entry
    if (unchanged(entry, next)) return entry

    return {
      ...entry,
      ...next,
      revisions: [
        ...entry.revisions,
        { revisedAt: now, previous: { at: entry.at, value: entry.value } },
      ],
    }
  })
}

/**
 * Corrects several vitals as one step, folding `correctVital` over a single record. A blood
 * pressure reading's three entries share a timestamp, so dragging one of them in time carries the
 * other two in the same call — each still reading the record the one before it already wrote,
 * which three separate `correctVital` calls from outside would not, since each of those would read
 * the record as it stood before any of the three had written.
 */
export function correctVitals(
  record: AnesthesiaCase,
  corrections: readonly (VitalFields & { id: string })[],
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return corrections.reduce(
    (next, { id, at, value }) => correctVital(next, id, { at, value }, now),
    record,
  )
}

/** Corrects a dose: its time, the drug, the amount or the unit. */
export function correctBolus(
  record: AnesthesiaCase,
  id: string,
  next: BolusFields,
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) => {
    if (entry.type !== 'bolus') return entry
    if (unchanged(entry, next)) return entry

    return {
      ...entry,
      ...next,
      revisions: [
        ...entry.revisions,
        {
          revisedAt: now,
          previous: { at: entry.at, drug: entry.drug, dose: entry.dose, unit: entry.unit },
        },
      ],
    }
  })
}

/**
 * Corrects an infusion, including stopping one that is still running. Ending an infusion is a
 * correction like any other rather than its own operation: it writes the same revision, so the
 * record shows when the end was documented as well as when it happened.
 */
export function correctInfusion(
  record: AnesthesiaCase,
  id: string,
  next: InfusionFields,
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) => {
    if (entry.type !== 'infusion') return entry
    if (unchanged(entry, next)) return entry

    return {
      ...entry,
      ...next,
      revisions: [
        ...entry.revisions,
        {
          revisedAt: now,
          previous: {
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
            drug: entry.drug,
            rate: entry.rate,
            unit: entry.unit,
          },
        },
      ],
    }
  })
}

/**
 * Corrects when a milestone happened. The kind itself is not correctable: an incision recorded as
 * a suture is the wrong entry, not a mistimed one, and removing it leaves the clearer trail.
 */
export function correctEvent(
  record: AnesthesiaCase,
  id: string,
  next: EventFields,
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) => {
    if (entry.type !== 'event') return entry
    if (unchanged(entry, next)) return entry

    return {
      ...entry,
      ...next,
      revisions: [...entry.revisions, { revisedAt: now, previous: { at: entry.at } }],
    }
  })
}

/**
 * Removes an entry from the chart without removing it from the record.
 *
 * The brief requires removals to leave a clear audit trail, which is only possible if the entry
 * survives. It stops being drawn and stops counting; it does not stop existing.
 */
export function removeEntry(
  record: AnesthesiaCase,
  id: string,
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) =>
    entry.deletedAt !== null ? entry : { ...entry, deletedAt: now },
  )
}

/** Undoes a removal. The removal itself stays visible in the entry's history. */
export function restoreEntry(record: AnesthesiaCase, id: string): AnesthesiaCase {
  return replaceEntry(record, id, (entry) =>
    entry.deletedAt === null ? entry : { ...entry, deletedAt: null },
  )
}
