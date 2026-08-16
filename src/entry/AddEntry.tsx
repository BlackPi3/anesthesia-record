/**
 * Creating an entry: the "+" button and the sheet it opens.
 *
 * Three steps, deliberately, rather than one dense form. What kind of thing is being written down
 * is a glance-and-tap decision, which one of them it is is another, and setting the value is a
 * careful one. Putting them on screen together makes the careful step compete with two choices
 * already finished with, so whichever step is live owns the sheet.
 *
 * The cost is one tap more than a single flat chooser would need. It buys a first screen that
 * stays short as the catalog grows, and a picker per kind that can look like what it is picking —
 * metrics carry their lane colour, drugs do not.
 *
 * Values open on the last one recorded for the same metric or drug in this case, rather than at
 * the middle of the scale. Vitals move gradually and doses repeat, so the previous entry is
 * usually within a step or two of the new one, and starting there turns most entries into a tap
 * or two instead of a hunt across the range. Where the case holds nothing to copy, an amount
 * opens at zero and the sheet will not save it — see `isComplete` in draft.ts.
 */

import { useState } from 'react'
import { Button, Drawer, Segmented } from 'antd'

import {
  DRUGS,
  FLUIDS,
  PHASE_EVENTS,
  PHASE_EVENT_ORDER,
  VITALS,
  VITAL_ORDER,
  laneForVital,
} from '../domain/catalog'
import { caseNow, medications, vitalSeries } from '../domain/entries'
import type {
  AnesthesiaCase,
  BolusEntry,
  InfusionEntry,
  PhaseEventKind,
  VitalKind,
} from '../domain/types'
import { laneColor } from '../theme'
import { snapToStep } from '../timeline/scales'
import { EntryForm } from './EntryForm'
import { draftTitle, isComplete, type Draft } from './draft'

/** The three families the "+" button offers, in the order they appear. */
const FAMILIES = [
  { id: 'vital', label: 'Wert', note: 'Vitalparameter' },
  { id: 'medication', label: 'Medikament', note: 'Bolus oder Dauerinfusion' },
  { id: 'event', label: 'Ereignis', note: 'Phase oder Zeitpunkt' },
] as const

type Family = (typeof FAMILIES)[number]['id']

/** How a medication is given. Chosen before the drug, since it decides what the form asks for. */
type MedicationMode = 'bolus' | 'infusion'

export interface AddEntryProps {
  record: AnesthesiaCase
  onAdd: (draft: Draft) => void
}

export function AddEntry({ record, onAdd }: AddEntryProps) {
  const [open, setOpen] = useState(false)
  const [family, setFamily] = useState<Family | null>(null)
  const [mode, setMode] = useState<MedicationMode>('bolus')
  const [draft, setDraft] = useState<Draft | null>(null)

  function start() {
    // Reset on open, not on close: a sheet that rebuilds its state as it disappears animates the
    // reset in front of the user.
    setFamily(null)
    setMode('bolus')
    setDraft(null)
    setOpen(true)
  }

  /** One step back, or out of the sheet entirely if there is nowhere left to go. */
  function back() {
    if (draft !== null) return setDraft(null)
    if (family !== null) return setFamily(null)
    setOpen(false)
  }

  function commit() {
    if (draft === null || !isComplete(draft)) return
    onAdd(draft)
    setOpen(false)
  }

  return (
    <>
      <Button type="primary" size="large" className="add-entry__open" onClick={start}>
        + Erfassen
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        height="auto"
        title={draft === null ? 'Erfassen' : draftTitle(draft)}
        className="entry-sheet"
        // The step back has to sit where a thumb already is, not only in the title bar.
        footer={
          family === null ? null : (
            <div className="entry-sheet__footer">
              <Button size="large" onClick={back}>
                Zurück
              </Button>
              {draft !== null && (
                <Button
                  size="large"
                  type="primary"
                  disabled={!isComplete(draft)}
                  onClick={commit}
                >
                  Übernehmen
                </Button>
              )}
            </div>
          )
        }
      >
        <div className="entry-sheet__body">
          {draft !== null ? (
            <EntryForm record={record} draft={draft} onChange={setDraft} />
          ) : family === null ? (
            <FamilyPicker onPick={setFamily} />
          ) : family === 'vital' ? (
            <MetricPicker onPick={(kind) => setDraft(newVital(record, kind))} />
          ) : family === 'medication' ? (
            <MedicationPicker
              mode={mode}
              onMode={setMode}
              onPick={(drug) => setDraft(newMedication(record, drug, mode))}
            />
          ) : (
            <EventPicker onPick={(event) => setDraft(newEvent(record, event))} />
          )}
        </div>
      </Drawer>
    </>
  )
}

// ---------------------------------------------------------------------------
// What a freshly picked entry opens on
// ---------------------------------------------------------------------------

function newVital(record: AnesthesiaCase, vital: VitalKind): Draft {
  const series = vitalSeries(record, vital)
  const meta = VITALS[vital]
  const [min, max] = meta.plotRange
  const value =
    series.length > 0 ? series[series.length - 1].value : snapToStep((min + max) / 2, meta.step)

  return { type: 'vital', vital, at: caseNow(record), value }
}

