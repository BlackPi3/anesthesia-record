/**
 * The completeness check, as the record shows it: a chip in the header, and the list behind it.
 *
 * **A chip, not a gate and not a panel** (decided 2026-09-01; both alternatives and their costs are
 * in `docs/decisions.md`). The header already carries ambient state — „Gespeichert HH:MM" sits
 * beside this — so a count belongs there too, and pressing it opens the list in the same kind of
 * sheet the entry controls use. Closing it gives the space back. When the record's shape is sound
 * there is no chip at all, which is what the demo case ships as: it costs nothing at rest.
 *
 * **Every row prompts, and nothing here writes.** A flag naming a milestone opens the entry sheet
 * on that milestone; a flag naming an entry opens that entry for correction. Both then wait for
 * „Übernehmen“. The app filling in a Narkosebeginn because it noticed one was missing would put a
 * milestone in the record that nobody documented, and „the app inferred it“ is not a provenance a
 * clinical document can carry. The check finds the gap; the anesthesiologist enters the value, at
 * the timestamp they choose.
 *
 * **No alarm colour.** Red and amber carry IEC 60601-1-8 priority and an anesthesiologist has them
 * hard-wired from the monitor; `theme.ts` keeps them off this interface on purpose. So the chip
 * wears the accent wash the lane gutters wear — the colour that means „you can press this“ — and
 * nothing about a missing unit is styled as a patient in trouble.
 */

import { useState } from 'react'
import { Button, Drawer, Typography } from 'antd'

import { PHASE_EVENTS } from './domain/catalog'
import { completenessFlags, flagKey, type Flag } from './domain/completeness'
import type { AnesthesiaCase } from './domain/types'
import { SHEET_PARTS } from './entry/sheet'
import type { AddTarget } from './entry/target'
import { formatTime } from './format'

export interface CompletenessProps {
  record: AnesthesiaCase
  /** Opens the creation sheet, already on the milestone a flag named. */
  onAdd: (target: AddTarget) => void
  /** Opens an existing entry for correction. */
  onEdit: (id: string) => void
}

export function Completeness({ record, onAdd, onEdit }: CompletenessProps) {
  const [open, setOpen] = useState(false)
  const flags = completenessFlags(record)

  // Nothing to say. Not a chip reading „Vollständig“ — a green tick that is present on every
  // sound record is chrome the header pays for permanently and reports nothing by being there.
  if (flags.length === 0) return null

  /**
   * Acting on a flag closes this sheet and opens the one that fixes it, rather than stacking a
   * second drawer over the first. The list is a way in; it is not somewhere to stay.
   */
  function act(flag: Flag) {
    setOpen(false)
    if (flag.kind === 'skippedEvent') return onAdd({ kind: 'event', event: flag.event })
    onEdit(flag.entryId)
  }

  return (
    <>
      {/*
        A control, so it takes focus and answers to the keyboard, and 44px tall like every other
        target in the header. Not an AntD Button: beside „Rückgängig“ and „Demodaten zurücksetzen“
        a third bordered button would read as a third action of equal weight, and this is a piece
        of state that happens to be pressable.
      */}
      <button
        type="button"
        className="completeness-chip"
        onClick={() => setOpen(true)}
        aria-label={`${flags.length} ${flags.length === 1 ? 'offener Punkt' : 'offene Punkte'} im Protokoll, Liste öffnen`}
      >
        Offen ({flags.length})
      </button>

      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          placement="bottom"
          height="auto"
          title="Offene Punkte"
          // The five names the entry sheets use, from the same place: same card, same size, same
          // place on screen. See `entry/sheet.ts`.
          classNames={SHEET_PARTS}
          footer={
            <>
              <span className="entry-sheet__spacer" />
              <Button size="large" onClick={() => setOpen(false)}>
                Schließen
              </Button>
            </>
          }
        >
          <div className="entry-sheet__content">
            {/*
              Said out loud, because it is the one thing about this feature a clinician would
              reasonably assume otherwise. Nothing here reads a value: it is the same sentence
              the code is written against, in the place someone would look for it.
            */}
            <Typography.Text type="secondary">
              Geprüft wird die Form des Protokolls, nicht die Messwerte.
            </Typography.Text>

            <ul className="flags">
              {flags.map((flag) => {
                const { lead, note, action } = describe(flag)
                return (
                  <li key={flagKey(flag)}>
                    <button type="button" className="flags__item" onClick={() => act(flag)}>
                      <span className="flags__lead">{lead}</span>
                      <span className="flags__note">{note}</span>
                      <span className="flags__action">{action}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </Drawer>
      )}
    </>
  )
}

/**
 * One flag as three pieces of German: what is wrong, what in the record says so, and what pressing
 * the row does.
 *
 * The note is not decoration. A flag that only says „Schnitt nicht erfasst“ asks to be believed;
 * one that adds „Naht ist um 09:11 erfasst“ shows its working, and it is the difference between a
 * warning and a statement about the record. Every note is a fact already documented in this case.
 *
 * Kept here rather than in `completeness.ts`, so the rules stay testable as plain data and the
 * German lives with the component that renders it — the split `draftTitle` and `catalog.ts` use.
 */
function describe(flag: Flag): { lead: string; note: string; action: string } {
  switch (flag.kind) {
    case 'skippedEvent':
      return {
        lead: `${PHASE_EVENTS[flag.event].label} nicht erfasst`,
        note: `${PHASE_EVENTS[flag.after].label} ist um ${formatTime(flag.afterAt)} erfasst`,
        action: 'Eintragen',
      }
    case 'missingUnit':
      return {
        lead: `${flag.drug}: Einheit fehlt`,
        note: `${flag.given === 'bolus' ? 'Bolus' : 'Dauerinfusion'} um ${formatTime(flag.at)}`,
        action: 'Ergänzen',
      }
    case 'openInfusion':
      return {
        lead: `${flag.drug}: Dauerinfusion ohne Ende`,
        note: `Beginn ${formatTime(flag.startedAt)} · Entlassung um ${formatTime(flag.dischargedAt)} erfasst`,
        action: 'Ende eintragen',
      }
  }
}
