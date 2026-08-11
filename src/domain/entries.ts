/**
 * Reading helpers over a case's entries. Pure functions, no React, so they can be tested with
 * plain data and reused by both the chart and the list views.
 */

import type {
  AnesthesiaCase,
  BolusEntry,
  Entry,
  InfusionEntry,
  PhaseEventEntry,
  Timestamp,
  VitalEntry,
  VitalKind,
} from './types'

/** Entries that were removed stay in the record for the audit trail, but are not drawn. */
export function isVisible(entry: Entry): boolean {
  return entry.deletedAt === null
}

export function visibleEntries(record: AnesthesiaCase): Entry[] {
  return record.entries.filter(isVisible)
}

/** True once the entry has been corrected at least once. */
export function wasCorrected(entry: Entry): boolean {
  return entry.revisions.length > 0
}

/**
 * Every point in time the entry occupies. A bolus, a vital and an event each sit at one instant;
 * an infusion spans two, and a running infusion is treated as ending at its start until it is
 * stopped, so it never stretches the timeline past what has actually been documented.
 */
export function entryTimes(entry: Entry): Timestamp[] {
  if (entry.type === 'infusion') {
    return [entry.startedAt, entry.endedAt ?? entry.startedAt]
  }
  return [entry.at]
}

/** The instant an entry is anchored to, used for sorting a mixed list. */
export function entryStart(entry: Entry): Timestamp {
  return entry.type === 'infusion' ? entry.startedAt : entry.at
}

export function byTime(a: Entry, b: Entry): number {
  return entryStart(a) - entryStart(b)
}

/** Visible vital entries of one kind, oldest first — the shape a plotted series needs. */
export function vitalSeries(record: AnesthesiaCase, kind: VitalKind): VitalEntry[] {
  return record.entries
    .filter((entry): entry is VitalEntry => entry.type === 'vital' && entry.vital === kind)
    .filter(isVisible)
    .sort((a, b) => a.at - b.at)
}

export function phaseEvents(record: AnesthesiaCase): PhaseEventEntry[] {
  return record.entries
    .filter((entry): entry is PhaseEventEntry => entry.type === 'event')
    .filter(isVisible)
    .sort((a, b) => a.at - b.at)
}

/**
 * Doses and infusions, oldest first.
 *
 * The narrowed return type matters: with a plain `Entry[]`, a caller that checks for `'bolus'`
 * is left with every other entry shape in the else branch, and reading `startedAt` off it is a
 * compile error. Narrowing here means callers get the two-way split they actually have.
 */
export function medications(record: AnesthesiaCase): (BolusEntry | InfusionEntry)[] {
  return record.entries
    .filter(
      (entry): entry is BolusEntry | InfusionEntry =>
        entry.type === 'bolus' || entry.type === 'infusion',
    )
    .filter(isVisible)
    .sort(byTime)
}