/** The most recent entry of this drug given the same way, which a repeat dose can start from. */
function lastGiven<T extends BolusEntry | InfusionEntry>(
  record: AnesthesiaCase,
  drug: string,
  type: T['type'],
): T | null {
  const matches = medications(record).filter(
    (entry): entry is T => entry.type === type && entry.drug === drug,
  )
  return matches.length > 0 ? matches[matches.length - 1] : null
}

function newMedication(record: AnesthesiaCase, drug: string, mode: MedicationMode): Draft {
  const at = caseNow(record)

  if (mode === 'bolus') {
    const previous = lastGiven<BolusEntry>(record, drug, 'bolus')
    return {
      type: 'bolus',
      drug,
      at,
      dose: previous?.dose ?? 0,
      unit: previous?.unit ?? 'mg',
    }
  }

  const previous = lastGiven<InfusionEntry>(record, drug, 'infusion')
  return {
    type: 'infusion',
    drug,
    startedAt: at,
    // A newly documented infusion is running. Stopping it is a later, separate act.
    endedAt: null,
    rate: previous?.rate ?? 0,
    unit: previous?.unit ?? 'ml/h',
  }
}

function newEvent(record: AnesthesiaCase, event: PhaseEventKind): Draft {
  return { type: 'event', event, at: caseNow(record) }
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

function FamilyPicker({ onPick }: { onPick: (family: Family) => void }) {
  return (
    <div className="picker" role="group" aria-label="Art des Eintrags auswählen">
      {FAMILIES.map((option) => (
        <button
          key={option.id}
          type="button"
          className="picker__tile"
          onClick={() => onPick(option.id)}
        >
          <span className="picker__lead">{option.label}</span>
          <span className="picker__note">{option.note}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The six metrics as large targets, each carrying the colour of the lane it will be drawn in, so
 * the choice made here and the point that appears on the chart are visibly the same thing. The
 * colour is an accent on a bordered tile, never the only thing distinguishing one tile from
 * another — the label does that.
 */
function MetricPicker({ onPick }: { onPick: (kind: VitalKind) => void }) {
  return (
    <div className="picker" role="group" aria-label="Vitalparameter auswählen">
      {VITAL_ORDER.map((kind) => {
        const meta = VITALS[kind]
        return (
          <button
            key={kind}
            type="button"
            className="picker__tile picker__tile--accented"
            style={{ '--accent': laneColor[laneForVital(kind).id] } as React.CSSProperties}
            onClick={() => onPick(kind)}
          >
            <span className="picker__lead">{meta.short}</span>
            <span className="picker__label">{meta.label}</span>
            <span className="picker__note">{meta.unit}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * How the drug is given, then which drug.
 *
 * The mode comes first because it decides what the next screen asks for — a dose or a rate — and
 * because the same drug is legitimately given either way. Fluids sit in the same grid rather than
 * a section of their own: they are documented as continuous medications and share the entry type,
 * and a bolus of a fluid is a real thing to want to write down.
 *
 * The list is a shortcut, not a closed set. `Anderes` opens a free-text field, because a record
 * that cannot document an unlisted drug is worse than one that accepts a typo.
 */
function MedicationPicker({
  mode,
  onMode,
  onPick,
}: {
  mode: MedicationMode
  onMode: (mode: MedicationMode) => void
  onPick: (drug: string) => void
}) {
  const [other, setOther] = useState('')

  return (
    <>
      <div className="unit-picker">
        <span className="unit-picker__caption" id="medication-mode-label">
          Gabe
        </span>
        <Segmented
          size="large"
          value={mode}
          onChange={(next) => onMode(next as MedicationMode)}
          aria-labelledby="medication-mode-label"
          options={[
            { value: 'bolus', label: 'Bolus' },
            { value: 'infusion', label: 'Dauerinfusion' },
          ]}
        />
      </div>

      <div className="picker" role="group" aria-label="Medikament auswählen">
        {[...DRUGS, ...FLUIDS].map((drug) => (
          <button key={drug} type="button" className="picker__tile" onClick={() => onPick(drug)}>
            <span className="picker__lead">{drug}</span>
          </button>
        ))}
      </div>

      <div className="other-drug">
        <label className="unit-picker__caption" htmlFor="other-drug">
          Anderes Medikament
        </label>
        <div className="other-drug__row">
          <input
            id="other-drug"
            className="other-drug__input"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            placeholder="Bezeichnung"
          />
          <Button size="large" disabled={other.trim() === ''} onClick={() => onPick(other.trim())}>
            Weiter
          </Button>
        </div>
      </div>
    </>
  )
}

/** The milestones, in the order a case normally reaches them. */
function EventPicker({ onPick }: { onPick: (event: PhaseEventKind) => void }) {
  return (
    <div className="picker" role="group" aria-label="Ereignis auswählen">
      {PHASE_EVENT_ORDER.map((event) => (
        <button key={event} type="button" className="picker__tile" onClick={() => onPick(event)}>
          <span className="picker__lead">{PHASE_EVENTS[event].label}</span>
        </button>
      ))}
    </div>
  )
}
