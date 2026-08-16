/**
 * The value step of the entry flow: a large readout, coarse and fine controls beside it.
 *
 * The lesson from the drag correction drives the whole shape of this. A pixel is worth more than
 * one unit on most of these axes, so no continuous gesture is precise on its own. What makes a
 * gesture exact is the pairing: something coarse to get close, something discrete to land, and a
 * readout that names the number the whole time. The track is the coarse half, the −/+ buttons are
 * the fine half, and the readout is what turns "about there" into 97 %.
 *
 * This is a controlled component: it keeps no value of its own, and renders exactly what it is
 * given. The parent owns the number, which is what lets the same control serve entry now and
 * correction later without either of them holding a second, drifting copy.
 *
 * `clamp` and `snapToStep` come from the timeline's scale maths deliberately, rather than being
 * written again here. A value typed in and a value dragged on the chart must round identically —
 * if they did not, correcting a point could change it without the user asking.
 */

import { Button, Slider } from 'antd'

import { VITALS } from '../domain/catalog'
import type { VitalKind } from '../domain/types'
import { formatNumber, formatValue } from '../format'
import { clamp, snapToStep } from '../timeline/scales'

export interface ValueFieldProps {
  kind: VitalKind
  value: number
  onChange: (value: number) => void
}

export function ValueField({ kind, value, onChange }: ValueFieldProps) {
  const meta = VITALS[kind]
  const [min, max] = meta.inputRange

  function nudge(direction: number) {
    onChange(snapToStep(clamp(value + direction * meta.step, min, max), meta.step))
  }

  return (
    <div className="value-field">
      {/* `output` is the element for a value the interface computed, and it announces changes to
          a screen reader without a live region of our own. */}
      <output className="value-field__readout" htmlFor="value-field-slider">
        <span className="value-field__number">{formatValue(kind, value)}</span>
        <span className="value-field__unit">{meta.unit}</span>
      </output>

      <div className="value-field__controls">
        <Button
          size="large"
          className="value-field__step"
          onClick={() => nudge(-1)}
          disabled={value <= min}
          aria-label={`${meta.label} verringern`}
        >
          −
        </Button>

        <Slider
          id="value-field-slider"
          className="value-field__track"
          min={min}
          max={max}
          step={meta.step}
          value={value}
          onChange={onChange}
          // The readout already names the value, permanently and in a size that can be read at
          // arm's length. A tooltip would repeat it, smaller, under a fingertip.
          tooltip={{ open: false }}
          aria-label={`${meta.label} grob einstellen`}
        />

        <Button
          size="large"
          className="value-field__step"
          onClick={() => nudge(1)}
          disabled={value >= max}
          aria-label={`${meta.label} erhöhen`}
        >
          +
        </Button>
      </div>

      <div className="value-field__bounds" aria-hidden="true">
        <span>{formatNumber(min, meta.decimals)}</span>
        <span>{formatNumber(max, meta.decimals)}</span>
      </div>
    </div>
  )
}
