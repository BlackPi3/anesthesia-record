/**
 * The keypad: the number is typed, not dialled.
 *
 * This replaced a coarse track plus steppers. A track is a guess that has to be corrected — a pixel
 * is worth more than one unit on most of these axes — and correcting a guess is slower than saying
 * the number outright. A clinician reading 133 off a monitor already knows the value; the fastest
 * and most exact thing the sheet can do is take those three digits.
 *
 * It is an in-app keypad rather than a text input, and that is the whole point on an iPad. The
 * sheet is a drawer at the bottom of the screen, which is exactly where the system keyboard opens:
 * a focused input would put the keyboard over the form it belongs to and reflow the page under a
 * thumb that is already moving. This keypad is always in the same place, at a size a gloved
 * fingertip hits, and it works identically on desktop — where a physical keyboard also types
 * straight into the field.
 *
 * The `−` / `+` keys stay. Typing is how a number is entered; stepping is how a number already
 * entered is corrected by one, which is the common shape of a correction and would otherwise cost
 * retyping the whole value.
 *
 * Presentational: it holds no number and no digits. What a press means is `digits.ts`, and who it
 * applies to is the field that renders it — which is what lets the blood pressure sheet point one
 * keypad at whichever of its three numbers is selected.
 */

import { Button } from 'antd'

import type { AmountMeta } from '../domain/catalog'
import type { Key } from './digits'

export interface KeypadProps {
  /** What is being typed: names the `−` / `+` keys and says whether there is a decimal place. */
  amount: AmountMeta
  onKey: (key: Key) => void
  /** One step of the metric, in either direction. */
  onStep: (direction: number) => void
}

export function Keypad({ amount, onKey, onStep }: KeypadProps) {
  const decimal = amount.decimals > 0

  return (
    <div className="keypad">
      {['1', '2', '3'].map((digit) => (
        <Digit key={digit} digit={digit} onKey={onKey} />
      ))}
      <Button size="large" onClick={() => onStep(-1)} aria-label={`${amount.label} verringern`}>
        −
      </Button>

      {['4', '5', '6'].map((digit) => (
        <Digit key={digit} digit={digit} onKey={onKey} />
      ))}
      <Button size="large" onClick={() => onStep(1)} aria-label={`${amount.label} erhöhen`}>
        +
      </Button>

      {['7', '8', '9'].map((digit) => (
        <Digit key={digit} digit={digit} onKey={onKey} />
      ))}
      {/* Two rows tall and in the corner a thumb rests on: deleting a mistyped digit is the most
          pressed key here after the digits themselves. */}
      <Button
        size="large"
        className="keypad__key--tall"
        onClick={() => onKey('backspace')}
        aria-label="Ziffer löschen"
      >
        ⌫
      </Button>

      {decimal && <Digit digit="," onKey={onKey} label="Komma" />}
      <Button
        size="large"
        // Zero takes the width the decimal key does not, so the bottom row stays full either way.
        className={decimal ? 'keypad__key--wide' : 'keypad__key--widest'}
        onClick={() => onKey('0')}
      >
        0
      </Button>
    </div>
  )
}

/** One digit key. The character is its own label, except for the comma, which is not read out. */
function Digit({ digit, onKey, label }: { digit: string; onKey: (key: Key) => void; label?: string }) {
  return (
    <Button size="large" onClick={() => onKey(digit as Key)} aria-label={label}>
      {digit}
    </Button>
  )
}
