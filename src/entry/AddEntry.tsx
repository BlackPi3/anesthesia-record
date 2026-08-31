/**
 * Creating an entry: the sheet a row's own „Erfassen“ button opens.
 *
 * There used to be one floating "+" and a first screen asking what kind of thing was being written
 * down. That screen is gone, and so is the metric picker behind it, because the button already
 * answers both questions: it sits on the row it writes into. A saturation is now one tap to the
 * value control instead of three, and the choice is made by pointing at the thing on the chart
 * rather than by reading a list of names for it.
 *
 * What is left is only what a button cannot say. Medications ask how the drug is given and which
 * one, milestones ask which; those are lists, not rows, and there is nothing on the chart to aim
 * at before the first one exists.
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
  BLOOD_PRESSURE_KINDS,
  DRUGS,
  FLUIDS,
  PHASE_EVENTS,
  PHASE_EVENT_ORDER,
  VITALS,
} from '../domain/catalog'
import { caseNow, medications, vitalSeries } from '../domain/entries'
import type {
  AnesthesiaCase,
  Baseline,
  BolusEntry,
  InfusionEntry,
  PhaseEventKind,
  VitalKind,
} from '../domain/types'
import { formatNumber } from '../format'
import { snapToStep } from '../timeline/scales'
import { BloodPressureForm } from './BloodPressureForm'
import { EntryForm } from './EntryForm'
import {
  draftTitle,
  isComplete,
  type BloodPressureDraft,
  type Draft,
  type NewDraft,
} from './draft'
import { SHEET_PARTS } from './sheet'
import type { AddTarget } from './target'

/** How a medication is given. Chosen before the drug, since it decides what the form asks for. */
type MedicationMode = 'bolus' | 'infusion'

export interface AddEntryProps {
  record: AnesthesiaCase
  /** What was pressed. The sheet is rendered only while something is being added. */
  target: AddTarget
  onAdd: (draft: NewDraft) => void
  onClose: () => void
}

/**
 * Rendered only while an entry is being created, and keyed on the target by the caller — the same
 * arrangement `EditEntry` uses, and for the same reason: the draft can live in a plain state
 * initialiser, with no effect copying one prop into it.
 */
export function AddEntry({ record, target, onAdd, onClose }: AddEntryProps) {
  const [mode, setMode] = useState<MedicationMode>('bolus')
  const [draft, setDraft] = useState<NewDraft | null>(() => openingDraft(record, target))
  // A picker is a step that can be gone back to. A row's button has no step behind it, so its
  // sheet offers a way out rather than a way back — and neither does a milestone the completeness
  // check already named, which is why this asks whether a choice was made rather than what kind of
  // target it is.
  const picks =
    target.kind === 'medication' || (target.kind === 'event' && target.event === undefined)

  function back() {
    if (picks && draft !== null) return setDraft(null)
    onClose()
  }

  function commit() {
    if (draft === null || !isComplete(draft)) return
    onAdd(draft)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      placement="bottom"
      height="auto"
      title={draft === null ? pickerTitle(target) : draftTitle(draft)}
      // Every part of the drawer is named, rather than one class on the outside and CSS reaching
      // in for AntD's own element names. Those names changed in AntD 6 and the height cap written
      // against them silently stopped matching — see the entry sheet block in `index.css`.
      classNames={SHEET_PARTS}
      // A sheet that opens on a value hands its focus to the field, so a desktop user types the
      // number straight away rather than clicking into it first. A picker step has no field to
      // hand it to and keeps the drawer's own focus, which is what Escape needs.
      autoFocus={draft === null}
      // The step back has to sit where a thumb already is, not only in the title bar.
      footer={
        <>
          <span className="entry-sheet__spacer" />
          <Button size="large" onClick={back}>
            {picks && draft !== null ? 'Zurück' : 'Abbrechen'}
          </Button>
          {draft !== null && (
            <Button size="large" type="primary" disabled={!isComplete(draft)} onClick={commit}>
              Übernehmen
            </Button>
          )}
        </>
      }
    >
      <div className="entry-sheet__content">
        {draft === null ? (
          target.kind === 'medication' ? (
            <MedicationPicker
              record={record}
              mode={mode}
              onMode={setMode}
              onPick={(drug) => setDraft(newMedication(record, drug, mode))}
            />
          ) : (
            <EventPicker onPick={(event) => setDraft(newEvent(record, event))} />
          )
        ) : draft.type === 'bloodPressure' ? (
          <BloodPressureForm record={record} draft={draft} onChange={setDraft} />
        ) : (
          <EntryForm record={record} draft={draft} onChange={setDraft} />
        )}
      </div>
    </Drawer>
  )
}

