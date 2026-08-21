/**
 * Compact case context. Everything an anesthesiologist confirms at a glance and then stops
 * looking at, so it stays on one or two lines and never competes with the timeline.
 *
 * The facts are a description list that wraps, not AntD's `Descriptions`. That component lays out
 * a fixed grid, and at iPad width its columns became narrow enough to break values mid-word
 * ("Peni | cillin", "22.04.196 | 8"). A wrapping row keeps each fact whole and simply moves it to
 * the next line, which is the behaviour a header needs across two very different form factors.
 *
 * The demo badge is deliberate and permanent: this app holds fictional data, and nothing about
 * the layout should let it be mistaken for a real record.
 */

import { Button, Tag, Typography } from 'antd'

import { PHASE_EVENTS } from './domain/catalog'
import { phaseEvents } from './domain/entries'
import type { AnesthesiaCase } from './domain/types'
import { ageAt, formatDate, formatNumber, formatTime } from './format'
import type { SaveState } from './useCase'

const SEX_LABEL: Record<AnesthesiaCase['patient']['sex'], string> = {
  w: 'weiblich',
  m: 'männlich',
  d: 'divers',
}

/**
 * Save confirmation, in the header where it is visible without being in the way.
 *
 * It reports a fact, not an intention: the write to local storage has already completed by the
 * time this renders. A failure has to be loud, because a record that quietly stopped persisting
 * is the worst outcome this app has.
 */
function SaveStatus({ save }: { save: SaveState }) {
  if (save.status === 'clean') return null

  if (save.status === 'error') {
    return (
      <Typography.Text type="danger" role="alert" style={{ fontSize: 13 }}>
        Nicht gespeichert: {save.message}
      </Typography.Text>
    )
  }

  return (
    <Typography.Text type="success" role="status" style={{ fontSize: 13 }}>
      Gespeichert {formatTime(save.at)}
    </Typography.Text>
  )
}

export interface CaseHeaderProps {
  record: AnesthesiaCase
  save: SaveState
  canUndo: boolean
  onUndo: () => void
  onReset: () => void
}

export function CaseHeader({ record, save, canUndo, onUndo, onReset }: CaseHeaderProps) {
  const { patient, baseline } = record

  /**
   * The last milestone documented, and when. It is a restatement of what is in the record — the
   * newest entry in the Ereignisse band — and never an inference about the patient: nothing here
   * decides that a case is "running" or "finished", it says which phase was written down last.
   *
   * It earns the first position because it is the only fact in this header that changes during a
   * case, and because without it the record does not say where it is. Reading one at a glance,
   * with vitals stopping at 09:40 and no phase named, is a case apparently still in theatre; the
   * same record saying „Entlassung · 09:45“ is a case that is over. That was a real misreading,
   * not a hypothetical one.
   */
  const phases = phaseEvents(record)
  const latest = phases.at(-1)

  const facts: Array<[label: string, value: string]> = [
    [
      'Phase',
      latest === undefined
        ? 'noch nichts dokumentiert'
        : `${PHASE_EVENTS[latest.event].label} · ${formatTime(latest.at)}`,
    ],
    ['Datum', formatDate(record.date)],
    [
      'Geburtsdatum',
      `${formatDate(patient.dateOfBirth)} (${ageAt(patient.dateOfBirth, record.date)} J.)`,
    ],
    ['Geschlecht', SEX_LABEL[patient.sex]],
    [
      'Größe / Gewicht',
      `${formatNumber(patient.heightCm)} cm / ${formatNumber(patient.weightKg)} kg`,
    ],
    ['ASA', `${patient.asa}`],
    [
      'Ausgangswerte',
      `RR ${baseline.bloodPressureSystolic}/${baseline.bloodPressureDiastolic} mmHg · HF ${baseline.heartRate}/min`,
    ],
    ['Allergien', patient.allergies.length > 0 ? patient.allergies.join(', ') : 'keine bekannt'],
  ]

  return (
    <header className="case-header">
      <div className="case-header__title">
        <Typography.Title level={1} style={{ fontSize: 20, margin: 0 }}>
          {patient.lastName}, {patient.firstName}
        </Typography.Title>
        <Typography.Text type="secondary">{record.procedure}</Typography.Text>
        <Tag bordered>Demodaten</Tag>
        {/* Undo sits beside the save confirmation, because the two answer the same question from
            opposite sides: what was just written down, and how to take it back. Always present and
            disabled when there is nothing to undo, rather than appearing and disappearing — a
            control that comes and goes is one nobody learns is there. */}
        <span className="case-header__actions">
          <Button
            size="large"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Letzte Änderung rückgängig machen"
            aria-keyshortcuts="Control+Z Meta+Z"
          >
            Rückgängig
          </Button>
          {/* Puts the demo case back the way it ships, discarding whatever was entered while
              trying the app out. It belongs beside the „Demodaten“ tag because it is part of the
              same statement: this record is a sample, and a sample has to be returnable to its
              starting state or the next person testing on the same device inherits the last
              person's entries.

              It asks nothing first. Resetting goes through the same update path as every other
              change, so „Rückgängig“ takes it back — which is the app's answer to destructive
              actions everywhere else, and there is no reason for this one to be different. */}
          <Button size="large" onClick={onReset}>
            Demodaten zurücksetzen
          </Button>
          <SaveStatus save={save} />
        </span>
      </div>

      <dl className="case-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="case-facts__item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}
