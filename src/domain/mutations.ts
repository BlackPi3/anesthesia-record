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

import type { AnesthesiaCase, Entry, Timestamp } from './types'

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
 * Moves a vital entry to a new time and value, recording what it was before.
 *
 * A correction that lands on the identical time and value is not a correction, and writes no
 * revision — otherwise every stray tap would add a line to the audit trail and make the real
 * corrections harder to find.
 */
export function correctVital(
  record: AnesthesiaCase,
  id: string,
  next: { at: Timestamp; value: number },
  now: Timestamp = Date.now(),
): AnesthesiaCase {
  return replaceEntry(record, id, (entry) => {
    if (entry.type !== 'vital') return entry
    if (entry.at === next.at && entry.value === next.value) return entry

    return {
      ...entry,
      at: next.at,
      value: next.value,
      revisions: [
        ...entry.revisions,
        { revisedAt: now, previous: { at: entry.at, value: entry.value } },
      ],
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
