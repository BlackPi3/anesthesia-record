/**
 * The value step of the entry flow: a large readout with a keypad under it.
 *
 * The number is typed. Whoever is filling this in is reading 133 off a monitor and already knows
 * the value, so the shortest path from what they know to what the record holds is three digits —
 * not a gesture that approximates it and then has to be corrected. That also makes the control
 * exact by construction, which a track never was: on most of these axes a pixel is worth more than
 * one unit.
 *
 * The readout is still the largest thing in the sheet, and still the only element that promises
 * what will be stored. It is also where a physical keyboard types, so on a desktop the whole entry
 * is `1` `3` `3` `Enter`-free — the digits land in the field the sheet opened on.
 *
 * The `−` / `+` keys survive from the old control. Typing is how a value is entered; a step is how
 * one already entered is moved by one, which is what most corrections are.
 *
 * Controlled, and holding only the digits: the parent owns the number. What the field keeps is the
 * half-typed string, which is not a number — `36,` has to be a legal state on the way to `36,5`.
 * See `digits.ts`.
 */

import { useEffect, useRef, useState } from 'react'

import type { AmountMeta } from '../domain/catalog'
import { formatNumber } from '../format'
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

export interface ValueFieldProps {
  /** What is being set: its name, unit, range and step. */
  amount: AmountMeta
  value: number
  onChange: (value: number) => void
  /**
   * Whether the readout takes focus on mount, so a desktop user can type straight away. The sheets
   * hand the drawer's own focus over to it; a picker step keeps it.
   */
  autoFocus?: boolean
}

export function ValueField({ amount: meta, value, onChange, autoFocus = true }: ValueFieldProps) {
  const [digits, setDigits] = useState<Digits>(null)
  const readout = useRef<HTMLDivElement>(null)

  // Focusing on arrival is a DOM side effect, and it is an effect rather than the `autoFocus`
  // attribute because that attribute does nothing on anything but a form control — and because the
  // sheet has told its drawer not to take the focus, there is nothing racing this for it.
  useEffect(() => {
    if (autoFocus) readout.current?.focus()
  }, [autoFocus])

  function press(key: Key) {
    const next = pressKey(digits, key, value, meta)
    setDigits(next)
    onChange(digitsValue(next, value, meta))
  }

  function step(direction: number) {
    // The digits are given up: the value moves by a step from wherever it is, and what is on
    // screen afterwards is that number rather than a half-typed one.
    setDigits(null)
    onChange(nudge(value, direction, meta))
  }

  return (
    <div className="value-field" onKeyDown={(event) => handleKey(event, press, step)}>
      {/* A spinbutton rather than a text input: there is a value, a range and a step, and the field
          takes digits without wanting the system keyboard on top of the sheet. */}
      <div
        ref={readout}
        className="value-field__readout"
        role="spinbutton"
        tabIndex={0}
        aria-label={meta.label}
        aria-valuenow={value}
        aria-valuemin={meta.min}
        aria-valuemax={meta.max}
        aria-valuetext={`${digitsText(digits, value, meta)} ${meta.unit}`}
      >
        <span className="value-field__number">{digitsText(digits, value, meta)}</span>
        <span className="value-field__unit">{meta.unit}</span>
      </div>

      <Range meta={meta} value={value} />

      <Keypad amount={meta} onKey={press} onStep={step} />
    </div>
  )
}

/**
 * The range the metric accepts, which is also why a value can be refused.
 *
 * Typing can only be stopped at the top — see `pressKey` — so a number below the minimum reaches
 * the field and has to be shown as wrong rather than silently corrected. `isComplete` is what
 * actually holds the sheet shut; this line is what says why.
 */
function Range({ meta, value }: { meta: AmountMeta; value: number }) {
  const out = value < meta.min || value > meta.max

  return (
    <p className={out ? 'value-field__range value-field__range--out' : 'value-field__range'}>
      {out && <span className="value-field__range-lead">Zulässig: </span>}
      {formatNumber(meta.min, meta.decimals)}–{formatNumber(meta.max, meta.decimals)} {meta.unit}
    </p>
  )
}

