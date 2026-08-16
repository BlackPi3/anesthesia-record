/**
 * The body of the entry sheet: whatever the draft needs set, and the time it happened.
 *
 * Controlled, like `ValueField` and for the same reason. It holds no draft of its own and reports
 * every change upward, so the sheet that opened it owns the one copy — a form that kept its own
 * would drift from the entry it is correcting the moment anything else touched the record.
 *
 * Each entry type gets only the controls it has. A milestone is a time and nothing else, and
 * padding it out with disabled fields to match the others would make the fastest entry in the app
 * look like the slowest.
 */

import { Button, Segmented } from 'antd'

import {
  BOLUS_UNITS,
  INFUSION_UNITS,
  bolusAmount,
  infusionAmount,
  vitalAmount,
} from '../domain/catalog'
import { caseNow } from '../domain/entries'
import type { AnesthesiaCase, BolusUnit, InfusionRateUnit, Timestamp } from '../domain/types'
import { formatTime } from '../format'
import { clamp } from '../timeline/scales'
import { ValueField } from './ValueField'
import { draftTime, withTime, type Draft } from './draft'

/** Offsets, in minutes, offered for adjusting a timestamp. */
const TIME_STEPS = [-5, -1, 1, 5] as const

export interface EntryFormProps {
  record: AnesthesiaCase
  draft: Draft
  onChange: (draft: Draft) => void
}

export function EntryForm({ record, draft, onChange }: EntryFormProps) {
  return (
    <>
      {draft.type === 'vital' && (
        <ValueField
          amount={vitalAmount(draft.vital)}
          value={draft.value}
          onChange={(value) => onChange({ ...draft, value })}
        />
      )}

      {draft.type === 'bolus' && (
        <>
          <ValueField
            amount={bolusAmount(draft.unit)}
            value={draft.dose}
            onChange={(dose) => onChange({ ...draft, dose })}
          />
          <UnitPicker
            label="Einheit"
            units={BOLUS_UNITS}
            unit={draft.unit}
            // The number is not converted with the unit. 200 mg and 200 µg are different doses,
            // and an app that quietly rescaled one into the other would be changing a documented
            // dose on the user's behalf.
            onChange={(unit: BolusUnit) => onChange({ ...draft, unit })}
          />
        </>
      )}

      {draft.type === 'infusion' && (
        <>
          <ValueField
            amount={infusionAmount(draft.unit)}
            value={draft.rate}
            onChange={(rate) => onChange({ ...draft, rate })}
          />
          <UnitPicker
            label="Einheit"
            units={INFUSION_UNITS}
            unit={draft.unit}
            onChange={(unit: InfusionRateUnit) => onChange({ ...draft, unit })}
          />
        </>
      )}

      <TimeField
        caption={draft.type === 'infusion' ? 'Beginn' : 'Zeitpunkt'}
        at={draftTime(draft)}
        min={record.startedAt}
        now={caseNow(record)}
        onChange={(at) => onChange(withTime(draft, at))}
      />

      {draft.type === 'infusion' && (
        <InfusionEnd
          draft={draft}
          now={caseNow(record)}
          onChange={(endedAt) => onChange({ ...draft, endedAt })}
        />
      )}
    </>
  )
}

/**
 * The unit, as a row of choices rather than a dropdown. There are three or four of them, they are
 * short, and a dropdown would hide the alternatives behind a tap on a screen with room to show
 * them.
 */
function UnitPicker<Unit extends string>({
  label,
  units,
  unit,
  onChange,
}: {
  label: string
  units: Unit[]
  unit: Unit
  onChange: (unit: Unit) => void
}) {
  return (
    <div className="unit-picker">
      <span className="unit-picker__caption" id="unit-picker-label">
        {label}
      </span>
      <Segmented
        size="large"
        options={units}
        value={unit}
        onChange={(next) => onChange(next as Unit)}
        aria-labelledby="unit-picker-label"
      />
    </div>
  )
}

/**
 * The timestamp, with whole-minute offsets either side of it.
 *
 * Minutes are the resolution that matters here: a protocol is read against a five-minute grid, and
 * nobody documents a saturation to the second. Anything finer is available afterwards by dragging
 * the point along the time axis, which is already built.
 */
export function TimeField({
  caption,
  at,
  min,
  now,
  onChange,
}: {
  caption: string
  at: Timestamp
  min: Timestamp
  now: Timestamp
  onChange: (at: Timestamp) => void
}) {
  // An entry cannot predate the case it belongs to. There is no upper bound: documenting ahead of
  // the clock is a mistake worth allowing, since correcting it is one drag.
  const shift = (minutes: number) =>
    onChange(clamp(at + minutes * 60_000, min, Number.MAX_SAFE_INTEGER))

  return (
    <div className="time-field">
      <div className="time-field__head">
        <span className="time-field__caption">{caption}</span>
        <output className="time-field__clock">{formatTime(at)}</output>
      </div>

      <div className="time-field__steps">
        {TIME_STEPS.map((minutes) => (
          <Button
            key={minutes}
            size="large"
            onClick={() => shift(minutes)}
            disabled={minutes < 0 && at + minutes * 60_000 < min}
            aria-label={minutes < 0 ? `${-minutes} Minuten früher` : `${minutes} Minuten später`}
          >
            {minutes > 0 ? `+${minutes}` : `−${-minutes}`}
          </Button>
        ))}
        <Button size="large" onClick={() => onChange(now)}>
          Jetzt
        </Button>
      </div>
    </div>
  )
}

/**
 * When the infusion stopped, or that it has not.
 *
 * "läuft" is a state the record has to be able to hold, not missing data: an infusion running at
 * the moment of documentation is the normal case, and forcing an end time would mean writing down
 * something that has not happened. So the end is explicitly nullable, and clearing it back to
 * running is one tap.
 */
function InfusionEnd({
  draft,
  now,
  onChange,
}: {
  draft: Extract<Draft, { type: 'infusion' }>
  now: Timestamp
  onChange: (endedAt: Timestamp | null) => void
}) {
  if (draft.endedAt === null) {
    return (
      <div className="time-field">
        <div className="time-field__head">
          <span className="time-field__caption">Ende</span>
          <output className="time-field__clock time-field__clock--running">läuft</output>
        </div>
        <div className="time-field__steps">
          <Button size="large" onClick={() => onChange(now)}>
            Jetzt beenden
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <TimeField
        caption="Ende"
        at={draft.endedAt}
        // An infusion cannot stop before it started.
        min={draft.startedAt}
        now={now}
        onChange={onChange}
      />
      <div className="time-field__steps">
        <Button size="large" onClick={() => onChange(null)}>
          Läuft weiter
        </Button>
      </div>
    </>
  )
}