/** What a picker step is titled. A drafted entry titles itself, through `draftTitle`. */
function pickerTitle(target: AddTarget): string {
  return target.kind === 'medication' ? 'Medikament' : 'Ereignis'
}

// ---------------------------------------------------------------------------
// What a freshly opened sheet starts on
// ---------------------------------------------------------------------------

/** The draft a button opens straight into, or nothing where a picker comes first. */
function openingDraft(record: AnesthesiaCase, target: AddTarget): NewDraft | null {
  if (target.kind === 'vital') return newVital(record, target.vital)
  if (target.kind === 'bloodPressure') return newBloodPressure(record)
  if (target.kind === 'event' && target.event !== undefined) return newEvent(record, target.event)
  return null
}

/**
 * A number this case already holds for the metric: its last reading, or failing that the
 * pre-operative value in the header.
 *
 * The baseline covers systolic, diastolic and heart rate, and it is matched by name — its fields
 * are named after the vitals deliberately. It is a real measurement of this patient rather than a
 * plausible number invented for the control, which is the whole difference between a starting
 * point and a suggestion.
 */
function lastKnown(record: AnesthesiaCase, vital: VitalKind): number | null {
  const series = vitalSeries(record, vital)
  if (series.length > 0) return series[series.length - 1].value

  return vital in record.baseline ? record.baseline[vital as keyof Baseline] : null
}

/** The value a metric's control opens on. The middle of the range is the last resort. */
function openingValue(record: AnesthesiaCase, vital: VitalKind): number {
  const known = lastKnown(record, vital)
  if (known !== null) return known

  const meta = VITALS[vital]
  const [min, max] = meta.plotRange
  return snapToStep((min + max) / 2, meta.step)
}

function newVital(record: AnesthesiaCase, vital: VitalKind): Draft {
  return { type: 'vital', vital, at: caseNow(record), value: openingValue(record, vital) }
}

/**
 * A reading opens on the three numbers the case already knows, switched on.
 *
 * On, because a monitor cuff reports all three and that is the case to optimise for; the manual
 * cuff, where the mean is genuinely absent, costs one tap to switch off.
 *
 * A kind the case knows nothing about opens switched *off* instead, which in practice is the mean
 * on the first reading of a case — there is no pre-operative mean in the header. The alternative
 * is the middle of the axis, and three of those read `130/130 (130)`, which is not a blood
 * pressure. A number the app cannot get from the record is one it has to ask for rather than
 * propose, and switched off is how it asks.
 */
function newBloodPressure(record: AnesthesiaCase): BloodPressureDraft {
  const readings = Object.fromEntries(
    BLOOD_PRESSURE_KINDS.map((kind) => [
      kind,
      { value: openingValue(record, kind), measured: lastKnown(record, kind) !== null },
    ]),
  ) as BloodPressureDraft['readings']

  return { type: 'bloodPressure', at: caseNow(record), readings }
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

/**
 * What this drug was last given at in this case, given the same way, as it is written on the band.
 *
 * Shown on the tile because it is the number the sheet behind that tile will open on, and because
 * an 88px tile holding one word was screen spent on nothing. It is a documented fact from this
 * case, worded the way the lane rail words one — never a proposal, and never a number from
 * anywhere but the record in front of the person reading it.
 */
function lastDose(record: AnesthesiaCase, drug: string, mode: MedicationMode): string | null {
  if (mode === 'bolus') {
    const previous = lastGiven<BolusEntry>(record, drug, 'bolus')
    return previous === null ? null : `${formatNumber(previous.dose)} ${previous.unit}`
  }

  const previous = lastGiven<InfusionEntry>(record, drug, 'infusion')
  return previous === null
    ? null
    : `${formatNumber(previous.rate, previous.rate < 1 ? 1 : 0)} ${previous.unit}`
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
  record,
  mode,
  onMode,
  onPick,
}: {
  record: AnesthesiaCase
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
        {[...DRUGS, ...FLUIDS].map((drug) => {
          const last = lastDose(record, drug, mode)
          return (
            <button key={drug} type="button" className="picker__tile" onClick={() => onPick(drug)}>
              <span className="picker__lead">{drug}</span>
              {last !== null && <span className="picker__note">zuletzt {last}</span>}
            </button>
          )
        })}
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
