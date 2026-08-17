/**
 * A number as it is being typed: the state behind the keypad, as plain functions.
 *
 * Typing is not the same as holding a number. `97` on its way to `975` is a different thing from
 * the number 97, and `36,` is not a number at all — so the field keeps the digits as a string while
 * they are being entered, and only the parsed value leaves it. `null` means nothing has been typed
 * yet and the field is showing the value it was handed, which is what makes the first digit replace
 * the opening value instead of appending to it. That is how a monitor, a calculator and a phone
 * keypad all behave, and it is what stops `97` + a tap on `9` from becoming `979`.
 *
 * Kept out of the components, for the same reason the timeline's coordinate maths is: this is the
 * part that is easy to get subtly wrong, and it is worth testing with strings and numbers rather
 * than through a rendered sheet. Nothing here renders — the one React name in the file is the type
 * of a keyboard event.
 *
 * German notation throughout — the decimal separator is a comma, here and in `format.ts`, because
 * that is what the record is written in.
 */

import type { AmountMeta } from '../domain/catalog'
import { formatNumber } from '../format'
import { clamp } from '../timeline/scales'

/** Digits typed so far, or `null` while the field still shows the value it was given. */
export type Digits = string | null

export const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** What one press of the keypad — or of a physical keyboard — can be. */
export type Key = (typeof DIGIT_KEYS)[number] | ',' | 'backspace'

/**
 * The next digits after a press, or the same ones when the press is not allowed.
 *
 * Only the upper bound is enforced while typing. Every multi-digit number passes through smaller
 * ones on the way — 133 is 1 then 13 first — so a lower bound cannot be applied to a half-typed
 * number without blocking the number it is on the way to. The maximum has no such problem, and it
 * catches the one typo a keypad makes easy: a stray extra digit. Values under the metric's minimum
 * are caught where they can be judged whole, in `isComplete`, which is what stops the sheet saving.
 */
export function pressKey(digits: Digits, key: Key, value: number, meta: AmountMeta): Digits {
  if (key === 'backspace') {
    // Deleting into a number that was never typed starts from what is on screen, so backspace
    // means the same thing whether or not the field has been touched yet.
    const base = digits ?? formatNumber(value, meta.decimals)
    return base.slice(0, -1)
  }

  if (key === ',') {
    if (meta.decimals === 0) return digits
    const base = digits ?? ''
    if (base.includes(',')) return digits
    // A bare comma is not a number anyone writes; a decimal opens on a leading zero.
    return `${base === '' ? '0' : base},`
  }

  // A leading zero is replaced rather than kept: `0` then `5` is 5, not 05.
  const base = digits === null || digits === '0' ? '' : digits

  const comma = base.indexOf(',')
  if (comma !== -1 && base.length - comma - 1 >= meta.decimals) return digits

  const next = base + key
  return parse(next, meta) > meta.max ? digits : next
}

/** The number the field currently holds. */
export function digitsValue(digits: Digits, value: number, meta: AmountMeta): number {
  return digits === null ? value : parse(digits, meta)
}

/**
 * What the readout says.
 *
 * Deleting the last digit shows `0` rather than an empty box: the field always names a number,
 * and zero is both what it now holds and what the next digit will replace.
 */
export function digitsText(digits: Digits, value: number, meta: AmountMeta): string {
  if (digits === null) return formatNumber(value, meta.decimals)
  return digits === '' ? '0' : digits
}

/**
 * The key a physical keyboard press means, or `null` for anything the field does not handle.
 *
 * A full-size keyboard has both separators on it and a numeric keypad puts a full stop under the
 * thumb, so both are taken as the decimal comma. Anything else — Tab, Escape, shortcuts — is left
 * alone rather than swallowed.
 */
export function keyFor(key: string): Key | null {
  if (key === 'Backspace' || key === 'Delete') return 'backspace'
  if (key === ',' || key === '.') return ','
  return (DIGIT_KEYS as readonly string[]).includes(key) ? (key as Key) : null
}

/**
 * One step of the metric, from the `−` / `+` keys or the arrow keys.
 *
 * Rounded to the metric's decimal places rather than snapped to a multiple of the step: a typed 12
 * µg is a real dose, and stepping it must give 17 rather than dragging it back onto a grid of fives
 * the keypad never imposed. For every vital the step *is* one decimal place, so a value stepped
 * here and a value dragged on the chart still round identically.
 *
 * Bounded at the top by the metric and at the bottom by zero, which is as far down as any quantity
 * here goes. The metric's own minimum is not applied, for the reason `pressKey` gives: a value
 * typed below it has to be steppable back up one at a time, not snapped up to it.
 */
export function nudge(value: number, direction: number, meta: AmountMeta): number {
  const next = clamp(value + direction * meta.step, 0, meta.max)
  return Number(next.toFixed(meta.decimals))
}

/**
 * A physical keyboard press, routed to the same two things the keypad does.
 *
 * Bound to the whole field rather than to its readout, so typing keeps working after a key has been
 * pressed with a mouse and taken the focus. Anything not handled is left alone: Tab, Escape and
 * Ctrl+Z belong to the sheet and to the app, not to this field.
 */
export function handleKey(
  event: React.KeyboardEvent,
  press: (key: Key) => void,
  step: (direction: number) => void,
) {
  if (event.ctrlKey || event.metaKey || event.altKey) return

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    return step(event.key === 'ArrowUp' ? 1 : -1)
  }

  const key = keyFor(event.key)
  if (key === null) return

  event.preventDefault()
  press(key)
}

/** Reads the typed string as a number, trimmed to the places the metric uses. */
function parse(text: string, meta: AmountMeta): number {
  const parsed = Number(text.replace(',', '.'))
  return Number.isFinite(parsed) ? Number(parsed.toFixed(meta.decimals)) : 0
}
