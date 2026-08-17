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
 * It takes an `AmountMeta` rather than a `VitalKind`, so a dose and an infusion rate get the same
 * control as a saturation. They are the same problem — a number in a range, moved coarsely and
 * then landed exactly — and the reasoning above applies to all three unchanged.
 *
 * `clamp` and `snapToStep` come from the timeline's scale maths deliberately, rather than being
 * written again here. A value typed in and a value dragged on the chart must round identically —
 * if they did not, correcting a point could change it without the user asking.
 */

import { Button, Slider } from 'antd'

import type { AmountMeta } from '../domain/catalog'
import { formatNumber } from '../format'
import { clamp, snapToStep } from '../timeline/scales'

export interface ValueFieldProps {
  /** What is being set: its name, unit, range and step. */
  amount: AmountMeta
  value: number
  onChange: (value: number) => void
  /**
   * The slider's id, which the readout points at. Defaulted because most sheets hold one of these;
   * a sheet holding several has to name them apart, or every readout would label the first slider.
   */
  id?: string
  /**
   * Controls only, with the caller printing the number itself.
   *
   * A blood pressure sheet holds three of these, and three 56px readouts do not fit on an iPad —
   * nor should they, because the three numbers are one reading and belong under one heading. The
   * promise the full control makes still holds at the level of the screen: the number being set is
   * on it, large, the whole time.
   */
  compact?: boolean
  /** A value that exists but is not going to be written, such as a mean no cuff measured. */
  disabled?: boolean
}

export function ValueField({
  amount: meta,
  value,
  onChange,
  id = 'value-field-slider',
  compact = false,
  disabled = false,
}: ValueFieldProps) {
  const { min, max } = meta

  function nudge(direction: number) {
    onChange(snapToStep(clamp(value + direction * meta.step, min, max), meta.step))
  }

  return (
    <div className={compact ? 'value-field value-field--compact' : 'value-field'}>
      {/* `output` is the element for a value the interface computed, and it announces changes to
          a screen reader without a live region of our own. */}
      {!compact && (
        <output className="value-field__readout" htmlFor={id}>
          <span className="value-field__number">{formatNumber(value, meta.decimals)}</span>
          <span className="value-field__unit">{meta.unit}</span>
        </output>
      )}

      <div className="value-field__controls">
        <Button
          size="large"
          className="value-field__step"
          onClick={() => nudge(-1)}
          disabled={disabled || value <= min}
          aria-label={`${meta.label} verringern`}
        >
          −
        </Button>

        <Slider
          id={id}
          className="value-field__track"
          min={min}
          max={max}
          step={meta.step}
          value={value}
          onChange={onChange}
          disabled={disabled}
          // The readout already names the value, permanently and in a size that can be read at
          // arm's length. A tooltip would repeat it, smaller, under a fingertip.
          tooltip={{ open: false }}
          aria-label={`${meta.label} grob einstellen`}
        />

        <Button
          size="large"
          className="value-field__step"
          onClick={() => nudge(1)}
          disabled={disabled || value >= max}
          aria-label={`${meta.label} erhöhen`}
        >
          +
        </Button>
      </div>

      {!compact && (
        <div className="value-field__bounds" aria-hidden="true">
          <span>{formatNumber(min, meta.decimals)}</span>
          <span>{formatNumber(max, meta.decimals)}</span>
        </div>
      )}
    </div>
  )
}
