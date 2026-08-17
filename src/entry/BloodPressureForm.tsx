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
 * Correcting stays one value at a time, on the chart or in the editing sheet, which is what the
 * other reason for splitting them up actually needs: noticing afterwards that one of the three was
 * an artefact and fixing exactly that one.
 */

import { Checkbox } from 'antd'

import { BLOOD_PRESSURE_KINDS, VITALS, vitalAmount } from '../domain/catalog'
import { caseNow } from '../domain/entries'
import type { AnesthesiaCase } from '../domain/types'
import { formatValue } from '../format'
import { TimeField } from './EntryForm'
import { ValueField } from './ValueField'
import type { BloodPressureDraft, BloodPressureKind } from './draft'

export interface BloodPressureFormProps {
  record: AnesthesiaCase
  draft: BloodPressureDraft
  onChange: (draft: BloodPressureDraft) => void
}

export function BloodPressureForm({ record, draft, onChange }: BloodPressureFormProps) {
  function setReading(kind: BloodPressureKind, next: Partial<BloodPressureDraft['readings'][BloodPressureKind]>) {
    onChange({
      ...draft,
      readings: { ...draft.readings, [kind]: { ...draft.readings[kind], ...next } },
    })
  }

  return (
    <>
      <div className="pressure">
        {/* The reading in the notation it is written and spoken in, so what the sheet is about to
            store looks like what a monitor shows and what a protocol records. */}
        <output className="pressure__reading" htmlFor="pressure-bloodPressureSystolic">
          <span className="pressure__notation">{notation(draft)}</span>
          <span className="pressure__unit">mmHg</span>
        </output>

        {BLOOD_PRESSURE_KINDS.map((kind) => (
          <PressureRow
            key={kind}
            kind={kind}
            reading={draft.readings[kind]}
            onValue={(value) => setReading(kind, { value })}
            onMeasured={(measured) => setReading(kind, { measured })}
          />
        ))}
      </div>

      {/* One time for all three. It is the whole reason this is one sheet: the shared timestamp is
          what makes them one reading rather than three that landed near each other. */}
      <TimeField
        caption="Zeitpunkt"
        at={draft.at}
        min={record.startedAt}
        now={caseNow(record)}
        onChange={(at) => onChange({ ...draft, at })}
      />
    </>
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
 * One of the three, as a checkbox that names it, its own value, and the controls to set it.
 *
 * Switched off, the value stays where it was and only stops being written. Clearing it to zero
 * would mean re-finding the number after a mistaken tap, and zero is a real pressure the control
 * can otherwise reach.
 */
function PressureRow({
  kind,
  reading,
  onValue,
  onMeasured,
}: {
  kind: BloodPressureKind
  reading: { value: number; measured: boolean }
  onValue: (value: number) => void
  onMeasured: (measured: boolean) => void
}) {
  const meta = VITALS[kind]
  const id = `pressure-${kind}`

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

        <output className="pressure-row__value" htmlFor={id}>
          {reading.measured ? `${formatValue(kind, reading.value)} ${meta.unit}` : 'nicht gemessen'}
        </output>
      </div>

      <ValueField
        compact
        id={id}
        amount={vitalAmount(kind)}
        value={reading.value}
        disabled={!reading.measured}
        onChange={onValue}
      />
    </div>
  )
}
