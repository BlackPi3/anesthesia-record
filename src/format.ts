/** German formatting for times, dates and measured values. */

import { VITALS } from './domain/catalog'
import type { IsoDate, Timestamp, VitalKind } from './domain/types'

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatTime(value: Timestamp): string {
  return time.format(value)
}

export function formatDate(value: IsoDate | Timestamp): string {
  return date.format(typeof value === 'string' ? new Date(`${value}T00:00:00`) : value)
}

/** Value with the decimal places the metric uses, and a German decimal comma. */
export function formatValue(kind: VitalKind, value: number): string {
  return value.toFixed(VITALS[kind].decimals).replace('.', ',')
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace('.', ',')
}

/** Age in whole years at the time of the case. */
export function ageAt(dateOfBirth: IsoDate, on: IsoDate): number {
  const born = new Date(`${dateOfBirth}T00:00:00`)
  const at = new Date(`${on}T00:00:00`)
  const beforeBirthday =
    at.getMonth() < born.getMonth() ||
    (at.getMonth() === born.getMonth() && at.getDate() < born.getDate())
  return at.getFullYear() - born.getFullYear() - (beforeBirthday ? 1 : 0)
}
