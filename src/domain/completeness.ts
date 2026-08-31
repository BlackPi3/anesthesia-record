/**
 * The completeness check: what is structurally wrong with the record.
 *
 * Three things, and they are the three the challenge names — a required milestone that was never
 * recorded, an entry whose unit is missing, a continuous dosing with no end. What they have in
 * common is the whole reason this file can exist at all: **every one is about the shape of the
 * record, never about a number in it.** It may say „Naht nicht erfasst"; it may never say a dose
 * looks high or a saturation looks low. That is the same line `CLAUDE.md` draws when it forbids
 * calculating a medical value, arrived at from the other side.
 *
 * Pure functions over a case, no React and no German, so the rules can be tested with plain data
 * the way `scales.ts` is. The sentences live in `Completeness.tsx`.
 *
 * ---
 *
 * **A flag is a contradiction, never „you are not finished yet".** This is the rule that decides
 * everything below, and the obvious alternative is wrong: a case that has just been induced has
 * four of its five milestones unrecorded because three of them have not happened, so checking them
 * outright would put „Offen (4)" on a record with nothing whatever wrong with it, for most of the
 * operation. A warning that fires on the normal case is worse than no warning.
 *
 * So each rule waits for something in the record to contradict what is absent:
 *
 * - A milestone is missing only when a **later** one is already recorded. Naht at 09:11 with no
 *   Schnitt is a hole somebody has to explain; Naht simply not being there yet is a case in
 *   progress.
 * - An infusion has no end only once **Entlassung** is recorded. Running is a state the record is
 *   built to hold — `InfusionEnd` in the entry form says so — and it stops being a state and starts
 *   being an omission when the record also says the patient went home.
 * - A unit is checked always, because there is no moment at which a dose is legitimately given in
 *   nothing.
 *
 * What this deliberately gives up: a record that stops after Naht is never flagged for the two
 * milestones it never reached. The check says the record is inconsistent; it never says the record
 * is unfinished. Saying that would mean reading „the anaesthetic is over" off a single event, which
 * is exactly the conclusion `CaseHeader` refuses to draw — it reports which phase was written down
 * last and decides nothing about whether the case is running. Decided 2026-09-01; the two rejected
 * alternatives are in `docs/decisions.md`.
 *
 * Removed entries are not in the record's shape, so everything here reads the visible ones. An
 * event that was entered and then removed counts as never recorded, which is what it is.
 */

import { BOLUS_UNITS, INFUSION_UNITS, PHASE_EVENT_ORDER } from './catalog'
import { entryStart, medications, phaseEvents } from './entries'
import type { AnesthesiaCase, PhaseEventKind, Timestamp } from './types'

/**
 * One thing that is wrong with the shape of the record.
 *
 * Each carries what it needs to be both worded and acted on: the milestone to enter, or the id of
 * the entry to open. The evidence is carried too — `after`, `dischargedAt` — because a flag that
 * cannot say why it fired is one the reader has to take on trust.
 */
export type Flag =
  | {
      kind: 'skippedEvent'
      event: PhaseEventKind
      /** The earliest recorded milestone that comes after it, which is what proves it was skipped. */
      after: PhaseEventKind
      afterAt: Timestamp
    }
  | {
      kind: 'missingUnit'
      entryId: string
      drug: string
      at: Timestamp
      given: 'bolus' | 'infusion'
    }
  | {
      kind: 'openInfusion'
      entryId: string
      drug: string
      startedAt: Timestamp
      /** When the record says the patient was discharged, which is what makes the gap a gap. */
      dischargedAt: Timestamp
    }

/**
 * Everything wrong with the record, in the order the challenge names the three checks.
 *
 * Not sorted by time. A missing milestone is anchored to the entry that proves it rather than to
 * itself — it has no time, that is the point — so a single chronological list would be ordering
 * two different kinds of instant against each other.
 */
export function completenessFlags(record: AnesthesiaCase): Flag[] {
  return [...skippedEvents(record), ...missingUnits(record), ...openInfusions(record)]
}

/** Stable identity for a flag, for React keys and for test assertions. */
export function flagKey(flag: Flag): string {
  return flag.kind === 'skippedEvent' ? `${flag.kind}:${flag.event}` : `${flag.kind}:${flag.entryId}`
}

/**
 * Milestones that were stepped over.
 *
 * The first time each milestone was recorded is what counts. A milestone entered twice is odd but
 * it is not incomplete, and this check has no opinion about it — flagging a duplicate would be a
 * fourth rule nobody asked for.
 */
function skippedEvents(record: AnesthesiaCase): Flag[] {
  const recorded = new Map<PhaseEventKind, Timestamp>()
  // `phaseEvents` is oldest first, so the first write per kind is the earliest one.
  for (const entry of phaseEvents(record)) {
    if (!recorded.has(entry.event)) recorded.set(entry.event, entry.at)
  }

  return PHASE_EVENT_ORDER.flatMap((event, index): Flag[] => {
    if (recorded.has(event)) return []

    // The earliest milestone after it that *was* recorded. The earliest rather than the latest,
    // because it is the tightest evidence: with Naht and Entlassung both recorded, „Naht ist um
    // 09:11 erfasst" is the fact that makes a missing Schnitt a hole, and Entlassung only repeats
    // it from further away.
    const proof = PHASE_EVENT_ORDER.slice(index + 1)
      .map((later) => [later, recorded.get(later)] as const)
      .find((pair): pair is readonly [PhaseEventKind, Timestamp] => pair[1] !== undefined)

    if (proof === undefined) return []
    return [{ kind: 'skippedEvent', event, after: proof[0], afterAt: proof[1] }]
  })
}

/**
 * Doses given in a unit this app does not know.
 *
 * `unit` is a required field of a non-optional union, so nothing the entry sheet can produce
 * reaches this — which is worth saying plainly rather than leaving as a check that looks like it
 * guards the forms. What it guards is the other way in: `isEntry` in `storage.ts` confirms an
 * entry's `id`, `recordedAt`, `deletedAt` and `type` and stops there, so a hand-edited or
 * truncated envelope can load a bolus whose unit is absent or is a string from an older build.
 * The record then draws a dose with nothing after the number, which is a dose nobody can act on.
 *
 * Compared against the catalog rather than against `undefined`, so an unrecognised unit is caught
 * as well as an absent one. Both are the same failure to a reader: the amount does not say of what.
 */
function missingUnits(record: AnesthesiaCase): Flag[] {
  const known: Record<'bolus' | 'infusion', Set<string>> = {
    bolus: new Set<string>(BOLUS_UNITS),
    infusion: new Set<string>(INFUSION_UNITS),
  }

  return medications(record).flatMap((entry): Flag[] =>
    known[entry.type].has(entry.unit)
      ? []
      : [
          {
            kind: 'missingUnit',
            entryId: entry.id,
            drug: entry.drug,
            at: entryStart(entry),
            given: entry.type,
          },
        ],
  )
}

/** Infusions still running in a record that says the patient has been discharged. */
function openInfusions(record: AnesthesiaCase): Flag[] {
  const discharge = phaseEvents(record).find((entry) => entry.event === 'discharge')
  if (discharge === undefined) return []

  return medications(record).flatMap((entry): Flag[] =>
    entry.type === 'infusion' && entry.endedAt === null
      ? [
          {
            kind: 'openInfusion',
            entryId: entry.id,
            drug: entry.drug,
            startedAt: entry.startedAt,
            dischargedAt: discharge.at,
          },
        ]
      : [],
  )
}
