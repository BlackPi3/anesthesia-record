/**
 * The keypad's typing rules, tested as strings and numbers rather than through a rendered sheet.
 *
 * These are the cases that decide whether a documented value is the one the user meant: what the
 * first digit does to the number already on screen, what the maximum refuses, and what a decimal
 * comma is allowed to be part-way through.
 */

import { describe, expect, it } from 'vitest'

import { bolusAmount, vitalAmount } from '../domain/catalog'
import { digitsText, digitsValue, keyFor, nudge, pressKey } from './digits'

const spo2 = vitalAmount('spo2')
const temperature = vitalAmount('temperature')
const systolic = vitalAmount('bloodPressureSystolic')

describe('pressKey', () => {
  it('replaces the opening value with the first digit rather than appending to it', () => {
    // The field opened on the last saturation in the case; 9 has to mean 9, not 979.
    expect(pressKey(null, '9', 97, spo2)).toBe('9')
  })

  it('appends every digit after the first', () => {
    expect(pressKey('1', '3', 97, systolic)).toBe('13')
    expect(pressKey('13', '3', 97, systolic)).toBe('133')
  })

  it('refuses a digit that would carry the value past the maximum', () => {
    // 100 % is the top of the saturation range, so the third digit of 1005 never lands.
    expect(pressKey('100', '5', 97, spo2)).toBe('100')
    expect(pressKey('30', '1', 120, systolic)).toBe('30')
  })

  it('allows the digits of a number on its way through the minimum', () => {
    // 4 is below the saturation minimum of 50 and is still how 45 starts. `isComplete` judges the
    // finished number; typing may not.
    expect(pressKey(null, '4', 97, spo2)).toBe('4')
    expect(digitsValue(pressKey('4', '5', 97, spo2), 97, spo2)).toBe(45)
  })

  it('replaces a leading zero instead of keeping it', () => {
    expect(pressKey('0', '5', 0, bolusAmount('mg'))).toBe('5')
  })

  it('takes a decimal comma only where the metric has decimals', () => {
    expect(pressKey('36', ',', 36.5, temperature)).toBe('36,')
    expect(pressKey('36,', '5', 36.5, temperature)).toBe('36,5')

    expect(pressKey('97', ',', 97, spo2)).toBe('97')
  })

  it('refuses a second comma and more decimals than the metric holds', () => {
    expect(pressKey('36,5', ',', 36.5, temperature)).toBe('36,5')
    expect(pressKey('36,5', '4', 36.5, temperature)).toBe('36,5')
  })

  it('opens a decimal typed on its own with a zero', () => {
    expect(pressKey(null, ',', 36.5, temperature)).toBe('0,')
  })

  it('deletes into the value on screen when nothing has been typed yet', () => {
    expect(pressKey(null, 'backspace', 97, spo2)).toBe('9')
    expect(pressKey(null, 'backspace', 36.5, temperature)).toBe('36,')
  })

  it('deletes the last digit typed', () => {
    expect(pressKey('133', 'backspace', 120, systolic)).toBe('13')
    expect(pressKey('1', 'backspace', 120, systolic)).toBe('')
  })
})

describe('digitsValue', () => {
  it('gives back the value it was handed while nothing is typed', () => {
    expect(digitsValue(null, 97, spo2)).toBe(97)
  })

  it('reads the German decimal comma', () => {
    expect(digitsValue('36,7', 36.5, temperature)).toBe(36.7)
  })

  it('reads a half-typed decimal as the whole number so far', () => {
    expect(digitsValue('36,', 36.5, temperature)).toBe(36)
  })

  it('reads an emptied field as zero, which no vital range accepts', () => {
    expect(digitsValue('', 97, spo2)).toBe(0)
  })
})

describe('digitsText', () => {
  it('formats the untouched value with the metric decimals', () => {
    expect(digitsText(null, 36.5, temperature)).toBe('36,5')
    expect(digitsText(null, 97, spo2)).toBe('97')
  })

  it('shows what is being typed, including a trailing comma', () => {
    expect(digitsText('36,', 36.5, temperature)).toBe('36,')
  })

  it('names a number even when every digit has been deleted', () => {
    expect(digitsText('', 97, spo2)).toBe('0')
  })
})

describe('nudge', () => {
  it('moves by the metric step', () => {
    expect(nudge(97, 1, spo2)).toBe(98)
    expect(nudge(97, -1, spo2)).toBe(96)
  })

  it('leaves no floating-point dust behind on a decimal metric', () => {
    expect(nudge(36.5, 1, temperature)).toBe(36.6)
    expect(String(nudge(36.5, 1, temperature))).toBe('36.6')
  })

  it('keeps a typed value off the step grid instead of snapping it onto one', () => {
    // µg doses step in fives. 12 µg was typed and is a real dose; stepping it is 17, not 15.
    expect(nudge(12, 1, bolusAmount('µg'))).toBe(17)
  })

  it('steps a value typed below the minimum back up one at a time', () => {
    expect(nudge(45, 1, spo2)).toBe(46)
  })

  it('stops at the metric maximum and at zero', () => {
    expect(nudge(100, 1, spo2)).toBe(100)
    expect(nudge(0, -1, bolusAmount('mg'))).toBe(0)
  })
})

describe('keyFor', () => {
  it('takes digits, both decimal separators and both delete keys', () => {
    expect(keyFor('7')).toBe('7')
    expect(keyFor(',')).toBe(',')
    expect(keyFor('.')).toBe(',')
    expect(keyFor('Backspace')).toBe('backspace')
    expect(keyFor('Delete')).toBe('backspace')
  })

  it('leaves everything else to the sheet and the app', () => {
    expect(keyFor('Escape')).toBeNull()
    expect(keyFor('Tab')).toBeNull()
    expect(keyFor('z')).toBeNull()
  })
})
