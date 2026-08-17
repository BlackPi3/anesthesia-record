/**
 * Correcting or removing an entry that already exists.
 *
 * A separate sheet from `AddEntry` rather than a mode inside it, because the two differ in almost
 * everything a mode flag would have to switch: there are no picker steps, the title names an
 * entry rather than a choice, and the footer offers removal. What they share is the form, which is
 * the part worth sharing.
 *
 * It is rendered only while an entry is being edited, and keyed on that entry's id by the caller.
 * That is what lets the draft live in a plain `useState` initialiser: the component mounts fresh
 * for each entry, so there is no stale draft to synchronise and no effect to do the synchronising.
 * An effect copying props into state here would be the classic way to end up showing one entry's
 * values under another entry's name.
 */

import { useState } from 'react'
import { Button, Drawer } from 'antd'

import type { AnesthesiaCase, Entry } from '../domain/types'
import { formatTime } from '../format'
import { EntryForm } from './EntryForm'
import { draftFrom, draftTitle, isComplete, type Draft } from './draft'

export interface EditEntryProps {
  record: AnesthesiaCase
  entry: Entry
  onCorrect: (id: string, draft: Draft) => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function EditEntry({ record, entry, onCorrect, onRemove, onClose }: EditEntryProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry))

  function commit() {
    if (!isComplete(draft)) return
    onCorrect(entry.id, draft)
    onClose()
  }

  function remove() {
    onRemove(entry.id)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      placement="bottom"
      height="auto"
      title={draftTitle(draft)}
      className="entry-sheet"
      // The value field takes the focus instead, so a correction can be typed on arrival. A
      // milestone is the one entry with no value to type, so that sheet keeps the drawer's own
      // focus — something inside has to hold it, or Escape has nothing to close.
      autoFocus={draft.type === 'event'}
      footer={
        <div className="entry-sheet__footer">
          {/* Removal sits apart from the other two, on the side a thumb reaches last. It is the
              one action here that takes something off the chart. */}
          <Button size="large" danger onClick={remove}>
            Entfernen
          </Button>
          <span className="entry-sheet__spacer" />
          <Button size="large" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="large" type="primary" disabled={!isComplete(draft)} onClick={commit}>
            Übernehmen
          </Button>
        </div>
      }
    >
      <div className="entry-sheet__body">
        <EntryForm record={record} draft={draft} onChange={setDraft} />
        <History entry={entry} />
      </div>
    </Drawer>
  )
}

/**
 * What this entry was before, if it has been changed.
 *
 * The brief asks for a *clear* audit trail, and until now the revisions were stored faithfully and
 * shown nowhere. Here is where they are least intrusive and most useful: in front of someone about
 * to change the entry again, so a correction is made knowing what it is correcting.
 */
function History({ entry }: { entry: Entry }) {
  if (entry.revisions.length === 0) return null

  return (
    <div className="history">
      <h3 className="history__caption">Änderungen</h3>
      <ol className="history__list">
        {entry.revisions.map((revision, index) => (
          <li key={revision.revisedAt + index} className="history__item">
            <span className="history__time">{formatTime(revision.revisedAt)}</span>
            <span className="history__previous">{describe(revision.previous)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * One revision's stored values, as a line of text.
 *
 * Driven by the keys actually present rather than by the entry type: every revision holds a
 * `Pick` of the fields that entry can correct, so listing what is there needs no second copy of
 * which type owns which fields. Timestamps print as times; everything else prints as itself.
 */
function describe(previous: Record<string, unknown>): string {
  const TIME_FIELDS = new Set(['at', 'startedAt', 'endedAt'])
  const LABELS: Record<string, string> = {
    at: 'Zeitpunkt',
    startedAt: 'Beginn',
    endedAt: 'Ende',
    value: 'Wert',
    dose: 'Dosis',
    rate: 'Rate',
    drug: 'Medikament',
    unit: 'Einheit',
  }

  return Object.entries(previous)
    .map(([key, value]) => {
      const label = LABELS[key] ?? key
      if (value === null) return `${label} läuft`
      const shown = TIME_FIELDS.has(key) ? formatTime(value as number) : String(value)
      return `${label} ${shown}`
    })
    .join(' · ')
}
