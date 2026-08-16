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

/**
 * Longest a case is assumed to run. Only used to decide whether the wall clock still belongs to
 * this case; nothing is validated or rejected against it.
 */
const CASE_MAX_DURATION = 12 * 60 * 60_000

/**
 * The time a new entry should default to: "now", as the case understands it.
 *
 * A live case wants the wall clock, which is how OR documentation actually works — you write the
 * value down as it happens. But the demo case is pinned to a fixed date so the chart, the
 * screenshots and the Playwright assertions see the same case every run, and once that date is in
 * the past the wall clock is not a time in this case at all. Defaulting to it would place the new
 * entry days after everything else, and `caseTimeWindow` would stretch the axis to reach it,
 * squashing the entire record against the left edge.
 *
 * So the wall clock is used while it falls inside the case, and otherwise the entry defaults to
 * the end of what has been documented. The user can still move it; this only decides where the
 * control opens.
 */
export function caseNow(record: AnesthesiaCase, now: Timestamp = Date.now()): Timestamp {
  if (now >= record.startedAt && now <= record.startedAt + CASE_MAX_DURATION) return now

  const times = visibleEntries(record).flatMap(entryTimes)
  return times.length > 0 ? Math.max(...times) : record.startedAt
}

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
