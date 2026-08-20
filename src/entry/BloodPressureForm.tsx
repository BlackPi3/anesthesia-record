/**
 * One non-invasive blood pressure measurement: three numbers and the time they were taken.
 *
 * This is the one entry in the app that is not one number, and the reason is the instrument. An
 * oscillometric cuff inflates once and reads systolic, mean and diastolic off that single
 * inflation; an arterial line derives all three from one waveform. They are not three measurements
 * that happen to fall at the same minute, they are one measurement reported three ways, and the
 * monitor shows them as one item. So the sheet asks once.
 *
 * Each number can still be switched off, because the other way of taking a pressure is a manual
 * cuff and a stethoscope, which gives a systolic and a diastolic and no mean at all. Calculating
 * the missing mean would be the app inventing a clinical value, and requiring it would mean typing
 * a number nobody measured. `nicht gemessen` is the honest third option.
 *
 * It is laid out like every other entry sheet: the number and the keypad on the left, what the
 * entry says about itself — which of the three pressures were measured, and when — on the right.
 *
 * There is one keypad, not three. Three keypads do not fit on an iPad, and they would be answering
 * a question the sheet never asks: the three numbers are typed one after another, never at once.
 * So the rows are the selection — tapping a number says "this is the one I am typing" — and the
 * keypad writes into whichever is selected. It is the same shape as the monitor being copied from,
 * where one reading is read off in one order, and it means the whole entry is `1` `3` `3`, tap,
 * `8` `0`, tap, `9` `8`.
 *
 * Correcting stays one value at a time, on the chart or in the editing sheet, which is what the
 * other reason for splitting them up actually needs: noticing afterwards that one of the three was
 * an artefact and fixing exactly that one.
 */

import { useEffect, useRef, useState } from 'react'
import { Checkbox } from 'antd'

import { BLOOD_PRESSURE_KINDS, VITALS, vitalAmount } from '../domain/catalog'
import { caseNow } from '../domain/entries'
import type { AnesthesiaCase } from '../domain/types'
import { formatValue } from '../format'
import { TimeField } from './EntryForm'
import { Keypad } from './Keypad'
import {
  digitsText,
  digitsValue,
  handleKey,
  nudge,
  pressKey,
  type Digits,
  type Key,
} from './digits'
import type { BloodPressureDraft, BloodPressureKind } from './draft'

export interface BloodPressureFormProps {
  record: AnesthesiaCase
  draft: BloodPressureDraft
  onChange: (draft: BloodPressureDraft) => void
}

export function BloodPressureForm({ record, draft, onChange }: BloodPressureFormProps) {
  // The pressure the keypad is typing into. Systolic first, because that is the number a reading
  // is read out from and the one every cuff reports.
  const [selected, setSelected] = useState<BloodPressureKind>('bloodPressureSystolic')
  const [digits, setDigits] = useState<Digits>(null)
  const first = useRef<HTMLButtonElement>(null)

  const meta = vitalAmount(selected)
  const value = draft.readings[selected].value

  // The row the keypad opens on takes the focus, so a desktop keyboard types into this sheet the
  // same way it types into a single-value one. Every later row is focused by the tap that selects
  // it. See the same effect in `ValueField` for why it is not the `autoFocus` attribute.
  useEffect(() => {
    first.current?.focus()
  }, [])

  function setReading(
    kind: BloodPressureKind,
    next: Partial<BloodPressureDraft['readings'][BloodPressureKind]>,
  ) {
    onChange({
      ...draft,
      readings: { ...draft.readings, [kind]: { ...draft.readings[kind], ...next } },
    })
  }

  /** Moving the keypad to another number abandons whatever was half-typed into this one. */
  function select(kind: BloodPressureKind) {
    setSelected(kind)
    setDigits(null)
  }

  /**
   * A number typed into a row is the clearest statement there is that it was measured, so entering
   * one switches the row back on. Switching a row off keeps its value and is still one tap; this
   * only means the checkbox is not a second thing to remember after typing.
   */
  function write(next: number) {
    setReading(selected, { value: next, measured: true })
  }

  function press(key: Key) {
    const next = pressKey(digits, key, value, meta)
    setDigits(next)
    write(digitsValue(next, value, meta))
  }

  function step(direction: number) {
    setDigits(null)
    write(nudge(value, direction, meta))
  }

  const type = (event: React.KeyboardEvent) => handleKey(event, press, step)

  return (
    <div className="entry-form">
      {/* The same left column the single-value sheet has: the number, and the keys that type it.
          Typing is caught here and on the rows, which are the only two places the focus can be
          while a pressure is being entered — and deliberately not on the time controls, where a
          digit is not a value. */}
      <div className="entry-form__value" onKeyDown={type}>
        {/* The reading in the notation it is written and spoken in, so what the sheet is about to
            store looks like what a monitor shows and what a protocol records. */}
        <output className="value-field__readout value-field__readout--sole">
          <span className="pressure__notation">{notation(draft)}</span>
          <span className="value-field__unit">mmHg</span>
        </output>

        <Keypad amount={meta} onKey={press} onStep={step} />
      </div>

      <div className="entry-form__meta">
        <div className="pressure-rows" onKeyDown={type}>
          {BLOOD_PRESSURE_KINDS.map((kind) => (
            <PressureRow
              key={kind}
              kind={kind}
              reading={draft.readings[kind]}
              selected={kind === selected}
              ref={kind === 'bloodPressureSystolic' ? first : undefined}
              // Only the selected row can be mid-way through being typed, so it is the only one
              // that shows digits rather than the number the draft holds.
              text={kind === selected ? digitsText(digits, value, meta) : null}
              onSelect={() => select(kind)}
              onMeasured={(measured) => setReading(kind, { measured })}
            />
          ))}

          <p className="pressure__target">
            Eingabe: <strong>{VITALS[selected].label}</strong>
          </p>
        </div>

        {/* One time for all three. It is the whole reason this is one sheet: the shared timestamp
            is what makes them one reading rather than three that landed near each other. */}
        <TimeField
          caption="Zeitpunkt"
          at={draft.at}
          min={record.startedAt}
          now={caseNow(record)}
          onChange={(at) => onChange({ ...draft, at })}
        />
      </div>
    </div>
  )
}

