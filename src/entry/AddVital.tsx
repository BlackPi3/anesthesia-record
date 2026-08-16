/**
 * Creating a vital measurement: the "+" button and the sheet it opens.
 *
 * Two steps, deliberately, rather than one dense form. Picking the metric is a glance-and-tap
 * decision and picking the value is a careful one; putting both on screen at once makes the
 * careful half compete with a six-way choice it has already finished with. The sheet opens on the
 * metric grid and replaces it with the value control, so whichever step is live owns the screen.
 *
 * The timestamp defaults to now and is adjustable, per docs/decisions.md. `caseNow` decides what
 * "now" means, which is not always the wall clock — see the note there.
 *
 * The value opens on the last reading for that metric rather than at the middle of the scale.
 * Vitals move gradually, so the previous value is usually within a step or two of the new one,
 * and starting there turns most entries into a tap or two instead of a hunt across the range.
 */

import { useState } from 'react'
import { Button, Drawer } from 'antd'

import { VITALS, VITAL_ORDER, laneForVital } from '../domain/catalog'
import { caseNow, vitalSeries } from '../domain/entries'
import type { AnesthesiaCase, Timestamp, VitalKind } from '../domain/types'
import { formatTime } from '../format'
import { laneColor } from '../theme'
import { clamp, snapToStep } from '../timeline/scales'
import { ValueField } from './ValueField'

/** Offsets, in minutes, offered for adjusting the timestamp. */
const TIME_STEPS = [-5, -1, 1, 5] as const

export interface AddVitalProps {
  record: AnesthesiaCase
  onAdd: (draft: { vital: VitalKind; at: Timestamp; value: number }) => void
}

/** Where the value control opens: the last reading of this metric, else the middle of the axis. */
function startingValue(record: AnesthesiaCase, kind: VitalKind): number {
  const series = vitalSeries(record, kind)
  if (series.length > 0) return series[series.length - 1].value

  const [min, max] = VITALS[kind].plotRange
  return snapToStep((min + max) / 2, VITALS[kind].step)
}

export function AddVital({ record, onAdd }: AddVitalProps) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<VitalKind | null>(null)
  const [value, setValue] = useState(0)
  const [at, setAt] = useState<Timestamp>(record.startedAt)

  function start() {
    // Reset on open, not on close: a sheet that rebuilds its state as it disappears animates the
    // reset in front of the user.
    setKind(null)
    setAt(caseNow(record))
    setOpen(true)
  }

  function pick(next: VitalKind) {
    setKind(next)
    setValue(startingValue(record, next))
  }

  function commit() {
    if (kind === null) return
    onAdd({ vital: kind, at, value })
    setOpen(false)
  }

  const meta = kind === null ? null : VITALS[kind]

  return (
    <>
      <Button type="primary" size="large" className="add-vital__open" onClick={start}>
        + Wert erfassen
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        height="auto"
        title={meta === null ? 'Wert erfassen' : meta.label}
        className="add-vital"
        // The step back has to sit where a thumb already is, not only in the title bar.
        footer={
          meta === null ? null : (
            <div className="add-vital__footer">
              <Button size="large" onClick={() => setKind(null)}>
                Zurück
              </Button>
              <Button size="large" type="primary" onClick={commit}>
                Übernehmen
              </Button>
            </div>
          )
        }
      >
        <div className="add-vital__body">
          {kind === null || meta === null ? (
            <MetricPicker onPick={pick} />
          ) : (
            <>
              <ValueField kind={kind} value={value} onChange={setValue} />
              <TimeField record={record} at={at} onChange={setAt} />
            </>
          )}
        </div>
      </Drawer>
    </>
  )
}

/**
 * The six metrics as a grid of large targets, each carrying the colour of the lane it will be
 * drawn in, so the choice made here and the point that appears on the chart are visibly the same
 * thing. The colour is an accent on a bordered tile, never the only thing distinguishing one tile
 * from another — the label does that.
 */
function MetricPicker({ onPick }: { onPick: (kind: VitalKind) => void }) {
  return (
    <div className="metric-picker" role="group" aria-label="Vitalparameter auswählen">
      {VITAL_ORDER.map((kind) => {
        const meta = VITALS[kind]
        return (
          <button
            key={kind}
            type="button"
            className="metric-picker__item"
            style={{ '--accent': laneColor[laneForVital(kind).id] } as React.CSSProperties}
            onClick={() => onPick(kind)}
          >
            <span className="metric-picker__short">{meta.short}</span>
            <span className="metric-picker__label">{meta.label}</span>
            <span className="metric-picker__unit">{meta.unit}</span>
          </button>
        )
      })}
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
function TimeField({
  record,
  at,
  onChange,
}: {
  record: AnesthesiaCase
  at: Timestamp
  onChange: (at: Timestamp) => void
}) {
  // A measurement cannot predate the case it belongs to. There is no upper bound: documenting
  // ahead of the clock is a mistake worth allowing, since correcting it is one drag.
  const shift = (minutes: number) =>
    onChange(clamp(at + minutes * 60_000, record.startedAt, Number.MAX_SAFE_INTEGER))

  return (
    <div className="time-field">
      <div className="time-field__head">
        <span className="time-field__caption">Zeitpunkt</span>
        <output className="time-field__clock">{formatTime(at)}</output>
      </div>

      <div className="time-field__steps">
        {TIME_STEPS.map((minutes) => (
          <Button
            key={minutes}
            size="large"
            onClick={() => shift(minutes)}
            disabled={minutes < 0 && at + minutes * 60_000 < record.startedAt}
            aria-label={
              minutes < 0 ? `${-minutes} Minuten früher` : `${minutes} Minuten später`
            }
          >
            {minutes > 0 ? `+${minutes}` : `−${-minutes}`}
          </Button>
        ))}
        <Button size="large" onClick={() => onChange(caseNow(record))}>
          Jetzt
        </Button>
      </div>
    </div>
  )
}