/**
 * `120/70 (85)` — systolic over diastolic, mean in brackets.
 *
 * That is the order it is written in and read out in, and it is deliberately not the order of the
 * rows below, which run systolic, mean, diastolic to match how the three sit on the lane: highest
 * at the top. A number that was not measured prints as a dash rather than dropping out, so the
 * notation keeps its shape and a missing mean is visibly missing.
 */
function notation(draft: BloodPressureDraft): string {
  const shown = (kind: BloodPressureKind) => {
    const reading = draft.readings[kind]
    return reading.measured ? formatValue(kind, reading.value) : '–'
  }

  return `${shown('bloodPressureSystolic')}/${shown('bloodPressureDiastolic')} (${shown(
    'bloodPressureMean',
  )})`
}

/**
 * One of the three: a checkbox that names it and a value that is also the keypad's target.
 *
 * The number is the button, because the number is what is being pointed at. Selecting is separate
 * from measuring — you can point the keypad at a row that is switched off, and typing is what
 * switches it back on.
 *
 * Switched off, the value stays where it was and only stops being written. Clearing it to zero
 * would mean re-finding the number after a mistaken tap, and zero is a real pressure the field can
 * otherwise reach.
 */
function PressureRow({
  kind,
  reading,
  selected,
  text,
  ref,
  onSelect,
  onMeasured,
}: {
  kind: BloodPressureKind
  reading: { value: number; measured: boolean }
  selected: boolean
  /** What the value reads while it is being typed, or `null` to show the stored number. */
  text: string | null
  /** Set on the row the sheet opens on, which is the one that takes the focus. */
  ref?: React.Ref<HTMLButtonElement>
  onSelect: () => void
  onMeasured: (measured: boolean) => void
}) {
  const meta = VITALS[kind]

  return (
    <div className={reading.measured ? 'pressure-row' : 'pressure-row pressure-row--off'}>
      <div className="pressure-row__head">
        <Checkbox
          checked={reading.measured}
          onChange={(event) => onMeasured(event.target.checked)}
          aria-label={`${meta.label} gemessen`}
        >
          <span className="pressure-row__short">{meta.short}</span>
          <span className="pressure-row__name">{meta.label}</span>
        </Checkbox>

        <button
          ref={ref}
          type="button"
          className="pressure-row__value"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {/* The visible number needs no repetition of which pressure it is — the checkbox beside
              it says so — but the button's own name does, since a screen reader reads it alone. */}
          <span className="visually-hidden">{meta.label}: </span>
          {reading.measured
            ? `${text ?? formatValue(kind, reading.value)} ${meta.unit}`
            : 'nicht gemessen'}
        </button>
      </div>
    </div>
  )
}
